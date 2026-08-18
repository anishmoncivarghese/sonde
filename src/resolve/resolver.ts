import type { ExtractResult, ReferenceRecord } from "../adapters/types.js";
import type { ExportMap } from "../link/exportmap.js";
import { bindImports, type Binding } from "../link/imports.js";
import type { RepoBoundary } from "../repo/boundary.js";
import type { EdgeRow } from "../store/repos.js";
import type { TsConfig } from "../tsconfig/load.js";
import { SymbolTable } from "./symboltable.js";
import { assignTier } from "./tiers.js";

export interface ExternalRow {
  srcKey: string;
  name: string;
  packageOrLib: string;
  siteLine: number | null;
}

export interface UnresolvedRow {
  srcKey: string;
  name: string;
  kind: string;
  siteLine: number | null;
  candidateCount: number;
  reason: string;
}

export interface ResolveOutput {
  edges: EdgeRow[];
  external: ExternalRow[];
  unresolved: UnresolvedRow[];
}

export interface ResolutionHistory {
  previousNames: ReadonlySet<string>;
  parseFailedNames?: ReadonlySet<string>;
  deletedNames?: ReadonlySet<string>;
}

function bindingForReference(
  ref: ReferenceRecord,
  bindings: Map<string, Binding>,
): Binding | null {
  // A member's import evidence belongs to its receiver. Falling back to an
  // unrelated import with the same member name would fabricate a target.
  return bindings.get(ref.receiver ?? ref.name) ?? null;
}

export function resolveAll(
  files: Map<string, ExtractResult>,
  exportMap: ExportMap,
  cfg: TsConfig,
  boundary: RepoBoundary,
  history?: ResolutionHistory,
): ResolveOutput {
  const table = new SymbolTable();
  for (const [file, result] of files) {
    for (const symbol of result.symbols) table.add(file, symbol);
  }

  const out: ResolveOutput = { edges: [], external: [], unresolved: [] };

  for (const [file, result] of files) {
    const bindings = bindImports(file, result.imports, exportMap, cfg, boundary);

    for (const symbol of result.symbols) {
      const separator = symbol.qualifiedName.lastIndexOf(".");
      if (separator < 0) continue;
      const parentName = symbol.qualifiedName.slice(0, separator);
      const parent = table.qualifiedInFile(file, parentName);
      if (!parent) continue;
      out.edges.push({
        srcKey: parent.stableKey,
        dstKey: symbol.stableKey,
        kind: "CONTAINS",
        tier: "LEXICAL",
        confidence: 1,
        siteLine: symbol.startLine,
      });
    }

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

      const { tier, confidence } = assignTier(ref, candidates, binding);

      // EXTERNAL is separate from genuinely unplaceable references so the
      // unresolved count remains a meaningful completeness signal (spec §4.4).
      if (tier === "EXTERNAL") {
        const externalBinding = binding as { external: string; name: string };
        const historicalName = externalBinding.name === "*"
          ? ref.name
          : externalBinding.name;
        if (history?.deletedNames?.has(historicalName)) {
          out.unresolved.push({
            srcKey: ref.fromSymbolKey,
            name: ref.name,
            kind: ref.kind,
            siteLine: ref.siteLine,
            candidateCount: 0,
            reason: "target_removed",
          });
          continue;
        }
        out.external.push({
          srcKey: ref.fromSymbolKey,
          name: ref.name,
          packageOrLib: externalBinding.external,
          siteLine: ref.siteLine,
        });
        continue;
      }

      if (tier === "UNRESOLVED") {
        const historicalName = binding && "unresolved" in binding
          ? binding.targetName
          : ref.name;
        out.unresolved.push({
          srcKey: ref.fromSymbolKey,
          name: ref.name,
          kind: ref.kind,
          siteLine: ref.siteLine,
          candidateCount: candidates.length,
          reason: history?.parseFailedNames?.has(historicalName)
            ? "parse_failed"
            : history?.previousNames.has(historicalName)
              ? "target_removed"
              : binding && "unresolved" in binding
                ? binding.unresolved
                : binding && "file" in binding
                  ? "binding_target_missing"
                  : "no_candidate",
        });
        continue;
      }

      for (const candidate of candidates) {
        out.edges.push({
          srcKey: ref.fromSymbolKey,
          dstKey: candidate.stableKey,
          kind: ref.kind,
          tier,
          confidence,
          siteLine: ref.siteLine,
        });
      }
    }
  }

  return out;
}
