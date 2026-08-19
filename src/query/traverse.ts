import { fanInP95, score, TIER_RANK_SQL, USAGE_KINDS } from "./rank.js";
import type { Db } from "../store/db.js";
import type { EdgeKind } from "../store/repos.js";

export type TraversePattern =
  | "callers_of"
  | "callees_of"
  | "references_to"
  | "imports_of"
  | "imported_by"
  | "implementations_of"
  | "inheritors_of"
  | "inherits_from"
  | "tests_for"
  | "contained_by"
  | "contains";

export interface TraverseParams {
  pattern: TraversePattern;
  symbol: string;
  limit?: number;
}

export interface EdgeResultRow {
  stableKey: string;
  path: string;
  qualifiedName: string;
  kind: string;
  siteLine: number | null;
}

export interface TraverseResult {
  compiler: EdgeResultRow[];
  lexical: EdgeResultRow[];
  heuristic: EdgeResultRow[];
  external: { count: number };
  unresolved: { count: number; names: string[] };
  truncated: boolean;
}

interface PatternSpec {
  kinds: EdgeKind[];
  direction: "forward" | "reverse";
}

type InternalTier = "COMPILER" | "LEXICAL" | "HEURISTIC";

interface CandidateRow extends EdgeResultRow {
  tier: InternalTier;
  tierRank: number;
  fanIn: number;
  exported: number;
}

const PATTERNS: Record<TraversePattern, PatternSpec> = {
  callers_of: { kinds: ["CALLS"], direction: "reverse" },
  callees_of: { kinds: ["CALLS"], direction: "forward" },
  references_to: {
    kinds: ["CALLS", "REFERENCES"],
    direction: "reverse",
  },
  imports_of: { kinds: ["IMPORTS"], direction: "forward" },
  imported_by: { kinds: ["IMPORTS"], direction: "reverse" },
  implementations_of: { kinds: ["IMPLEMENTS"], direction: "reverse" },
  inheritors_of: { kinds: ["INHERITS"], direction: "reverse" },
  inherits_from: { kinds: ["INHERITS"], direction: "forward" },
  tests_for: { kinds: ["TESTS"], direction: "reverse" },
  contained_by: { kinds: ["CONTAINS"], direction: "reverse" },
  contains: { kinds: ["CONTAINS"], direction: "forward" },
};

function emptyResult(): TraverseResult {
  return {
    compiler: [],
    lexical: [],
    heuristic: [],
    external: { count: 0 },
    unresolved: { count: 0, names: [] },
    truncated: false,
  };
}

function uniqueId(db: Db, column: string, value: string): number | null {
  const rows = db
    .prepare(`SELECT id FROM symbol WHERE ${column} = ? ORDER BY id LIMIT 2`)
    .all(value) as Array<{ id: number }>;
  return rows.length === 1 ? rows[0]!.id : null;
}

function resolveSymbolId(db: Db, reference: string): number | null {
  const stable = db
    .prepare("SELECT id FROM symbol WHERE stable_key = ?")
    .get(reference) as { id: number } | undefined;
  if (stable) return stable.id;

  const qualified = uniqueId(db, "qualified_name", reference);
  if (qualified !== null) return qualified;
  const qualifiedCount = db
    .prepare("SELECT COUNT(*) AS count FROM symbol WHERE qualified_name = ?")
    .get(reference) as { count: number };
  if (qualifiedCount.count > 1) return null;

  return uniqueId(db, "short_name", reference);
}

function normalizedLimit(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) return 50;
  return Math.max(0, Math.floor(value));
}

function uniqueNames(rows: Array<{ name: string }>): string[] {
  return [...new Set(rows.map(({ name }) => name))];
}

