import type { FileRecord } from "../repo/discover.js";
import { EXTRACTOR_VERSION } from "../version.js";
import type { Db } from "./db.js";

export type SymbolKind =
  | "file"
  | "module"
  | "class"
  | "interface"
  | "type"
  | "enum"
  | "function"
  | "method"
  | "property"
  | "variable"
  | "test";

export type Tier =
  | "COMPILER"
  | "LEXICAL"
  | "HEURISTIC"
  | "EXTERNAL"
  | "UNRESOLVED";

export type EdgeKind =
  | "CONTAINS"
  | "IMPORTS"
  | "CALLS"
  | "REFERENCES"
  | "IMPLEMENTS"
  | "INHERITS"
  | "TESTS";

export interface SymbolRow {
  stableKey: string;
  filePath: string;
  qualifiedName: string;
  shortName: string;
  kind: SymbolKind;
  signature: string | null;
  startByte: number;
  endByte: number;
  startLine: number;
  endLine: number;
  bodyHash: string | null;
  exported: boolean;
  isTest: boolean;
}

export interface EdgeRow {
  srcKey: string;
  dstKey: string;
  kind: EdgeKind;
  tier: Tier;
  confidence: number;
  siteLine: number | null;
}

interface FileDbRow {
  id: number;
  path: string;
  contentHash: string;
  mtimeMs: number;
  size: number;
}

interface SymbolDbRow extends Omit<SymbolRow, "exported" | "isTest"> {
  exported: number;
  isTest: number;
}

function decodeSymbol(row: SymbolDbRow): SymbolRow {
  return { ...row, exported: row.exported !== 0, isTest: row.isTest !== 0 };
}

const SYMBOL_SELECT = `
  SELECT s.stable_key AS stableKey, f.path AS filePath,
         s.qualified_name AS qualifiedName, s.short_name AS shortName,
         s.kind, s.signature, s.start_byte AS startByte,
         s.end_byte AS endByte, s.start_line AS startLine,
         s.end_line AS endLine, s.body_hash AS bodyHash,
         s.exported, s.is_test AS isTest
  FROM symbol s JOIN file f ON f.id = s.file_id`;

export class Store {
  constructor(private readonly db: Db) {}

  transaction<T>(fn: () => T): T {
    return this.db.transaction(fn)();
  }

  upsertFile(
    file: FileRecord & {
      language?: string;
      parseState?: "ok" | "partial" | "failed";
      diagnostics?: unknown[];
    },
  ): void {
    this.db
      .prepare(
        `INSERT INTO file
           (path, language, content_hash, mtime_ms, size, parse_state, diagnostics)
         VALUES
           (@path, @language, @contentHash, @mtimeMs, @size, @parseState, @diagnostics)
         ON CONFLICT(path) DO UPDATE SET
           language = excluded.language,
           content_hash = excluded.content_hash,
           mtime_ms = excluded.mtime_ms,
           size = excluded.size,
           parse_state = excluded.parse_state,
           diagnostics = excluded.diagnostics,
           indexed_at = datetime('now')`,
      )
      .run({
        ...file,
        language: file.language ?? "typescript",
        parseState: file.parseState ?? "ok",
        diagnostics: JSON.stringify(file.diagnostics ?? []),
      });
  }

  getFile(path: string): Omit<FileDbRow, "path"> | undefined {
    return (
      (this.db
        .prepare(
          `SELECT id, content_hash AS contentHash, mtime_ms AS mtimeMs, size
           FROM file WHERE path = ?`,
        )
        .get(path) as Omit<FileDbRow, "path"> | undefined) ?? undefined
    );
  }

  allFiles(): Array<Omit<FileDbRow, "id">> {
    return this.db
      .prepare(
        `SELECT path, content_hash AS contentHash, mtime_ms AS mtimeMs, size
         FROM file ORDER BY path`,
      )
      .all() as Array<Omit<FileDbRow, "id">>;
  }

  hasParseFailures(): boolean {
    const row = this.db
      .prepare(
        "SELECT 1 AS present FROM file WHERE parse_state != 'ok' LIMIT 1",
      )
      .get() as { present: number } | undefined;
    return row !== undefined;
  }

