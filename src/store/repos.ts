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
      parseState?: "ok" | "failed";
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

  allSymbolLocations(): Array<{ shortName: string; filePath: string }> {
    return this.db
      .prepare(
        `SELECT s.short_name AS shortName, f.path AS filePath
         FROM symbol s JOIN file f ON f.id = s.file_id`,
      )
      .all() as Array<{ shortName: string; filePath: string }>;
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

  symbolsInFile(path: string): SymbolRow[] {
    const rows = this.db
      .prepare(`${SYMBOL_SELECT} WHERE f.path = ? ORDER BY s.start_byte`)
      .all(path) as SymbolDbRow[];
    return rows.map(decodeSymbol);
  }

  findSymbolsByName(shortName: string): SymbolRow[] {
    const rows = this.db
      .prepare(`${SYMBOL_SELECT} WHERE s.short_name = ? ORDER BY s.stable_key`)
      .all(shortName) as SymbolDbRow[];
    return rows.map(decodeSymbol);
  }
}
