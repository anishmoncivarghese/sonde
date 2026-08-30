export type DocTier = "COMPILER" | "LEXICAL" | "HEURISTIC";

export interface ModuleDependency {
  from: string;
  to: string;
  total: number;
  byTier: Record<DocTier, number>;
}

export interface ModuleSummary {
  path: string;
  files: number;
  symbols: number;
  /** Short names referenced from another module, sorted and deduplicated. */
  surface: string[];
}

export interface ModuleGraph {
  modules: ModuleSummary[];
  dependencies: ModuleDependency[];
  tierTotals: Record<DocTier, number>;
  omittedDependencies: number;
  excludedTestModules: number;
  /** Pairs sharing symbol names with no resolved reference between them. */
  unverifiedPairs: number;
}

export interface ModuleGraphOptions {
  includeTests?: boolean;
  /**
   * Directories that declare their own project manifest, and everything under
   * them. A fixture repository vendored under `tests/fixtures/` is a separate
   * project whose internals are not this repository's architecture.
   */
  nestedProjectRoots?: readonly string[];
}

/** spec §3.2: the diagram is a summary; the table remains complete. */
export const DIAGRAM_LIMIT = 25;

interface EdgeInput {
  srcFile: string;
  dstFile: string;
  dstName: string;
  dstKind?: string;
  kind: string;
  tier: string;
}

const DOC_TIERS: readonly DocTier[] = [
  "COMPILER",
  "LEXICAL",
  "HEURISTIC",
];

function zeroTiers(): Record<DocTier, number> {
  return { COMPILER: 0, LEXICAL: 0, HEURISTIC: 0 };
}

function isDocTier(tier: string): tier is DocTier {
  return DOC_TIERS.some((candidate) => candidate === tier);
}

function addToSet(
  map: Map<string, Set<string>>,
  key: string,
  value: string,
): void {
  const values = map.get(key);
  if (values) values.add(value);
  else map.set(key, new Set([value]));
}

function countName(
  map: Map<string, Map<string, number>>,
  key: string,
  name: string,
): void {
  const counts = map.get(key) ?? new Map<string, number>();
  counts.set(name, (counts.get(name) ?? 0) + 1);
  map.set(key, counts);
}

function isUnder(modulePath: string, root: string): boolean {
  return modulePath === root || modulePath.startsWith(`${root}/`);
}

/** References a module pair carries that were actually resolved, not guessed. */
export function resolvedOf(dependency: ModuleDependency): number {
  return dependency.byTier.COMPILER + dependency.byTier.LEXICAL;
}

/**
 * The single ordering rule for module dependencies.
 *
 * Exported and shared so the renderer cannot drift from the aggregation: the
 * two once held separate comparators that disagreed, and the renderer's
 * re-sort silently discarded this one.
 */
export function compareDependencies(
  left: ModuleDependency,
  right: ModuleDependency,
): number {
  const byResolved = resolvedOf(right) - resolvedOf(left);
  if (byResolved !== 0) return byResolved;
  if (left.total !== right.total) return right.total - left.total;
  if (left.from !== right.from) return left.from < right.from ? -1 : 1;
  if (left.to === right.to) return 0;
  return left.to < right.to ? -1 : 1;
}

/** spec §3.1: a module is a source file's immediate parent directory. */
export function moduleOf(filePath: string): string {
  const cut = filePath.lastIndexOf("/");
  return cut <= 0 ? "." : filePath.slice(0, cut);
}

