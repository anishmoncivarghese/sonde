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
}

interface EdgeInput {
  srcFile: string;
  dstFile: string;
  dstName: string;
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

/** spec §3.1: a module is a source file's immediate parent directory. */
export function moduleOf(filePath: string): string {
  const cut = filePath.lastIndexOf("/");
  return cut <= 0 ? "." : filePath.slice(0, cut);
}

/** Aggregate store rows into a completely sorted, order-independent graph. */
export function buildModuleGraph(
  edges: EdgeInput[],
  symbolCounts: Array<{ filePath: string; symbols: number }>,
): ModuleGraph {
  const filesByModule = new Map<string, Set<string>>();
  const symbolsByModule = new Map<string, number>();
  for (const row of symbolCounts) {
    const modulePath = moduleOf(row.filePath);
    addToSet(filesByModule, modulePath, row.filePath);
    symbolsByModule.set(
      modulePath,
      (symbolsByModule.get(modulePath) ?? 0) + row.symbols,
    );
  }

  const dependencies = new Map<string, ModuleDependency>();
  const surfaceByModule = new Map<string, Set<string>>();
  const tierTotals = zeroTiers();

  for (const row of edges) {
    const from = moduleOf(row.srcFile);
    const to = moduleOf(row.dstFile);
    if (from === to || !isDocTier(row.tier)) continue;

    tierTotals[row.tier] += 1;
    const key = `${from}\u0000${to}`;
    let dependency = dependencies.get(key);
    if (!dependency) {
      dependency = { from, to, total: 0, byTier: zeroTiers() };
      dependencies.set(key, dependency);
    }
    dependency.total += 1;
    dependency.byTier[row.tier] += 1;
    addToSet(surfaceByModule, to, row.dstName);
  }

  const modulePaths = new Set<string>([
    ...filesByModule.keys(),
    ...surfaceByModule.keys(),
    ...[...dependencies.values()].flatMap(({ from, to }) => [from, to]),
  ]);

  return {
    modules: [...modulePaths].sort().map((path) => ({
      path,
      files: filesByModule.get(path)?.size ?? 0,
      symbols: symbolsByModule.get(path) ?? 0,
      surface: [...(surfaceByModule.get(path) ?? [])].sort(),
    })),
    dependencies: [...dependencies.values()].sort((left, right) => {
      if (left.from !== right.from) return left.from < right.from ? -1 : 1;
      if (left.to === right.to) return 0;
      return left.to < right.to ? -1 : 1;
    }),
    tierTotals,
  };
}
