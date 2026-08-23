import type { ExtractResult, ReferenceRecord } from "../adapters/types.js";
import type { ExportMap } from "../link/exportmap.js";
import { bindImports, type Binding } from "../link/imports.js";
import type { RepoBoundary } from "../repo/boundary.js";
import type { EdgeRow } from "../store/repos.js";
import type { TsConfig } from "../tsconfig/load.js";
import { SymbolTable } from "./symboltable.js";
import { AMBIGUITY_CAP, assignTier } from "./tiers.js";

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

    const fileSymbolRow = table.qualifiedInFile(file, file);
    if (fileSymbolRow) {
      const importTargets = new Map<string, number>();
      const importPackages = new Map<string, number>();
      for (const imported of result.imports) {
        const binding = bindings.get(imported.localName);
        if (!binding) continue;
        if ("file" in binding && !importTargets.has(binding.file)) {
          importTargets.set(binding.file, imported.siteLine);
        } else if (
          "external" in binding &&
          !importPackages.has(binding.external)
        ) {
          importPackages.set(binding.external, imported.siteLine);
        }
      }

      for (const [targetFile, siteLine] of importTargets) {
        if (targetFile === file) continue;
        const target = table.qualifiedInFile(targetFile, targetFile);
        if (!target) continue;
        out.edges.push({
          srcKey: fileSymbolRow.stableKey,
          dstKey: target.stableKey,
          kind: "IMPORTS",
          tier: "LEXICAL",
          confidence: 1,
          siteLine,
        });
      }

      for (const [packageOrLib, siteLine] of importPackages) {
        out.external.push({
          srcKey: fileSymbolRow.stableKey,
          name: packageOrLib,
          packageOrLib,
          siteLine,
        });
      }
    }

    for (const symbol of result.symbols) {
      if (symbol.kind === "file") continue;
      const separator = symbol.qualifiedName.lastIndexOf(".");
      const parentName = separator < 0
        ? file
        : symbol.qualifiedName.slice(0, separator);
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
          // A capped member call is not "no candidate" — it is too many. Naming
          // it distinctly keeps the unresolved count diagnosable.
          reason: candidates.length > AMBIGUITY_CAP
            ? "too_ambiguous"
            : history?.parseFailedNames?.has(historicalName)
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