  allSymbolLocations(): Array<{ shortName: string; filePath: string }> {
    return this.db
      .prepare(
        `SELECT s.short_name AS shortName, f.path AS filePath
         FROM symbol s JOIN file f ON f.id = s.file_id`,
      )
      .all() as Array<{ shortName: string; filePath: string }>;
  }

  /**
   * Flat dependency evidence for pure documentation aggregation.
   *
   * CONTAINS is intra-file structure, not a dependency. TESTS is excluded
   * because this document does not expose structural test relationships and
   * therefore must not imply coverage (spec §3.4 / invariant 7).
   */
  docEdgeRows(): Array<{
    srcFile: string;
    dstFile: string;
    dstName: string;
    dstKind: string;
    kind: EdgeKind;
    tier: string;
  }> {
    return this.db
      .prepare(
        `SELECT src_file.path AS srcFile,
                dst_file.path AS dstFile,
                target.short_name AS dstName,
                target.kind AS dstKind,
                edge.kind AS kind,
                edge.tier AS tier
         FROM edge
         JOIN symbol AS source ON source.id = edge.src_symbol_id
         JOIN symbol AS target ON target.id = edge.dst_symbol_id
         JOIN file AS src_file ON src_file.id = source.file_id
         JOIN file AS dst_file ON dst_file.id = target.file_id
         WHERE edge.kind NOT IN ('CONTAINS', 'TESTS')
         ORDER BY src_file.path, dst_file.path, target.short_name,
                  edge.kind, edge.tier`,
      )
      .all() as Array<{
        srcFile: string;
        dstFile: string;
        dstName: string;
        dstKind: string;
        kind: EdgeKind;
        tier: string;
      }>;
  }

  docSymbolCounts(): Array<{
    filePath: string;
    symbols: number;
    testSymbols: number;
  }> {
    return this.db
      .prepare(
        `SELECT file.path AS filePath,
                COUNT(symbol.id) AS symbols,
                COALESCE(SUM(symbol.is_test), 0) AS testSymbols
         FROM file
         LEFT JOIN symbol ON symbol.file_id = file.id
         GROUP BY file.path
         ORDER BY file.path`,
      )
      .all() as Array<{
        filePath: string;
        symbols: number;
        testSymbols: number;
      }>;
  }

  /** Count files whose extraction was partial or failed; never coerce a flag. */
  countParseFailures(): number {
    const row = this.db
      .prepare("SELECT COUNT(*) AS n FROM file WHERE parse_state != 'ok'")
      .get() as { n: number };
    return row.n;
  }

  deleteFile(path: string): void {
    this.db.prepare("DELETE FROM file WHERE path = ?").run(path);
  }

  insertSymbols(rows: SymbolRow[]): void {
    const statement = this.db.prepare(
      `INSERT INTO symbol
         (stable_key, file_id, qualified_name, short_name, kind, signature,
          start_byte, end_byte, start_line, end_line, body_hash, exported, is_test)
       VALUES
         (@stableKey, (SELECT id FROM file WHERE path = @filePath),
          @qualifiedName, @shortName, @kind, @signature, @startByte, @endByte,
          @startLine, @endLine, @bodyHash, @exported, @isTest)`,
    );
    this.db.transaction((symbols: SymbolRow[]) => {
      for (const row of symbols) {
        statement.run({
          ...row,
          exported: row.exported ? 1 : 0,
          isTest: row.isTest ? 1 : 0,
        });
      }
    })(rows);
  }

  insertEdges(rows: EdgeRow[]): void {
    const statement = this.db.prepare(
      `INSERT INTO edge
         (src_symbol_id, dst_symbol_id, kind, tier, confidence, site_line,
          extractor_version)
       VALUES
         ((SELECT id FROM symbol WHERE stable_key = @srcKey),
          (SELECT id FROM symbol WHERE stable_key = @dstKey),
          @kind, @tier, @confidence, @siteLine, @extractorVersion)`,
    );
    this.db.transaction((edges: EdgeRow[]) => {
      for (const row of edges) {
        statement.run({ ...row, extractorVersion: EXTRACTOR_VERSION });
      }
    })(rows);
  }

  insertExternal(
    rows: Array<{
      srcKey: string;
      name: string;
      packageOrLib: string;
      siteLine: number | null;
    }>,
  ): void {
    const statement = this.db.prepare(
      `INSERT INTO external_ref
         (src_symbol_id, name, package_or_lib, site_line)
       VALUES
         ((SELECT id FROM symbol WHERE stable_key = @srcKey),
          @name, @packageOrLib, @siteLine)`,
    );
    this.db.transaction((references: typeof rows) => {
      for (const row of references) {
        statement.run(row);
      }
    })(rows);
  }