export function queryGraph(db: Db, params: TraverseParams): TraverseResult {
  const result = emptyResult();
  const symbolId = resolveSymbolId(db, params.symbol);
  if (symbolId === null) return result;

  const spec = PATTERNS[params.pattern];
  if (!spec) return result;
  const forward = spec.direction === "forward";
  const selfColumn = forward ? "src_symbol_id" : "dst_symbol_id";
  const otherColumn = forward ? "dst_symbol_id" : "src_symbol_id";

  const candidates = db
    .prepare(
      `WITH candidates AS (
         SELECT other.id AS otherId, other.stable_key AS stableKey,
                f.path AS path, other.qualified_name AS qualifiedName,
                e.kind, e.tier, e.site_line AS siteLine,
                other.exported, ${TIER_RANK_SQL} AS tierRank,
                (SELECT COUNT(*) FROM edge inbound
                 WHERE inbound.dst_symbol_id = other.id
                   AND inbound.kind IN
                     (${USAGE_KINDS.map(() => "?").join(",")})) AS fanIn,
                ROW_NUMBER() OVER (
                  PARTITION BY other.id
                  ORDER BY ${TIER_RANK_SQL},
                           CASE e.kind WHEN 'CALLS' THEN 0 ELSE 1 END,
                           e.site_line, e.id
                ) AS rowRank
         FROM edge e
           JOIN symbol other ON other.id = e.${otherColumn}
           JOIN file f ON f.id = other.file_id
         WHERE e.${selfColumn} = ?
           AND e.kind IN (${spec.kinds.map(() => "?").join(",")})
       )
       SELECT stableKey, path, qualifiedName, kind, tier, siteLine,
              exported, tierRank, fanIn
       FROM candidates
       WHERE rowRank = 1`,
    )
    .all(...USAGE_KINDS, symbolId, ...spec.kinds) as CandidateRow[];

  const p95 = fanInP95(db);
  candidates.sort((left, right) => {
    // spec §7.4 / invariant 3: tier beats score, always — COMPILER > LEXICAL >
    // HEURISTIC, with score() breaking ties only within a tier.
    if (left.tierRank !== right.tierRank) {
      return left.tierRank - right.tierRank;
    }
    const leftScore = score(
      {
        distance: 1,
        fanIn: left.fanIn,
        exported: left.exported !== 0,
        pathFocusMatch: false,
      },
      p95,
    );
    const rightScore = score(
      {
        distance: 1,
        fanIn: right.fanIn,
        exported: right.exported !== 0,
        pathFocusMatch: false,
      },
      p95,
    );
    return rightScore - leftScore || left.stableKey.localeCompare(right.stableKey);
  });

  const limit = normalizedLimit(params.limit);
  result.truncated = candidates.length > limit;
  for (const row of candidates.slice(0, limit)) {
    const bucket = row.tier === "COMPILER"
      ? result.compiler
      : row.tier === "LEXICAL"
        ? result.lexical
        : result.heuristic;
    bucket.push({
      stableKey: row.stableKey,
      path: row.path,
      qualifiedName: row.qualifiedName,
      kind: row.kind,
      siteLine: row.siteLine,
    });
  }

  if (forward) {
    const external = db
      .prepare(
        "SELECT COUNT(*) AS count FROM external_ref WHERE src_symbol_id = ?",
      )
      .get(symbolId) as { count: number };
    const unresolved = db
      .prepare(
        `SELECT name FROM unresolved_ref
         WHERE src_symbol_id = ? ORDER BY name, id`,
      )
      .all(symbolId) as Array<{ name: string }>;
    result.external = { count: external.count };
    result.unresolved = {
      count: unresolved.length,
      names: uniqueNames(unresolved),
    };
  } else {
    const target = db
      .prepare("SELECT short_name AS shortName FROM symbol WHERE id = ?")
      .get(symbolId) as { shortName: string };
    const unresolved = db
      .prepare(
        `SELECT name FROM unresolved_ref
         WHERE name = ? ORDER BY name, id`,
      )
      .all(target.shortName) as Array<{ name: string }>;
    result.unresolved = {
      count: unresolved.length,
      names: uniqueNames(unresolved),
    };
  }

  return result;
}
