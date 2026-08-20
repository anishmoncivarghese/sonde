import { estimateJsonTokens } from "../../src/pack/tokens.js";
import { findSymbols } from "../../src/query/find.js";
import { getImpactRadius } from "../../src/query/impact.js";
import { queryGraph } from "../../src/query/traverse.js";
import { RepoBoundary } from "../../src/repo/boundary.js";
import type { Db } from "../../src/store/db.js";
import type {
  BenchmarkTask,
  EvidenceSymbol,
  TaskResult,
} from "./types.js";

type EvidenceTier = "COMPILER" | "LEXICAL" | "HEURISTIC";

interface MatchedEvidence {
  matchedKeys: Set<string>;
  tiers: Map<string, EvidenceTier>;
}

function recall(required: EvidenceSymbol[], matched: Set<string>): number {
  if (required.length === 0) return 1;
  const hits = required.filter((item) => matched.has(item.stableKey)).length;
  return hits / required.length;
}

function tierUtility(
  required: EvidenceSymbol[],
  evidence: MatchedEvidence,
): number | null {
  const tieredRequired = required
    .filter((item) => evidence.matchedKeys.has(item.stableKey))
    .map((item) => evidence.tiers.get(item.stableKey))
    .filter((tier): tier is EvidenceTier => tier !== undefined);
  if (tieredRequired.length === 0) return null;
  const useful = tieredRequired.filter((tier) =>
    tier === "LEXICAL" || tier === "HEURISTIC"
  ).length;
  return useful / tieredRequired.length;
}

export function runCodegraphTask(db: Db, task: BenchmarkTask): TaskResult {
  const startedAt = Date.now();
  const payloads: unknown[] = [];
  const evidence: MatchedEvidence = {
    matchedKeys: new Set(),
    tiers: new Map(),
  };

  for (const seed of task.seeds) {
    if (seed.kind === "traverse") {
      const result = queryGraph(db, {
        pattern: seed.pattern,
        symbol: seed.symbol,
      });
      payloads.push(result);
      for (const [tier, rows] of [
        ["COMPILER", result.compiler],
        ["LEXICAL", result.lexical],
        ["HEURISTIC", result.heuristic],
      ] as const) {
        for (const row of rows) {
          evidence.matchedKeys.add(row.stableKey);
          evidence.tiers.set(row.stableKey, tier);
        }
      }
    } else if (seed.kind === "impact") {
      const result = getImpactRadius(
        db,
        new RepoBoundary(task.fixture),
        { symbols: seed.symbols },
      );
      payloads.push(result);
      for (const row of result.affected) {
        evidence.matchedKeys.add(row.stableKey);
        evidence.tiers.set(row.stableKey, row.tier);
      }
    } else {
      const results = findSymbols(db, { query: seed.query });
      payloads.push(results);
      for (const row of results) evidence.matchedKeys.add(row.stableKey);
      // find_symbols has exact/FTS reasons, not graph evidence tiers.
    }
  }

  return {
    taskId: task.id,
    category: task.category,
    baseline: "codegraph",
    recallAtK: recall(
      task.groundTruth.requiredEvidence,
      evidence.matchedKeys,
    ),
    toolCalls: task.seeds.length,
    inputTokens: estimateJsonTokens(task.prompt),
    outputTokens: estimateJsonTokens(payloads),
    wallClockMs: Date.now() - startedAt,
    tierUtility: tierUtility(task.groundTruth.requiredEvidence, evidence),
  };
}