  insertUnresolved(
    rows: Array<{
      srcKey: string;
      name: string;
      kind: string;
      siteLine: number | null;
      candidateCount: number;
      reason: string;
    }>,
  ): void {
    const statement = this.db.prepare(
      `INSERT INTO unresolved_ref
         (src_symbol_id, name, kind, site_line, candidate_count, reason)
       VALUES
         ((SELECT id FROM symbol WHERE stable_key = @srcKey),
          @name, @kind, @siteLine, @candidateCount, @reason)`,
    );
    this.db.transaction((references: typeof rows) => {
      for (const row of references) {
        statement.run(row);
      }
    })(rows);
  }

  /** Promote matching edges to COMPILER tier. Returns whether any row changed. */
  upgradeEdgeTier(srcKey: string, dstKey: string, kind: EdgeKind): boolean {
    const result = this.db
      .prepare(
        `UPDATE edge
         SET tier = 'COMPILER', confidence = 1.0
         WHERE kind = @kind
           AND src_symbol_id = (
             SELECT id FROM symbol WHERE stable_key = @srcKey
           )
           AND dst_symbol_id = (
             SELECT id FROM symbol WHERE stable_key = @dstKey
           )
           AND (tier <> 'COMPILER' OR confidence <> 1.0)`,
      )
      .run({ srcKey, dstKey, kind });
    return result.changes > 0;
  }

  /** Insert an exact edge when ambiguity prevented any candidate edge. */
  insertCompilerEdge(
    srcKey: string,
    dstKey: string,
    kind: EdgeKind,
    siteLine: number | null,
  ): boolean {
    const result = this.db
      .prepare(
        `INSERT INTO edge
           (src_symbol_id, dst_symbol_id, kind, tier, confidence, site_line,
            extractor_version)
         SELECT source.id, target.id, @kind, 'COMPILER', 1.0, @siteLine,
                @extractorVersion
         FROM symbol AS source, symbol AS target
         WHERE source.stable_key = @srcKey
           AND target.stable_key = @dstKey
           AND NOT EXISTS (
             SELECT 1 FROM edge AS existing
             WHERE existing.src_symbol_id = source.id
               AND existing.dst_symbol_id = target.id
               AND existing.kind = @kind
           )`,
      )
      .run({
        srcKey,
        dstKey,
        kind,
        siteLine,
        extractorVersion: EXTRACTOR_VERSION,
      });
    return result.changes > 0;
  }

  /** Promote only the candidate edge produced for this exact reference site. */
  upgradeEdgeTierAt(
    srcKey: string,
    dstKey: string,
    kind: EdgeKind,
    siteLine: number,
  ): boolean {
    const result = this.db
      .prepare(
        `UPDATE edge
         SET tier = 'COMPILER', confidence = 1.0
         WHERE kind = @kind
           AND site_line = @siteLine
           AND src_symbol_id = (
             SELECT id FROM symbol WHERE stable_key = @srcKey
           )
           AND dst_symbol_id = (
             SELECT id FROM symbol WHERE stable_key = @dstKey
           )
           AND (tier <> 'COMPILER' OR confidence <> 1.0)`,
      )
      .run({ srcKey, dstKey, kind, siteLine });
    return result.changes > 0;
  }

  /** Insert compiler evidence for one site, without conflating another line. */
  insertCompilerEdgeAt(
    srcKey: string,
    dstKey: string,
    kind: EdgeKind,
    siteLine: number,
  ): boolean {
    const result = this.db
      .prepare(
        `INSERT INTO edge
           (src_symbol_id, dst_symbol_id, kind, tier, confidence, site_line,
            extractor_version)
         SELECT source.id, target.id, @kind, 'COMPILER', 1.0, @siteLine,
                @extractorVersion
         FROM symbol AS source, symbol AS target
         WHERE source.stable_key = @srcKey
           AND target.stable_key = @dstKey
           AND NOT EXISTS (
             SELECT 1 FROM edge AS existing
             WHERE existing.src_symbol_id = source.id
               AND existing.dst_symbol_id = target.id
               AND existing.kind = @kind
               AND existing.site_line = @siteLine
           )`,
      )
      .run({
        srcKey,
        dstKey,
        kind,
        siteLine,
        extractorVersion: EXTRACTOR_VERSION,
      });
    return result.changes > 0;
  }

