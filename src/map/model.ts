import {
  compareDependencies,
  resolvedOf,
  type ModuleDependency,
  type ModuleGraph,
  type ModuleSummary,
} from "../doc/modules.js";

/**
 * How much evidence stands behind a drawn dependency.
 *
 * `resolvedOf > 0` is too coarse on its own to decide what a reader may trust.
 * This repository's typescript adapter carries exactly one LEXICAL reference to
 * the swift adapter against 38 heuristic name matches; drawing that identically
 * to a 68-reference compiler-resolved edge is the misreading the whole document
 * pipeline exists to avoid (invariant 1, invariant 3).
 */
export type Evidence = "resolved" | "weak" | "unverified";

export function evidenceOf(dependency: ModuleDependency): Evidence {
  if (resolvedOf(dependency) === 0) return "unverified";
  return resolvedOf(dependency) > dependency.byTier.HEURISTIC ? "resolved" : "weak";
}

export type MapMode = "simple" | "complete";

export interface MapNode {
  path: string;
  files: number;
  symbols: number;
  surface: string[];
  x: number;
  y: number;
  r: number;
}

export interface MapEdge {
  from: string;
  to: string;
  resolved: number;
  total: number;
  heuristic: number;
  evidence: Evidence;
  weight: number;
}

export interface MapModel {
  mode: MapMode;
  nodes: MapNode[];
  edges: MapEdge[];
  width: number;
  height: number;
}

/**
 * Roll a module up to its top-level unit: `src/adapters/python` becomes
 * `src/adapters`, `bench/harness` becomes `bench`. One level under `src/`,
 * because that is where this repository draws its own responsibility
 * boundaries -- three language adapters are one concept to a reader orienting
 * themselves and three concepts to someone editing them.
 */
export function rollUp(modulePath: string): string {
  const parts = modulePath.split("/");
  return parts[0] === "src" ? parts.slice(0, 2).join("/") : (parts[0] ?? modulePath);
}

/** Product code, as opposed to the scaffolding that builds and measures it. */
export function isProduct(modulePath: string): boolean {
  return modulePath === "src" || modulePath.startsWith("src/");
}

/**
 * The simple projection: roll nested modules up, drop scaffolding, and keep
 * only resolved-majority edges.
 *
 * Deliberately a separate projection rather than a filter over the complete
 * one. Each reduction is also what makes the result unfit for auditing -- an
 * orientation map that shows a guess beside a fact teaches a wrong shape, and
 * unlike the complete map there is no toggle here to take it back.
 */
export function simplify(graph: ModuleGraph): ModuleGraph {
  const summaries = new Map<string, ModuleSummary>();
  for (const summary of graph.modules) {
    const path = rollUp(summary.path);
    if (!isProduct(path)) continue;
    const existing = summaries.get(path);
    if (existing) {
      existing.files += summary.files;
      existing.symbols += summary.symbols;
      existing.surface = [...new Set([...existing.surface, ...summary.surface])];
    } else {
      summaries.set(path, { ...summary, path, surface: [...summary.surface] });
    }
  }

  const merged = new Map<string, ModuleDependency>();
  for (const dependency of graph.dependencies) {
    if (evidenceOf(dependency) !== "resolved") continue;
    const from = rollUp(dependency.from);
    const to = rollUp(dependency.to);
    if (from === to || !isProduct(from) || !isProduct(to)) continue;
    const key = `${from}\u0000${to}`;
    const existing = merged.get(key);
    if (existing) {
      existing.total += dependency.total;
      existing.byTier.COMPILER += dependency.byTier.COMPILER;
      existing.byTier.LEXICAL += dependency.byTier.LEXICAL;
      existing.byTier.HEURISTIC += dependency.byTier.HEURISTIC;
    } else {
      merged.set(key, {
        from,
        to,
        total: dependency.total,
        byTier: { ...dependency.byTier },
      });
    }
  }

  return {
    ...graph,
    modules: [...summaries.values()].sort((left, right) =>
      left.path < right.path ? -1 : left.path > right.path ? 1 : 0
    ),
    dependencies: [...merged.values()].sort(compareDependencies),
  };
}

/**
 * Column assignment by longest path over the drawn subgraph.
 *
 * Deterministic and independent of insertion order: the same index must
 * produce the same layout, or a regenerated map cannot be compared with the
 * one it replaces. Cycles are bounded by an iteration cap rather than by
 * dropping an edge, so a cyclic pair stays visible as a pair.
 */
