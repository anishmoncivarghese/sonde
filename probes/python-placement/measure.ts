import { relative } from "node:path";
import type { ReferenceRecord } from "../../src/adapters/types.js";
import { pythonAdapter } from "../../src/adapters/python/index.js";
import { getPythonParser } from "../../src/adapters/python/parser.js";
import { buildExportMap } from "../../src/link/exportmap.js";
import { bindImports, type Binding } from "../../src/link/imports.js";
import { resolveForFile } from "../../src/link/moduleResolver.js";
import { discover } from "../../src/repo/discover.js";
import { RepoBoundary } from "../../src/repo/boundary.js";
import { resolveAll } from "../../src/resolve/resolver.js";
import { SymbolTable } from "../../src/resolve/symboltable.js";
import { assignTier, narrowCandidates } from "../../src/resolve/tiers.js";
import type { Tier } from "../../src/store/repos.js";

interface Distribution {
  COMPILER: number;
  LEXICAL: number;
  HEURISTIC: number;
  EXTERNAL: number;
  UNRESOLVED: number;
}

function bindingForReference(
  ref: ReferenceRecord,
  bindings: Map<string, Binding>,
): Binding | null {
  return bindings.get(ref.receiver ?? ref.name) ?? null;
}

function percent(count: number, total: number): number {
  return total === 0 ? 0 : Number(((count / total) * 100).toFixed(2));
}

const root = process.argv[2];
if (!root) throw new Error("usage: measure.ts <repo-path>");

await getPythonParser();
const boundary = new RepoBoundary(root);
const files = discover(boundary, {
  hashContent: false,
  extensions: new Set([".py", ".pyi"]),
}).map((file) => file.path);
if (files.length === 0) {
  throw new Error(`no Python files found under ${boundary.root}`);
}

const extracted = new Map(
  files.map((file) => [
    file,
    pythonAdapter.extract(file, boundary.readFile(file)),
  ]),
);

const cfg = {} as never;
const exportMap = buildExportMap(extracted, cfg, boundary, resolveForFile);
const resolved = resolveAll(extracted, exportMap, cfg, boundary);

const table = new SymbolTable();
for (const [file, result] of extracted) {
  for (const symbol of result.symbols) table.add(file, symbol);
}

const counts: Distribution = {
  COMPILER: 0,
  LEXICAL: 0,
  HEURISTIC: 0,
  EXTERNAL: 0,
  UNRESOLVED: 0,
};

for (const [file, result] of extracted) {
  const bindings = bindImports(
    file,
    result.imports,
    exportMap,
    cfg,
    boundary,
    resolveForFile,
  );
  const importedModules = new Set(
    result.imports.map(
      (imported) => imported.specifier.split(".")[0] ?? imported.specifier,
    ),
  );

  for (const ref of result.references) {
    let binding = bindingForReference(ref, bindings);
    let candidateName = ref.name;
    let candidateFile: string | null = null;

    if (binding && "file" in binding) {
      if (ref.receiver === null) {
        candidateName = binding.name;
        candidateFile = binding.file;
      } else if (binding.name === "*") {
        candidateFile = exportMap.get(binding.file)?.get(ref.name) ?? null;
        if (candidateFile === null) {
          binding = {
            unresolved: "unexported_import",
            targetFile: binding.file,
            targetName: ref.name,
          };
        }
      } else {
        candidateFile = binding.file;
      }
    }

    let candidates = table.candidates(candidateName);
    if (candidateFile !== null) {
      candidates = table.candidatesInFile(candidateFile, candidateName);
    }
    const beforeNarrowing = candidates;
    candidates = narrowCandidates(ref, candidates, importedModules);
    const { tier } = assignTier(
      ref,
      candidates,
      binding,
      candidates.length !== beforeNarrowing.length,
    );
    counts[tier] += 1;

    // Count references, not resolver edges: one ambiguous reference can emit
    // several candidate edges, and resolveAll also emits structural edges.
    // Still require the production resolver to expose the same disposition so
    // this scorer cannot silently drift from the path the product uses.
    const represented = tier === "UNRESOLVED"
      ? resolved.unresolved.some(
          (row) =>
            row.srcKey === ref.fromSymbolKey &&
            row.name === ref.name &&
            row.kind === ref.kind &&
            row.siteLine === ref.siteLine,
        )
      : tier === "EXTERNAL"
        ? resolved.external.some(
            (row) =>
              row.srcKey === ref.fromSymbolKey &&
              row.name === ref.name &&
              row.siteLine === ref.siteLine,
          )
        : resolved.edges.some(
            (edge) =>
              edge.srcKey === ref.fromSymbolKey &&
              edge.kind === ref.kind &&
              edge.siteLine === ref.siteLine &&
              edge.tier === tier,
          );
    if (!represented) {
      throw new Error(
        `probe disagrees with production resolver for ${ref.fromSymbolKey} ` +
          `${ref.name}:${ref.siteLine} (${tier satisfies Tier})`,
      );
    }
  }
}

const unresolvedByReason = Object.fromEntries(
  [...Map.groupBy(resolved.unresolved, (row) => row.reason)]
    .map(([reason, rows]) => [reason, rows.length])
    .sort((left, right) => right[1] - left[1]),
);
const topUnresolvedNames = [...Map.groupBy(
  resolved.unresolved,
  (row) => row.name,
)]
  .map(([name, rows]) => ({ name, count: rows.length }))
  .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name))
  .slice(0, 30);

const placed = counts.COMPILER + counts.LEXICAL + counts.HEURISTIC;
const inRepoReferences = placed + counts.UNRESOLVED;
const unresolvedShare = percent(counts.UNRESOLVED, inRepoReferences);
const placedShare = percent(placed, inRepoReferences);
const verdict =
  unresolvedShare <= 30 && placedShare >= 70
    ? "PASS"
    : unresolvedShare <= 50
      ? "MARGINAL"
      : "FAIL";

console.log(
  JSON.stringify(
    {
      repo: relative(process.cwd(), boundary.root) || boundary.root,
      files: files.length,
      parseErrorFiles: [...extracted.values()].filter(
        (result) => result.diagnostics.length > 0,
      ).length,
      references: Object.values(counts).reduce((sum, count) => sum + count, 0),
      ...counts,
      unresolved: counts.UNRESOLVED,
      inRepoReferences,
      unresolvedShare,
      placedShare,
      verdict,
      unresolvedByReason,
      topUnresolvedNames,
    },
    null,
    2,
  ),
);