  hasCompilerEdgeAt(
    srcKey: string,
    dstKey: string,
    kind: EdgeKind,
    siteLine: number,
  ): boolean {
    return (
      this.db
        .prepare(
          `SELECT 1 AS present
           FROM edge
           WHERE tier = 'COMPILER'
             AND kind = @kind
             AND site_line = @siteLine
             AND src_symbol_id = (
               SELECT id FROM symbol WHERE stable_key = @srcKey
             )
             AND dst_symbol_id = (
               SELECT id FROM symbol WHERE stable_key = @dstKey
             )
           LIMIT 1`,
        )
        .get({ srcKey, dstKey, kind, siteLine }) !== undefined
    );
  }

  /** Remove superseded ambiguity candidates at one answered reference site. */
  deleteHeuristicEdgesAt(
    srcKey: string,
    kind: EdgeKind,
    siteLine: number,
    exceptDstKey: string | null,
  ): number {
    return this.db
      .prepare(
        `DELETE FROM edge
         WHERE tier = 'HEURISTIC'
           AND kind = @kind
           AND site_line = @siteLine
           AND src_symbol_id = (
             SELECT id FROM symbol WHERE stable_key = @srcKey
           )
           AND (
             @exceptDstKey IS NULL OR
             dst_symbol_id <> (
               SELECT id FROM symbol WHERE stable_key = @exceptDstKey
             )
           )`,
      )
      .run({ srcKey, kind, siteLine, exceptDstKey }).changes;
  }

  /** Remove unresolved records for a reference the compiler has now placed. */
  deleteUnresolvedFor(srcKey: string, name: string): number {
    return this.db
      .prepare(
        `DELETE FROM unresolved_ref
         WHERE name = @name
           AND src_symbol_id = (
             SELECT id FROM symbol WHERE stable_key = @srcKey
           )`,
      )
      .run({ srcKey, name }).changes;
  }

  /** Sites the deterministic resolver could not place exactly. */
  unresolvedRefSites(): Array<{
    srcKey: string;
    name: string;
    siteLine: number | null;
  }> {
    return this.db
      .prepare(
        `SELECT symbol.stable_key AS srcKey,
                unresolved_ref.name AS name,
                unresolved_ref.site_line AS siteLine
         FROM unresolved_ref
         JOIN symbol ON symbol.id = unresolved_ref.src_symbol_id
         ORDER BY symbol.stable_key, unresolved_ref.site_line,
                  unresolved_ref.name`,
      )
      .all() as Array<{
        srcKey: string;
        name: string;
        siteLine: number | null;
      }>;
  }

  /**
   * Reference sites represented by heuristic candidate edges.
   *
   * Joining the candidate symbol recovers the reference name. DISTINCT
   * collapses ambiguity fan-out, while the kind filter excludes structural
   * TESTS edges that are always heuristic but are never pyright queries.
   */
  heuristicEdgeSites(): Array<{
    srcKey: string;
    name: string;
    siteLine: number | null;
  }> {
    return this.db
      .prepare(
        `SELECT DISTINCT source.stable_key AS srcKey,
                target.short_name AS name,
                edge.site_line AS siteLine
         FROM edge
         JOIN symbol AS source ON source.id = edge.src_symbol_id
         JOIN symbol AS target ON target.id = edge.dst_symbol_id
         WHERE edge.tier = 'HEURISTIC'
           AND edge.kind IN ('CALLS','REFERENCES','IMPLEMENTS','INHERITS')
         ORDER BY source.stable_key, edge.site_line, target.short_name`,
      )
      .all() as Array<{
        srcKey: string;
        name: string;
        siteLine: number | null;
      }>;
  }

  /** C1: count source reference sites, never structural or fan-out edges. */
  countReferenceSites(
    tier: "COMPILER" | "LEXICAL" | "HEURISTIC",
  ): number {
    const row = this.db
      .prepare(
        `SELECT COUNT(*) AS n FROM (
           SELECT DISTINCT src_symbol_id, site_line, kind
           FROM edge
           WHERE tier = @tier
             AND kind IN ('CALLS','REFERENCES','IMPLEMENTS','INHERITS')
         )`,
      )
      .get({ tier }) as { n: number };
    return row.n;
  }