function assignRanks(
  modules: readonly string[],
  edges: readonly ModuleDependency[],
): Map<string, number> {
  const outgoing = new Map<string, string[]>();
  for (const edge of edges) {
    outgoing.set(edge.from, [...(outgoing.get(edge.from) ?? []), edge.to]);
  }
  const rank = new Map<string, number>(modules.map((path) => [path, 0]));
  for (let pass = 0; pass < modules.length; pass += 1) {
    let changed = false;
    for (const module of [...modules].sort()) {
      for (const target of [...(outgoing.get(module) ?? [])].sort()) {
        const candidate = (rank.get(module) ?? 0) + 1;
        if (candidate > (rank.get(target) ?? 0) && candidate < modules.length) {
          rank.set(target, candidate);
          changed = true;
        }
      }
    }
    if (!changed) break;
  }
  return rank;
}

const COLUMN = 260;
const ROW = 86;
const PAD = 70;

export function buildMapModel(graph: ModuleGraph, mode: MapMode): MapModel {
  const projected = mode === "simple" ? simplify(graph) : graph;
  const drawnEdges = projected.dependencies.filter(
    (dependency) => evidenceOf(dependency) !== "unverified",
  );
  const modulePaths = projected.modules.map((module) => module.path);
  const ranks = assignRanks(modulePaths, drawnEdges);

  // Compact the ranks to consecutive columns. Longest-path ranking over a
  // cyclic graph leaves wide gaps -- this repository reached rank 31 with eight
  // ranks occupied, stretching the canvas to 8460px of mostly empty space and
  // squashing the drawing into an unreadable band.
  const occupied = [...new Set(modulePaths.map((path) => ranks.get(path) ?? 0))]
    .sort((left, right) => left - right);
  const column = new Map(occupied.map((rank, index) => [rank, index]));

  const byColumn = new Map<number, string[]>();
  for (const path of [...modulePaths].sort()) {
    const index = column.get(ranks.get(path) ?? 0) ?? 0;
    byColumn.set(index, [...(byColumn.get(index) ?? []), path]);
  }

  const columns = Math.max(1, byColumn.size);
  const rows = Math.max(1, ...[...byColumn.values()].map((paths) => paths.length));
  const width = PAD * 2 + COLUMN * Math.max(0, columns - 1) + 200;
  const height = PAD * 2 + ROW * rows;
  const maxSymbols = Math.max(1, ...projected.modules.map((m) => m.symbols));

  const nodes: MapNode[] = [];
  for (const [index, paths] of [...byColumn.entries()].sort((a, b) => a[0] - b[0])) {
    const offset = (rows - paths.length) / 2;
    paths.forEach((path, row) => {
      const summary = projected.modules.find((module) => module.path === path);
      const symbols = summary?.symbols ?? 0;
      nodes.push({
        path,
        files: summary?.files ?? 0,
        symbols,
        surface: summary?.surface ?? [],
        x: PAD + index * COLUMN + 100,
        y: PAD + (offset + row) * ROW + ROW / 2,
        // Area, not radius, tracks symbol count: a radius-linear scale makes a
        // module four times the size look sixteen times heavier.
        r: 10 + 22 * Math.sqrt(symbols / maxSymbols),
      });
    });
  }

  const maxResolved = Math.max(1, ...drawnEdges.map(resolvedOf));
  const edges: MapEdge[] = projected.dependencies.map((dependency) => {
    const evidence = evidenceOf(dependency);
    return {
      from: dependency.from,
      to: dependency.to,
      resolved: resolvedOf(dependency),
      total: dependency.total,
      heuristic: dependency.byTier.HEURISTIC,
      evidence,
      // Thickness tracks resolved references and never raw volume. The swift
      // and typescript adapters share filenames and therefore function names,
      // manufacturing 62 "references" between modules that never import each
      // other; weighting by `total` would put that pair front and centre.
      weight:
        evidence === "unverified"
          ? 1
          : 1 + 5 * (resolvedOf(dependency) / maxResolved),
    };
  });

  return { mode, nodes, edges, width, height };
}

/**
 * Every module reachable from a seed by following edges in `direction`.
 *
 * This is what Phase 0 showed both artifacts missing. Asked which modules must
 * be checked when `src/store` changes, a reader of the committed document saw
 * the handful of rows that fitted; the answer is the transitive closure, and
 * neither a table nor a one-hop highlight produces it.
 */
export function reachable(
  edges: readonly MapEdge[],
  seed: string,
  direction: "downstream" | "upstream",
): Set<string> {
  const next = new Map<string, string[]>();
  for (const edge of edges) {
    if (edge.evidence === "unverified") continue;
    // A dependency points from dependant to dependency, so "what breaks if I
    // change X" walks edges backwards: upstream keys by `to`.
    const [from, to] =
      direction === "downstream" ? [edge.from, edge.to] : [edge.to, edge.from];
    next.set(from, [...(next.get(from) ?? []), to]);
  }
  const seen = new Set<string>();
  const queue = [seed];
  while (queue.length > 0) {
    const current = queue.shift() as string;
    for (const target of next.get(current) ?? []) {
      if (seen.has(target)) continue;
      seen.add(target);
      queue.push(target);
    }
  }
  seen.delete(seed);
  return seen;
}
