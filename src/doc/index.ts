import { checkDrift } from "../index/drift.js";
import type { RepoBoundary } from "../repo/boundary.js";
import { gitState } from "../repo/git.js";
import type { Store } from "../store/index.js";
import { buildModuleGraph } from "./modules.js";
import { DOC_MARKER, renderDoc, type DocStamp } from "./render.js";

export const DOC_PATH = "ARCHITECTURE.md";

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

export function generateDoc(boundary: RepoBoundary, store: Store): string {
  const graph = buildModuleGraph(store.docEdgeRows(), store.docSymbolCounts());
  if (graph.modules.length === 0) throw new NoDocumentableModulesError();

  const git = gitState(boundary);
  const drift = checkDrift(boundary, store);
  const stamp: DocStamp = {
    revision: git.revision,
    dirty: git.dirty,
    driftedFiles: drift.driftCount,
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
