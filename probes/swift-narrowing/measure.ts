import { extname } from "node:path";
import type { ReferenceRecord, SymbolRecord } from "../../src/adapters/types.js";
import { extractSwiftModuleTables } from "../../src/adapters/swift/modules.js";
import { getSwiftParser, swiftParser } from "../../src/adapters/swift/parser.js";
import { extractSwiftReferences } from "../../src/adapters/swift/references.js";
import { extractSwiftSymbols } from "../../src/adapters/swift/symbols.js";
import { RepoBoundary } from "../../src/repo/boundary.js";
import { buildIgnore } from "../../src/repo/ignore.js";
import {
  assignTier,
  narrowCandidates,
} from "../../src/resolve/tiers.js";

interface ExtractedFile {
  path: string;
  references: ReferenceRecord[];
  importedModules: ReadonlySet<string>;
}

interface Distribution {
  LEXICAL: number;
  HEURISTIC: number;
  EXTERNAL: number;
  UNRESOLVED: number;
}

function discoverSwift(boundary: RepoBoundary): string[] {
  const ignore = buildIgnore(boundary);
  const files: string[] = [];

  const walk = (directory: string): void => {
    for (const entry of boundary.readDirectory(directory)) {
      const path = directory === "." ? entry.name : `${directory}/${entry.name}`;
      if (ignore.ignores(path) || entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        walk(path);
      } else if (entry.isFile() && extname(entry.name) === ".swift") {
        files.push(path);
      }
    }
  };

  walk(".");
  return files.sort();
}

function emptyDistribution(): Distribution {
  return { LEXICAL: 0, HEURISTIC: 0, EXTERNAL: 0, UNRESOLVED: 0 };
}

function increment(
  distribution: Distribution,
  tier: keyof Distribution,
): void {
  distribution[tier] += 1;
}

function percent(count: number, total: number): number {
  return total === 0 ? 0 : Number(((count / total) * 100).toFixed(2));
}

const root = process.argv[2];
if (!root) {
  throw new Error(
    "usage: node --import tsx probes/swift-narrowing/measure.ts <swift-repo>",
  );
}

const boundary = new RepoBoundary(root);
const paths = discoverSwift(boundary);
if (paths.length === 0) {
  throw new Error(`no Swift files found under ${boundary.root}`);
}

await getSwiftParser();

const symbols: SymbolRecord[] = [];
const extracted: ExtractedFile[] = [];
let sourceLines = 0;
let parseErrorFiles = 0;

for (const path of paths) {
  const source = boundary.readFile(path).toString("utf8");
  // Match the corpus baseline's `wc -l` convention rather than adding one
  // logical line per file after the final newline.
  sourceLines += source.split("\n").length - 1;
  const tree = swiftParser().parse(source);
  if (!tree) continue;
  if (tree.rootNode.hasError) parseErrorFiles += 1;

  const fileSymbols = extractSwiftSymbols(path, source, tree);
  const { imports } = extractSwiftModuleTables(tree);
  symbols.push(...fileSymbols);
  extracted.push({
    path,
    references: extractSwiftReferences(path, source, tree, fileSymbols),
    importedModules: new Set(imports.map((record) => record.specifier)),
  });
}

const symbolsByName = new Map<string, SymbolRecord[]>();
for (const symbol of symbols) {
  const candidates = symbolsByName.get(symbol.shortName) ?? [];
  candidates.push(symbol);
  symbolsByName.set(symbol.shortName, candidates);
}

const before = emptyDistribution();
const after = emptyDistribution();
let referenceCount = 0;
let referencesNarrowed = 0;
let candidatesBefore = 0;
let candidatesAfter = 0;
let moduleHintReferences = 0;
let explicitReceiverTypeReferences = 0;
let rule1ReferencesAffected = 0;
let rule1CandidatesRemoved = 0;
let rule3ReferencesAffected = 0;
let rule3CandidatesRemoved = 0;

