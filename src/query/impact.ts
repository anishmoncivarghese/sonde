import { fanInP95, score, TIER_RANK_SQL, USAGE_KINDS } from "./rank.js";
import type { RepoBoundary } from "../repo/boundary.js";
import { changedFiles } from "../repo/git.js";
import type { Db } from "../store/db.js";
import { Store, type EdgeKind } from "../store/repos.js";

export interface ImpactParams {
  symbols?: string[];
  fromGitDiff?: boolean;
}

export interface ImpactRow {
  stableKey: string;
  path: string;
  qualifiedName: string;
  kind: string;
  depth: number;
  viaKind: string;
  tier: "COMPILER" | "LEXICAL" | "HEURISTIC";
}

export interface ImpactResult {
  seeds: string[];
  affected: ImpactRow[];
  tests: ImpactRow[];
  warnings: string[];
  truncated: boolean;
}

export const MAX_DEPTH = 6;
export const MAX_NODES = 500;
export const MAX_WALL_CLOCK_MS = 2000;

const IMPACT_KINDS: EdgeKind[] = [
  "CALLS",
  "REFERENCES",
  "IMPLEMENTS",
  "INHERITS",
];

interface SeedResolution {
  stableKey: string | null;
  ambiguous: boolean;
}

interface SeedRow {
  id: number;
  stableKey: string;
}

interface CandidateRow {
  id: number;
  stableKey: string;
  path: string;
  qualifiedName: string;
  kind: string;
  viaKind: string;
  tier: "COMPILER" | "LEXICAL" | "HEURISTIC";
  tierRank: number;
  exported: number;
  fanIn: number;
}

function uniqueStableKey(db: Db, column: string, value: string): SeedResolution {
  const rows = db
    .prepare(
      `SELECT stable_key AS stableKey FROM symbol
       WHERE ${column} = ? ORDER BY stable_key LIMIT 2`,
    )
    .all(value) as Array<{ stableKey: string }>;
  return {
    stableKey: rows.length === 1 ? rows[0]!.stableKey : null,
    ambiguous: rows.length > 1,
  };
}

function resolveSymbol(db: Db, reference: string): SeedResolution {
  const stable = db
    .prepare("SELECT stable_key AS stableKey FROM symbol WHERE stable_key = ?")
    .get(reference) as { stableKey: string } | undefined;
  if (stable) return { stableKey: stable.stableKey, ambiguous: false };

  const qualified = uniqueStableKey(db, "qualified_name", reference);
  if (qualified.stableKey !== null || qualified.ambiguous) return qualified;
  return uniqueStableKey(db, "short_name", reference);
}

function resolveSeeds(
  db: Db,
  boundary: RepoBoundary,
  params: ImpactParams,
  warnings: string[],
): string[] {
  const seeds = new Set<string>();
  if (params.symbols && params.symbols.length > 0) {
    for (const reference of params.symbols) {
      const resolution = resolveSymbol(db, reference);
      if (resolution.stableKey !== null) {
        seeds.add(resolution.stableKey);
      } else if (resolution.ambiguous) {
        warnings.push(`seed symbol "${reference}" is ambiguous; skipped`);
      } else {
        warnings.push(`seed symbol "${reference}" was not found; skipped`);
      }
    }
    return [...seeds];
  }

  if (!params.fromGitDiff) return [];
  const paths = changedFiles(boundary);
  if (paths === null) {
    // spec §7.6 / invariant 8: unknown git state must be visible, never read as
    // an empty working-tree diff.
    warnings.push("git could not determine the working-tree diff");
    return [];
  }

  const store = new Store(db);
  for (const path of paths) {
    for (const symbol of store.symbolsInFile(path)) {
      seeds.add(symbol.stableKey);
    }
  }
  return [...seeds];
}

function stop(result: ImpactResult, warning: string): ImpactResult {
  result.truncated = true;
  result.warnings.push(warning);
  return result;
}

function budgetExceeded(startedAt: number): boolean {
  return Date.now() - startedAt > MAX_WALL_CLOCK_MS;
}

