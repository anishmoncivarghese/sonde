import type { TaskResult } from "./types.js";

export interface AggregatedMetrics {
  baseline: "agentic_search" | "sonde";
  taskCount: number;
  meanRecallAtK: number;
  meanToolCalls: number;
  meanInputTokens: number;
  meanOutputTokens: number;
  meanContextTokens: number;
  meanWallClockMs: number;
  meanHelpfulHits: number;
  meanDistractorHits: number;
  preliminarySuccessRate: number;
  meanTierUtility: number | null;
}

function mean(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function aggregateResults(results: TaskResult[]): AggregatedMetrics {
  if (results.length === 0) {
    throw new Error("aggregateResults requires at least one TaskResult");
  }
  const baseline = results[0]!.baseline;
  if (results.some((result) => result.baseline !== baseline)) {
    throw new Error("aggregateResults requires a single baseline per call");
  }

  const tierUtilities = results
    .map((result) => result.tierUtility)
    .filter((value): value is number => value !== null);

  return {
    baseline,
    taskCount: results.length,
    meanRecallAtK: mean(results.map((result) => result.recallAtK)),
    meanToolCalls: mean(results.map((result) => result.toolCalls)),
    meanInputTokens: mean(results.map((result) => result.inputTokens)),
    meanOutputTokens: mean(results.map((result) => result.outputTokens)),
    meanContextTokens: mean(results.map((result) => result.contextTokens)),
    meanWallClockMs: mean(results.map((result) => result.wallClockMs)),
    meanHelpfulHits: mean(results.map((result) => result.helpfulHits)),
    meanDistractorHits: mean(results.map((result) => result.distractorHits)),
    preliminarySuccessRate: mean(
      results.map((result) => result.preliminarySuccess ? 1 : 0),
    ),
    meanTierUtility: tierUtilities.length > 0 ? mean(tierUtilities) : null,
  };
}
