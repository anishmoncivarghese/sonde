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

interface IncomingRow {
  id: number;
  stableKey: string;
  path: string;
  qualifiedName: string;
  kind: string;
  viaKind: string;
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

  const incoming = db.prepare(
    `SELECT source.id AS id, source.stable_key AS stableKey, f.path AS path,
            source.qualified_name AS qualifiedName, source.kind AS kind,
            e.kind AS viaKind
     FROM edge e
       JOIN symbol source ON source.id = e.src_symbol_id
       JOIN file f ON f.id = source.file_id
     WHERE e.dst_symbol_id = ?
       AND e.kind IN (${IMPACT_KINDS.map(() => "?").join(",")})
     ORDER BY CASE e.tier
                WHEN 'COMPILER' THEN 0
                WHEN 'LEXICAL' THEN 1
                WHEN 'HEURISTIC' THEN 2
                ELSE 3
              END,
              source.stable_key, e.kind, e.id`,
  );

  const visited = new Set(seedRows.map(({ id }) => id));
  let frontier = seedRows.map(({ id }) => id);
  let depth = 1;
  const startedAt = Date.now();

  // spec §7.3 / SEC-012: reverse impact traversal is breadth-first,
  // cycle-safe, and independently bounded by depth, nodes, and wall clock.
  while (frontier.length > 0) {
    if (Date.now() - startedAt > MAX_WALL_CLOCK_MS) {
      return stop(
        result,
        `stopped after ${MAX_WALL_CLOCK_MS}ms wall-clock budget`,
      );
    }

    const next: number[] = [];
    for (const id of frontier) {
      if (Date.now() - startedAt > MAX_WALL_CLOCK_MS) {
        return stop(
          result,
          `stopped after ${MAX_WALL_CLOCK_MS}ms wall-clock budget`,
        );
      }
      const rows = incoming.all(id, ...IMPACT_KINDS) as IncomingRow[];
      for (const row of rows) {
        if (Date.now() - startedAt > MAX_WALL_CLOCK_MS) {
          return stop(
            result,
            `stopped after ${MAX_WALL_CLOCK_MS}ms wall-clock budget`,
          );
        }
        if (visited.has(row.id)) continue;
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
        });
        next.push(row.id);
      }
    }
    frontier = next;
    depth += 1;
  }

  return result;
}
