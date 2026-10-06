import { checkDrift } from "../index/drift.js";
import type { RepoBoundary } from "../repo/boundary.js";
import { gitState } from "../repo/git.js";
import type { Store } from "../store/index.js";
import { findNestedProjectRoots } from "../doc/index.js";
import { buildModuleGraph } from "../doc/modules.js";
import { buildMapModel, type MapMode } from "./model.js";
import { MAP_MARKER, renderMap, type MapStamp } from "./render.js";

export const MAP_PATH = "ARCHITECTURE.html";

export class NoMappableModulesError extends Error {
  constructor() {
    super("index contains no modules; run `sonde index` on a source repository");
    this.name = "NoMappableModulesError";
  }
}

export interface GenerateMapOptions {
  mode?: MapMode;
  includeTests?: boolean;
}

function missingTsConfig(boundary: RepoBoundary, filePaths: readonly string[]): boolean {
  if (!filePaths.some((path) => /\.(ts|tsx|mts|cts)$/.test(path))) return false;
  try {
    boundary.stat("tsconfig.json");
    return false;
  } catch {
    return true;
  }
}

export function generateMap(
  boundary: RepoBoundary,
  store: Store,
  options: GenerateMapOptions = {},
): string {
  const symbolCounts = store.docSymbolCounts();
  // The same projection `sonde doc` uses, through the same helper rather than a
  // copy of it: a map whose provenance contradicts the document it accompanies
  // is worse than no map.
  const graph = buildModuleGraph(store.docEdgeRows(), symbolCounts, {
    includeTests: options.includeTests,
    nestedProjectRoots: findNestedProjectRoots(
      boundary,
      symbolCounts.map((row) => row.filePath.split("/").slice(0, -1).join("/")),
    ),
  });
  if (graph.modules.length === 0) throw new NoMappableModulesError();

  const model = buildMapModel(graph, options.mode ?? "simple");
  const git = gitState(boundary);
  const drift = checkDrift(boundary, store);
  const stamp: MapStamp = {
    revision: git.revision,
    dirty: git.dirty,
    driftedFiles: drift.driftCount,
    excludedTestModules: graph.excludedTestModules,
    resolvedReferences: graph.tierTotals.COMPILER + graph.tierTotals.LEXICAL,
    heuristicReferences: graph.tierTotals.HEURISTIC,
    missingTsConfig: missingTsConfig(
      boundary,
      symbolCounts.map((row) => row.filePath),
    ),
  };
  return renderMap(model, stamp);
}

/**
 * The structural part of a rendered map: the embedded model, without the
 * provenance stamp.
 *
 * `--check` must ignore the stamp for the same reason `sonde doc --check`
 * ignores its header -- committing the artifact moves HEAD, so a stamped
 * revision would make the file permanently out of date with itself.
 */
export function structuralModel(html: string): string | null {
  const match = /<script id="model" type="application\/json">(.*?)<\/script>/s.exec(html);
  return match === null ? null : (match[1] ?? null);
}

export type WriteMapOutcome =
  | { action: "created" }
  | { action: "updated" }
  | { action: "unchanged" }
  | { action: "refused"; reason: "not-generated-by-sonde" };

export function writeMap(
  boundary: RepoBoundary,
  content: string,
  mapPath: string = MAP_PATH,
): WriteMapOutcome {
  let current: string | null = null;
  try {
    current = boundary.readFile(mapPath).toString("utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  if (current !== null && !current.includes(MAP_MARKER)) {
    // Never silently overwrite a file this tool did not write.
    return { action: "refused", reason: "not-generated-by-sonde" };
  }
  if (current === content) return { action: "unchanged" };
  boundary.writeFile(mapPath, content);
  return { action: current === null ? "created" : "updated" };
}