for (const file of extracted) {
  for (const reference of file.references) {
    referenceCount += 1;
    if (reference.scopeHint?.module != null) moduleHintReferences += 1;
    if (reference.scopeHint?.receiverType != null) {
      explicitReceiverTypeReferences += 1;
    }
    const candidates = symbolsByName.get(reference.name) ?? [];
    candidatesBefore += candidates.length;
    const baseline = assignTier(reference, candidates, null).tier;
    if (baseline !== "COMPILER") {
      increment(before, baseline);
    }

    const withoutReceiverType = reference.scopeHint
      ? {
          ...reference,
          scopeHint: { ...reference.scopeHint, receiverType: null },
        }
      : reference;
    const fileNarrowed = narrowCandidates(
      withoutReceiverType,
      candidates,
      file.importedModules,
    );
    const removedByRule1 = candidates.length - fileNarrowed.length;
    if (removedByRule1 > 0) {
      rule1ReferencesAffected += 1;
      rule1CandidatesRemoved += removedByRule1;
    }

    const narrowed = narrowCandidates(
      reference,
      candidates,
      file.importedModules,
    );
    const removedByRule3 = fileNarrowed.length - narrowed.length;
    if (removedByRule3 > 0) {
      rule3ReferencesAffected += 1;
      rule3CandidatesRemoved += removedByRule3;
    }
    candidatesAfter += narrowed.length;
    const wasNarrowed = narrowed.length !== candidates.length;
    if (wasNarrowed) referencesNarrowed += 1;
    const narrowedTier = assignTier(reference, narrowed, null, wasNarrowed).tier;
    if (narrowedTier !== "COMPILER") {
      increment(after, narrowedTier);
    }
  }
}

const beforeInRepoReferences =
  before.LEXICAL + before.HEURISTIC + before.UNRESOLVED;
const afterInRepoReferences =
  after.LEXICAL + after.HEURISTIC + after.UNRESOLVED;
const unresolvedShare = percent(after.UNRESOLVED, afterInRepoReferences);
const placedShare = percent(
  after.LEXICAL + after.HEURISTIC,
  afterInRepoReferences,
);
const verdict = unresolvedShare <= 30 && placedShare >= 70
  ? "PASS"
  : unresolvedShare <= 50
    ? "MARGINAL"
    : "FAIL";

console.log(
  JSON.stringify({
    corpus: {
      description: "a real Swift application",
      swiftFiles: paths.length,
      sourceLines,
      parseErrorFiles,
      symbols: symbols.length,
      references: referenceCount,
    },
    candidates: {
      before: candidatesBefore,
      after: candidatesAfter,
      referencesNarrowed,
    },
    scopeEvidence: {
      moduleHintReferences,
      explicitReceiverTypeReferences,
      rule1: {
        referencesAffected: rule1ReferencesAffected,
        candidatesRemoved: rule1CandidatesRemoved,
      },
      rule2: {
        referencesWithModuleSignal: moduleHintReferences,
        note: "zero means the corpus is not laid out as a SwiftPM package",
      },
      rule3: {
        referencesAffected: rule3ReferencesAffected,
        candidatesRemoved: rule3CandidatesRemoved,
      },
    },
    before: {
      counts: before,
      externalShareOfAll: percent(before.EXTERNAL, referenceCount),
      inRepoReferences: beforeInRepoReferences,
      gatePercentages: {
        LEXICAL: percent(before.LEXICAL, beforeInRepoReferences),
        HEURISTIC: percent(before.HEURISTIC, beforeInRepoReferences),
        UNRESOLVED: percent(before.UNRESOLVED, beforeInRepoReferences),
      },
    },
    after: {
      counts: after,
      externalShareOfAll: percent(after.EXTERNAL, referenceCount),
      inRepoReferences: afterInRepoReferences,
      gatePercentages: {
        LEXICAL: percent(after.LEXICAL, afterInRepoReferences),
        HEURISTIC: percent(after.HEURISTIC, afterInRepoReferences),
        UNRESOLVED: unresolvedShare,
      },
    },
    verdict,
  }, null, 2),
);
