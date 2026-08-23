import { describe, expect, it } from "vitest";

import { renderBenchmarkReport } from "../../bench/harness/report.js";
import { BENCHMARK_TASKS } from "../../bench/harness/tasks.js";
import type { TaskResult } from "../../bench/harness/types.js";

function result(
  taskId: string,
  baseline: TaskResult["baseline"],
  recallAtK: number,
): TaskResult {
  const task = BENCHMARK_TASKS.find((candidate) => candidate.id === taskId);
  if (!task) throw new Error(`Missing benchmark task: ${taskId}`);
  return {
    taskId,
    category: task.category,
    baseline,
    recallAtK,
    toolCalls: 1,
    inputTokens: 10,
    outputTokens: 5,
    contextTokens: 5,
    wallClockMs: 20,
    helpfulHits: 0,
    distractorHits: 0,
    budgetExceeded: false,
    contextOverageTokens: 0,
    preliminarySuccess: recallAtK === 1,
    tierUtility: baseline === "sonde" ? 0.5 : null,
    tierHits: baseline === "sonde"
      ? { compiler: 0, lexical: 1, heuristic: 0, unranked: 0 }
      : null,
  };
}

describe("renderBenchmarkReport", () => {
  const generatedAt = new Date("2026-08-21T00:00:00.000Z");
  const sondeResults = BENCHMARK_TASKS.map((task) =>
    result(task.id, "sonde", 1),
  );

  it("publishes measured Sonde results and labels a missing baseline pending", () => {
    const report = renderBenchmarkReport(sondeResults, [], generatedAt);

    expect(report).toContain("Generated: 2026-08-21T00:00:00.000Z");
    expect(report).toContain(
      "| Sonde | 1.000 | 1.000 | 0.00 | 0.00 | 1.0 | 10 | 5 | 5 | 20 | 0.500 |",
    );
    expect(report).toContain(
      "| Agentic search | PENDING — live baseline not yet run (0/12 traces) |",
    );
    expect(report).toContain("Adversarially selected per spec §10 Layer 3");
    expect(report).toContain("Preliminary success requires recall@k = 1");
    expect(report).toContain("C/L/H/U required hits");
    expect(report).toContain(
      "| implementations-of-notifier | wide_interface | 1.00 | yes | 0/1/0/0 | PENDING | PENDING |",
    );
  });

  it("does not present a partial set of traces as a complete summary", () => {
    const first = BENCHMARK_TASKS[0]!;
    const report = renderBenchmarkReport(
      sondeResults,
      [result(first.id, "agentic_search", 0.5)],
      generatedAt,
    );

    expect(report).toContain("PENDING — live baseline incomplete (1/12 traces)");
    expect(report).toContain(
      `| ${first.id} | ${first.category} | 1.00 | yes | 0/1/0/0 | 0.50 | no |`,
    );
  });

  it("rejects duplicate, missing, and wrong-baseline result sets", () => {
    const duplicated = [...sondeResults.slice(0, -1), sondeResults[0]!];
    expect(() => renderBenchmarkReport(duplicated, [], generatedAt))
      .toThrow(/duplicate|missing/i);

    const wrongBaseline = [
      { ...sondeResults[0]!, baseline: "agentic_search" as const },
      ...sondeResults.slice(1),
    ];
    expect(() => renderBenchmarkReport(wrongBaseline, [], generatedAt))
      .toThrow(/baseline/i);
  });

  it("rejects non-finite and out-of-range metrics", () => {
    const invalid = [
      { ...sondeResults[0]!, recallAtK: Number.NaN },
      ...sondeResults.slice(1),
    ];
    expect(() => renderBenchmarkReport(invalid, [], generatedAt))
      .toThrow(/recallAtK/i);

    // An over-budget result is reported, not rejected — but its overage fields
    // must stay consistent with the contextTokens it claims, or a hand-edited
    // result could silently launder a budget overrun into a success.
    const inconsistentOverage = [
      {
        ...sondeResults[0]!,
        contextTokens:
          BENCHMARK_TASKS[0]!.groundTruth.maxContextBudgetTokens + 1,
      },
      ...sondeResults.slice(1),
    ];
    expect(() => renderBenchmarkReport(inconsistentOverage, [], generatedAt))
      .toThrow(/contextOverageTokens/i);

    const consistentOverage = [
      {
        ...sondeResults[0]!,
        contextTokens:
          BENCHMARK_TASKS[0]!.groundTruth.maxContextBudgetTokens + 1,
        contextOverageTokens: 1,
        budgetExceeded: true,
        preliminarySuccess: false,
      },
      ...sondeResults.slice(1),
    ];
    expect(() => renderBenchmarkReport(consistentOverage, [], generatedAt))
      .not.toThrow();
  });
});
