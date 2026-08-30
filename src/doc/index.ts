import { checkDrift } from "../index/drift.js";
import type { RepoBoundary } from "../repo/boundary.js";
import { gitState } from "../repo/git.js";
import type { Store } from "../store/index.js";
import { buildModuleGraph } from "./modules.js";
import { DOC_MARKER, renderDoc, type DocStamp } from "./render.js";

export const DOC_PATH = "ARCHITECTURE.md";

/**
 * Manifests that mark a directory as a project in its own right.
 *
 * A repository often vendors whole sample projects -- this one keeps three
 * fixture repositories under `tests/fixtures/repos/` -- and their internals are
 * not its architecture. Detecting them by their own manifest is mechanical,
 * so it is evidence rather than a naming heuristic (invariant 1).
 */
/**
 * TypeScript resolution needs a tsconfig.json to place cross-module imports.
 *
 * Without one the document renders every module with no dependencies at all,
 * which is honest -- no reference resolved -- but reads like a broken tool.
 * Invariant 8 says degrade with a warning rather than silently, so the
 * document says why it is empty.
 */
function missingTsConfigFor(
  boundary: RepoBoundary,
  filePaths: readonly string[],
): boolean {
  const hasTypeScript = filePaths.some((path) => /\.(ts|tsx|mts|cts)$/.test(path));
  if (!hasTypeScript) return false;
  try {
    boundary.stat("tsconfig.json");
    return false;
  } catch {
    return true;
  }
}

const PROJECT_MANIFESTS = [
  "package.json",
  "tsconfig.json",
  "pyproject.toml",
  "Package.swift",
];

function findNestedProjectRoots(
  boundary: RepoBoundary,
  modulePaths: readonly string[],
): string[] {
  const roots = new Set<string>();
  const checked = new Set<string>();
  for (const modulePath of modulePaths) {
    const parts = modulePath.split("/");
    // Walk each ancestor, but never the repository root itself: its own
    // manifest does not make the whole repository a nested project.
    for (let depth = 1; depth <= parts.length; depth++) {
      const dir = parts.slice(0, depth).join("/");
      if (dir === "" || dir === "." || checked.has(dir)) continue;
      checked.add(dir);
      for (const manifest of PROJECT_MANIFESTS) {
        try {
          boundary.stat(`${dir}/${manifest}`);
          roots.add(dir);
          break;
        } catch {
          // Absent manifest: not a project root by this signal.
        }
      }
    }
  }
  return [...roots].sort();
}

export class NoDocumentableModulesError extends Error {
  constructor() {
    super("index contains no modules; run `sonde index` on a source repository");
    this.name = "NoDocumentableModulesError";
  }
}

export type WriteOutcome =
  | { action: "created" }
  | { action: "updated" }
  | { action: "unchanged" }
  | { action: "refused"; reason: "not-generated-by-sonde" };

export interface GenerateDocOptions {
  includeTests?: boolean;
}

export function generateDoc(
  boundary: RepoBoundary,
  store: Store,
  options: GenerateDocOptions = {},
): string {
  const symbolCounts = store.docSymbolCounts();
  const graph = buildModuleGraph(store.docEdgeRows(), symbolCounts, {
    ...options,
    nestedProjectRoots: findNestedProjectRoots(
      boundary,
      symbolCounts.map((row) => row.filePath.split("/").slice(0, -1).join("/")),
    ),
  });
  if (graph.modules.length === 0) throw new NoDocumentableModulesError();

  const git = gitState(boundary);
  const drift = checkDrift(boundary, store);
  const stamp: DocStamp = {
    revision: git.revision,
    dirty: git.dirty,
    driftedFiles: drift.driftCount,
    missingTsConfig: missingTsConfigFor(
      boundary,
      symbolCounts.map((row) => row.filePath),
    ),
    parseFailures: store.countParseFailures(),
  };
  return renderDoc(graph, stamp);
}

/** spec §5.1: never clobber a file Sonde cannot identify as its own. */
export function writeDoc(
  boundary: RepoBoundary,
  content: string,
): WriteOutcome {
  let existing: string | null = null;
  try {
    existing = boundary.readFile(DOC_PATH).toString("utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }

  if (existing === null) {
    boundary.writeFile(DOC_PATH, content);
    return { action: "created" };
  }
  if (!existing.split(/\r?\n/).includes(DOC_MARKER)) {
    return { action: "refused", reason: "not-generated-by-sonde" };
  }
  if (existing === content) return { action: "unchanged" };

  boundary.writeFile(DOC_PATH, content);
  return { action: "updated" };
}