/** Aggregate store rows into a completely sorted, order-independent graph. */
export function buildModuleGraph(
  edges: EdgeInput[],
  symbolCounts: Array<{
    filePath: string;
    symbols: number;
    testSymbols: number;
  }>,
  options: ModuleGraphOptions = {},
): ModuleGraph {
  const filesByModule = new Map<string, Set<string>>();
  const symbolsByModule = new Map<string, number>();
  const testSymbolsByModule = new Map<string, number>();
  for (const row of symbolCounts) {
    const modulePath = moduleOf(row.filePath);
    addToSet(filesByModule, modulePath, row.filePath);
    symbolsByModule.set(
      modulePath,
      (symbolsByModule.get(modulePath) ?? 0) + row.symbols,
    );
    testSymbolsByModule.set(
      modulePath,
      (testSymbolsByModule.get(modulePath) ?? 0) + row.testSymbols,
    );
  }

  const excludedModules = new Set<string>();
  if (options.includeTests !== true) {
    for (const [modulePath, symbols] of symbolsByModule) {
      if (
        symbols > 0 &&
        testSymbolsByModule.get(modulePath) === symbols
      ) {
        excludedModules.add(modulePath);
      }
    }
  }

  // A vendored project's internals are not this repository's architecture.
  for (const root of options.nestedProjectRoots ?? []) {
    for (const modulePath of filesByModule.keys()) {
      if (isUnder(modulePath, root)) excludedModules.add(modulePath);
    }
  }

  const dependencies = new Map<string, ModuleDependency>();
  const surfaceByModule = new Map<string, Map<string, number>>();
  const tierTotals = zeroTiers();

  for (const row of edges) {
    const from = moduleOf(row.srcFile);
    const to = moduleOf(row.dstFile);
    if (
      from === to ||
      excludedModules.has(from) ||
      excludedModules.has(to) ||
      !isDocTier(row.tier)
    ) continue;

    tierTotals[row.tier] += 1;
    const key = `${from}\u0000${to}`;
    let dependency = dependencies.get(key);
    if (!dependency) {
      dependency = { from, to, total: 0, byTier: zeroTiers() };
      dependencies.set(key, dependency);
    }
    dependency.total += 1;
    dependency.byTier[row.tier] += 1;
    // A module's surface is what other modules *demonstrably* use. A
    // heuristic edge is a name match, not a use: without it the surface fills
    // with `add`, `value`, `node` and other coincidences. Synthetic file
    // symbols are not surface either.
    if (row.tier !== "HEURISTIC" && row.dstKind !== "file") {
      countName(surfaceByModule, to, row.dstName);
    }
  }

  const modulePaths = new Set<string>([
    ...[...filesByModule.keys()].filter(
      (modulePath) => !excludedModules.has(modulePath),
    ),
    ...surfaceByModule.keys(),
    ...[...dependencies.values()].flatMap(({ from, to }) => [from, to]),
  ]);

  // Rank by resolved references, never by raw volume.
  //
  // Modules with parallel structure produce the most heuristic noise, not the
  // least: this repository's swift and typescript adapters share the filenames
  // symbols.ts/parser.ts/references.ts and therefore share function names,
  // which manufactured 62 "references" between two modules that do not import
  // each other at all. Volume of name matches is not evidence of coupling.
  const sortedDependencies = [...dependencies.values()].sort(compareDependencies);

  return {
    modules: [...modulePaths].sort().map((path) => ({
      path,
      files: filesByModule.get(path)?.size ?? 0,
      symbols: symbolsByModule.get(path) ?? 0,
      // Ranked by how often other modules reference it, so a truncated list
      // shows what matters rather than what sorts first. Ties break on name
      // to keep the document byte-identical across runs (spec §4.1).
      surface: [...(surfaceByModule.get(path) ?? new Map())]
        .sort((left, right) =>
          right[1] - left[1] || (left[0] < right[0] ? -1 : left[0] > right[0] ? 1 : 0)
        )
        .map(([name]) => name),
    })),
    dependencies: sortedDependencies,
    tierTotals,
    omittedDependencies: Math.max(
      0,
      sortedDependencies.filter((dep) => resolvedOf(dep) > 0).length -
        DIAGRAM_LIMIT,
    ),
    unverifiedPairs: sortedDependencies.filter(
      (dep) => resolvedOf(dep) === 0,
    ).length,
    excludedTestModules: excludedModules.size,
  };
}
