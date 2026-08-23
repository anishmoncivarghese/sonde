import type { Db } from "../store/db.js";
import type { SymbolKind } from "../store/repos.js";

export interface FindSymbolsParams {
  query: string;
  kinds?: SymbolKind[];
  paths?: string[];
  limit?: number;
}

export interface FindResult {
  stableKey: string;
  path: string;
  kind: SymbolKind;
  signature: string | null;
  startLine: number;
  endLine: number;
  reason: "exact_qualified" | "exact_short" | "fts";
}

interface Row {
  stableKey: string;
  path: string;
  kind: SymbolKind;
  signature: string | null;
  startLine: number;
  endLine: number;
}

const BASE_SELECT = `
  SELECT s.stable_key AS stableKey, f.path AS path, s.kind, s.signature,
         s.start_line AS startLine, s.end_line AS endLine
  FROM symbol s JOIN file f ON f.id = s.file_id`;

function filterClause(
  kinds?: SymbolKind[],
  paths?: string[],
): { sql: string; args: unknown[] } {
  const clauses: string[] = [];
  const args: unknown[] = [];

  if (kinds && kinds.length > 0) {
    clauses.push(`s.kind IN (${kinds.map(() => "?").join(",")})`);
    args.push(...kinds);
  }
  if (paths && paths.length > 0) {
    clauses.push(`(${paths.map(() => "instr(f.path, ?) = 1").join(" OR ")})`);
    args.push(...paths);
  }

  return {
    sql: clauses.length > 0 ? `AND ${clauses.join(" AND ")}` : "",
    args,
  };
}

/** Convert user text to literal trigram terms, never executable FTS syntax. */
function ftsQuery(query: string): string | null {
  const terms = (query.match(/[\p{L}\p{N}_$]+/gu) ?? []).filter(
    (term) => Array.from(term).length >= 3,
  );
  if (terms.length === 0) return null;
  return terms.map((term) => `"${term}"`).join(" AND ");
}

export function findSymbols(db: Db, params: FindSymbolsParams): FindResult[] {
  const requestedLimit = params.limit ?? 20;
  const limit = Number.isFinite(requestedLimit)
    ? Math.max(0, Math.floor(requestedLimit))
    : 20;
  if (limit === 0) return [];

  const { sql: filterSql, args: filterArgs } = filterClause(
    params.kinds,
    params.paths,
  );
  const seen = new Set<string>();
  const out: FindResult[] = [];

  const add = (rows: Row[], reason: FindResult["reason"]): void => {
    for (const row of rows) {
      if (seen.has(row.stableKey) || out.length >= limit) continue;
      seen.add(row.stableKey);
      out.push({ ...row, reason });
    }
  };

  add(
    db
      .prepare(
        `${BASE_SELECT} WHERE s.qualified_name = ? ${filterSql}
         ORDER BY s.stable_key`,
      )
      .all(params.query, ...filterArgs) as Row[],
    "exact_qualified",
  );

  if (out.length < limit) {
    add(
      db
        .prepare(
          `${BASE_SELECT} WHERE s.short_name = ? ${filterSql}
           ORDER BY s.stable_key`,
        )
        .all(params.query, ...filterArgs) as Row[],
      "exact_short",
    );
  }

  const fullTextQuery = ftsQuery(params.query);
  if (out.length < limit && fullTextQuery !== null) {
    add(
      db
        .prepare(
          `SELECT s.stable_key AS stableKey, f.path AS path, s.kind,
                  s.signature, s.start_line AS startLine,
                  s.end_line AS endLine
           FROM symbol_fts ft
             JOIN symbol s ON s.id = ft.rowid
             JOIN file f ON f.id = s.file_id
           WHERE symbol_fts MATCH ? ${filterSql}
           ORDER BY bm25(symbol_fts), s.stable_key`,
        )
        .all(fullTextQuery, ...filterArgs) as Row[],
      "fts",
    );
  }

  return out;
}