  countUnresolved(): number {
    const row = this.db
      .prepare("SELECT COUNT(*) AS n FROM unresolved_ref")
      .get() as { n: number };
    return row.n;
  }

  countExternal(): number {
    const row = this.db
      .prepare("SELECT COUNT(*) AS n FROM external_ref")
      .get() as { n: number };
    return row.n;
  }

  tierCounts(): Record<string, number> {
    const rows = this.db
      .prepare("SELECT tier, COUNT(*) AS count FROM edge GROUP BY tier")
      .all() as Array<{ tier: string; count: number }>;
    return Object.fromEntries(rows.map((row) => [row.tier, row.count]));
  }

  setCompilerVersion(version: string | null): void {
    if (version === null) {
      this.db.prepare("DELETE FROM meta WHERE key = 'compiler_version'").run();
      return;
    }
    this.db
      .prepare(
        `INSERT INTO meta (key, value) VALUES ('compiler_version', ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      )
      .run(version);
  }

  compilerVersion(): string | null {
    const row = this.db
      .prepare("SELECT value FROM meta WHERE key = 'compiler_version'")
      .get() as { value: string } | undefined;
    return row?.value ?? null;
  }

  /** Pyright provenance is independent from the TypeScript compiler version. */
  setPyrightVersion(version: string | null): void {
    if (version === null) {
      this.db.prepare("DELETE FROM meta WHERE key = 'pyright_version'").run();
      return;
    }
    this.db
      .prepare(
        `INSERT INTO meta (key, value) VALUES ('pyright_version', ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      )
      .run(version);
  }

  pyrightVersion(): string | null {
    const row = this.db
      .prepare("SELECT value FROM meta WHERE key = 'pyright_version'")
      .get() as { value: string } | undefined;
    return row?.value ?? null;
  }

  symbolsInFile(path: string): SymbolRow[] {
    const rows = this.db
      .prepare(`${SYMBOL_SELECT} WHERE f.path = ? ORDER BY s.start_byte`)
      .all(path) as SymbolDbRow[];
    return rows.map(decodeSymbol);
  }

  /** Symbols whose embedding is missing or stale for this model. */
  symbolsNeedingEmbedding(model: string): Array<{
    id: number;
    qualifiedName: string;
    kind: string;
    signature: string | null;
    path: string;
  }> {
    return this.db
      .prepare(
        `SELECT s.id, s.qualified_name AS qualifiedName, s.kind, s.signature,
                f.path
         FROM symbol s
         JOIN file f ON f.id = s.file_id
         LEFT JOIN embedding e ON e.symbol_id = s.id AND e.model = ?
         WHERE e.symbol_id IS NULL`,
      )
      .all(model) as never;
  }

  upsertEmbedding(row: {
    symbolId: number;
    model: string;
    dim: number;
    vector: Buffer;
    inputHash: string;
  }): void {
    this.db
      .prepare(
        `INSERT INTO embedding (symbol_id, model, dim, vector, input_hash)
         VALUES (@symbolId, @model, @dim, @vector, @inputHash)
         ON CONFLICT(symbol_id) DO UPDATE SET
           model = excluded.model, dim = excluded.dim,
           vector = excluded.vector, input_hash = excluded.input_hash`,
      )
      .run(row);
  }

  allEmbeddings(model: string): Array<{
    stableKey: string;
    vector: Buffer;
  }> {
    return this.db
      .prepare(
        `SELECT s.stable_key AS stableKey, e.vector
         FROM embedding e JOIN symbol s ON s.id = e.symbol_id
         WHERE e.model = ?`,
      )
      .all(model) as never;
  }

  countEmbeddings(model: string): number {
    const row = this.db
      .prepare("SELECT COUNT(*) AS n FROM embedding WHERE model = ?")
      .get(model) as { n: number };
    return row.n;
  }

  findSymbolsByName(shortName: string): SymbolRow[] {
    const rows = this.db
      .prepare(`${SYMBOL_SELECT} WHERE s.short_name = ? ORDER BY s.stable_key`)
      .all(shortName) as SymbolDbRow[];
    return rows.map(decodeSymbol);
  }
}