export function getImpactRadius(
  db: Db,
  boundary: RepoBoundary,
  params: ImpactParams,
): ImpactResult {
  const result: ImpactResult = {
    seeds: [],
    affected: [],
    // TESTS production is deferred in Plan 2. Keep this bucket explicit so a
    // future producer can attach structural test relations without implying
    // coverage (spec §6.4 and §7.3; invariant 7).
    tests: [],
    warnings: [],
    truncated: false,
  };
  result.seeds = resolveSeeds(db, boundary, params, result.warnings);
  if (result.seeds.length === 0) return result;

  const placeholders = result.seeds.map(() => "?").join(",");
  const seedRows = db
    .prepare(
      `SELECT id, stable_key AS stableKey FROM symbol
       WHERE stable_key IN (${placeholders}) ORDER BY stable_key`,
    )
    .all(...result.seeds) as SeedRow[];

  const p95 = fanInP95(db);
  const visited = new Set(seedRows.map(({ id }) => id));
  let frontier = seedRows.map(({ id }) => id);
  let depth = 1;
  const startedAt = Date.now();

  // spec §7.3 / SEC-012: reverse impact traversal is breadth-first,
  // cycle-safe, and independently bounded by depth, nodes, and wall clock.
  // Each level is fetched in one batched query (not one per frontier node)
  // so the wall-clock budget bounds DB round trips, not just JS work.
  while (frontier.length > 0) {
    if (budgetExceeded(startedAt)) {
      return stop(
        result,
        `stopped after ${MAX_WALL_CLOCK_MS}ms wall-clock budget`,
      );
    }

    const frontierPlaceholders = frontier.map(() => "?").join(",");
    const candidates = db
      .prepare(
        `SELECT source.id AS id, source.stable_key AS stableKey, f.path AS path,
                source.qualified_name AS qualifiedName, source.kind AS kind,
                source.exported AS exported, e.kind AS viaKind, e.tier AS tier,
                ${TIER_RANK_SQL} AS tierRank,
                (SELECT COUNT(*) FROM edge inbound
                 WHERE inbound.dst_symbol_id = source.id
                   AND inbound.kind IN
                     (${USAGE_KINDS.map(() => "?").join(",")})) AS fanIn
         FROM edge e
           JOIN symbol source ON source.id = e.src_symbol_id
           JOIN file f ON f.id = source.file_id
         WHERE e.dst_symbol_id IN (${frontierPlaceholders})
           AND e.kind IN (${IMPACT_KINDS.map(() => "?").join(",")})`,
      )
      .all(
        ...USAGE_KINDS,
        ...frontier,
        ...IMPACT_KINDS,
      ) as CandidateRow[];

    // spec §7.4 / invariant 3: tier beats score, always — score() breaks
    // ties only within a tier, so truncation drops the least-useful
    // candidates first instead of an arbitrary alphabetical cut.
    candidates.sort((left, right) => {
      if (left.tierRank !== right.tierRank) {
        return left.tierRank - right.tierRank;
      }
      const leftScore = score(
        {
          distance: depth,
          fanIn: left.fanIn,
          exported: left.exported !== 0,
          pathFocusMatch: false,
        },
        p95,
      );
      const rightScore = score(
        {
          distance: depth,
          fanIn: right.fanIn,
          exported: right.exported !== 0,
          pathFocusMatch: false,
        },
        p95,
      );
      return rightScore - leftScore || left.stableKey.localeCompare(right.stableKey);
    });

    const next: number[] = [];
    for (const row of candidates) {
      if (visited.has(row.id)) continue;
      // Deferred until a real omission exists: an exact-fit traversal whose
      // last level has no further unvisited neighbors never reaches here.
      if (depth > MAX_DEPTH) {
        return stop(
          result,
          `stopped after ${MAX_DEPTH} levels of traversal depth`,
        );
      }
      if (result.affected.length >= MAX_NODES) {
        return stop(result, `stopped after ${MAX_NODES} affected nodes`);
      }

      visited.add(row.id);
      result.affected.push({
        stableKey: row.stableKey,
        path: row.path,
        qualifiedName: row.qualifiedName,
        kind: row.kind,
        depth,
        viaKind: row.viaKind,
        tier: row.tier,
      });
      next.push(row.id);
    }
    frontier = next;
    depth += 1;
  }

  return result;
}
