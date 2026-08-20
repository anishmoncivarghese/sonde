import { estimateJsonTokens, packToBudget } from "../../src/pack/tokens.js";
import { findSymbols } from "../../src/query/find.js";
import { getImpactRadius } from "../../src/query/impact.js";
import { queryGraph } from "../../src/query/traverse.js";
import { RepoBoundary } from "../../src/repo/boundary.js";
import type { Db } from "../../src/store/db.js";
import type {
  BenchmarkTask,
  EvidenceSymbol,
  TaskResult,
  TierHitCounts,
} from "./types.js";

type EvidenceTier = "COMPILER" | "LEXICAL" | "HEURISTIC";

interface RetrievedEvidence {
  stableKey: string;
  payload: unknown;
  tier?: EvidenceTier;
}

function recall(required: EvidenceSymbol[], matched: Set<string>): number {
  if (required.length === 0) return 1;
  const hits = required.filter((item) => matched.has(item.stableKey)).length;
  return hits / required.length;
}

function tierHits(
  required: EvidenceSymbol[],
  matched: Set<string>,
  tiers: Map<string, EvidenceTier>,
): TierHitCounts {
  const counts: TierHitCounts = {
    compiler: 0,
    lexical: 0,
    heuristic: 0,
    unranked: 0,
  };
  for (const item of required) {
    if (!matched.has(item.stableKey)) continue;
    const tier = tiers.get(item.stableKey);
    if (tier === "COMPILER") counts.compiler += 1;
    else if (tier === "LEXICAL") counts.lexical += 1;
    else if (tier === "HEURISTIC") counts.heuristic += 1;
    else counts.unranked += 1;
  }
  return counts;
}

export function runCodegraphTask(db: Db, task: BenchmarkTask): TaskResult {
  const startedAt = Date.now();
  const retrieved: RetrievedEvidence[] = [];
  const indexByKey = new Map<string, number>();
  const tierRank: Record<EvidenceTier, number> = {
    COMPILER: 0,
    LEXICAL: 1,
    HEURISTIC: 2,
  };
  const add = (item: RetrievedEvidence): void => {
    const existingIndex = indexByKey.get(item.stableKey);
    if (existingIndex === undefined) {
      indexByKey.set(item.stableKey, retrieved.length);
      retrieved.push(item);
      return;
    }
    const existing = retrieved[existingIndex]!;
    if (
      item.tier !== undefined &&
      (existing.tier === undefined || tierRank[item.tier] < tierRank[existing.tier])
    ) {
      retrieved[existingIndex] = item;
    }
  };

  for (const seed of task.seeds) {
    if (seed.kind === "traverse") {
      const result = queryGraph(db, {
        pattern: seed.pattern,
        symbol: seed.symbol,
      });
      for (const [tier, rows] of [
        ["COMPILER", result.compiler],
        ["LEXICAL", result.lexical],
        ["HEURISTIC", result.heuristic],
      ] as const) {
        for (const row of rows) {
          add({ stableKey: row.stableKey, payload: { ...row, tier }, tier });
        }
      }
    } else if (seed.kind === "impact") {
      const result = getImpactRadius(
        db,
        new RepoBoundary(task.fixture),
        { symbols: seed.symbols },
      );
      for (const row of result.affected) {
        add({ stableKey: row.stableKey, payload: row, tier: row.tier });
      }
    } else {
      const results = findSymbols(db, { query: seed.query });
      for (const row of results) add({ stableKey: row.stableKey, payload: row });
    }
  }

  const packed = packToBudget(
    retrieved.map((item) => ({
      id: item.stableKey,
      priority: 1,
      text: JSON.stringify(item.payload, null, 2),
    })),
    task.groundTruth.maxContextBudgetTokens,
  );
  const matchedKeys = new Set(packed.included);
  const tiers = new Map(
    retrieved
      .filter((item) => matchedKeys.has(item.stableKey) && item.tier !== undefined)
      .map((item) => [item.stableKey, item.tier!] as const),
  );
  const recallAtK = recall(task.groundTruth.requiredEvidence, matchedKeys);
  const helpfulHits = task.groundTruth.helpfulEvidence
    .filter((item) => matchedKeys.has(item.stableKey)).length;
  const distractorHits = task.groundTruth.distractors
    .filter((item) => matchedKeys.has(item.stableKey)).length;
  const hitsByTier = tierHits(task.groundTruth.requiredEvidence, matchedKeys, tiers);
  const hasTieredSeed = task.seeds.some((seed) => seed.kind !== "find");

  return {
    taskId: task.id,
    category: task.category,
    baseline: "codegraph",
    recallAtK,
    toolCalls: task.seeds.length,
    inputTokens: estimateJsonTokens(task.prompt),
    outputTokens: packed.estimatedTokens,
    contextTokens: packed.estimatedTokens,
    wallClockMs: Date.now() - startedAt,
    helpfulHits,
    distractorHits,
    preliminarySuccess: recallAtK === 1 && distractorHits === 0,
    tierUtility: hasTieredSeed
      ? hitsByTier.heuristic / task.groundTruth.requiredEvidence.length
      : null,
    tierHits: hitsByTier,
  };
}
