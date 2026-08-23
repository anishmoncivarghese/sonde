import { estimateJsonTokens, packToBudget } from "../../src/pack/tokens.js";
import { evidenceAppears } from "./evidenceMatch.js";
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

/** A retrieved item that survived the token budget, with its rendered text. */
interface IncludedEvidence {
  stableKey: string;
  text: string;
  tier?: EvidenceTier;
}

/**
 * Find the retrieved item that identifies this evidence, or null.
 *
 * Both arms are scored by the same rule (evidenceMatch.ts). Exact stable-key
 * membership was the previous rule here, and it scored a MORE precise answer as
 * a miss: `ts:src/index.ts#notifiers` did not equal a required `ts:src/index.ts#`,
 * while the agentic arm scored a hit for merely writing the path in prose.
 */
function findMatch(
  included: IncludedEvidence[],
  evidence: EvidenceSymbol,
): IncludedEvidence | null {
  return included.find((item) => evidenceAppears(item.text, evidence)) ?? null;
}

function countMatches(
  included: IncludedEvidence[],
  required: EvidenceSymbol[],
): number {
  return required.filter((item) => findMatch(included, item) !== null).length;
}

function recall(required: EvidenceSymbol[], included: IncludedEvidence[]): number {
  if (required.length === 0) return 1;
  return countMatches(included, required) / required.length;
}

function tierHits(
  required: EvidenceSymbol[],
  included: IncludedEvidence[],
): TierHitCounts {
  const counts: TierHitCounts = {
    compiler: 0,
    lexical: 0,
    heuristic: 0,
    unranked: 0,
  };
  for (const item of required) {
    const match = findMatch(included, item);
    if (!match) continue;
    const tier = match.tier;
    if (tier === "COMPILER") counts.compiler += 1;
    else if (tier === "LEXICAL") counts.lexical += 1;
    else if (tier === "HEURISTIC") counts.heuristic += 1;
    else counts.unranked += 1;
  }
  return counts;
}

export function runSondeTask(db: Db, task: BenchmarkTask): TaskResult {
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

  const rendered = retrieved.map((item) => ({
    id: item.stableKey,
    priority: 1,
    text: JSON.stringify(item.payload, null, 2),
  }));
  const packed = packToBudget(rendered, task.groundTruth.maxContextBudgetTokens);

  // Only evidence that survived the budget is scorable — the same constraint the
  // agentic arm is measured against.
  const matchedKeys = new Set(packed.included);
  const textByKey = new Map(rendered.map((item) => [item.id, item.text] as const));
  const included: IncludedEvidence[] = retrieved
    .filter((item) => matchedKeys.has(item.stableKey))
    .map((item) => ({
      stableKey: item.stableKey,
      text: textByKey.get(item.stableKey) ?? "",
      tier: item.tier,
    }));

  const recallAtK = recall(task.groundTruth.requiredEvidence, included);
  const helpfulHits = countMatches(included, task.groundTruth.helpfulEvidence);
  const distractorHits = countMatches(included, task.groundTruth.distractors);
  const hitsByTier = tierHits(task.groundTruth.requiredEvidence, included);
  const hasTieredSeed = task.seeds.some((seed) => seed.kind !== "find");

  return {
    taskId: task.id,
    category: task.category,
    baseline: "sonde",
    recallAtK,
    toolCalls: task.seeds.length,
    inputTokens: estimateJsonTokens(task.prompt),
    outputTokens: packed.estimatedTokens,
    contextTokens: packed.estimatedTokens,
    wallClockMs: Date.now() - startedAt,
    helpfulHits,
    distractorHits,
    // The packer truncates to the budget, so this arm cannot exceed it. The
    // fields are computed rather than hardcoded so the invariant stays visible
    // and would break loudly if the packer ever stopped enforcing it.
    budgetExceeded: packed.estimatedTokens > task.groundTruth.maxContextBudgetTokens,
    contextOverageTokens: Math.max(
      0,
      packed.estimatedTokens - task.groundTruth.maxContextBudgetTokens,
    ),
    preliminarySuccess:
      recallAtK === 1 &&
      distractorHits === 0 &&
      packed.estimatedTokens <= task.groundTruth.maxContextBudgetTokens,
    tierUtility: hasTieredSeed
      ? hitsByTier.heuristic / task.groundTruth.requiredEvidence.length
      : null,
    tierHits: hitsByTier,
  };
}
