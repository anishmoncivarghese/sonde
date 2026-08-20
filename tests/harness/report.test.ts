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
    preliminarySuccess: recallAtK === 1,
    tierUtility: baseline === "codegraph" ? 0.5 : null,
    tierHits: baseline === "codegraph"
      ? { compiler: 0, lexical: 1, heuristic: 0, unranked: 0 }
      : null,
  };
}

describe("renderBenchmarkReport", () => {
  const generatedAt = new Date("2026-08-21T00:00:00.000Z");
  const codegraphResults = BENCHMARK_TASKS.map((task) =>
    result(task.id, "codegraph", 1),
  );

  it("publishes measured CodeGraph results and labels a missing baseline pending", () => {
    const report = renderBenchmarkReport(codegraphResults, [], generatedAt);

    expect(report).toContain("Generated: 2026-08-21T00:00:00.000Z");
    expect(report).toContain(
      "| CodeGraph | 1.000 | 1.000 | 0.00 | 0.00 | 1.0 | 10 | 5 | 5 | 20 | 0.500 |",
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
      codegraphResults,
      [result(first.id, "agentic_search", 0.5)],
      generatedAt,
    );

    expect(report).toContain("PENDING — live baseline incomplete (1/12 traces)");
    expect(report).toContain(
      `| ${first.id} | ${first.category} | 1.00 | yes | 0/1/0/0 | 0.50 | no |`,
    );
  });

  it("rejects duplicate, missing, and wrong-baseline result sets", () => {
    const duplicated = [...codegraphResults.slice(0, -1), codegraphResults[0]!];
    expect(() => renderBenchmarkReport(duplicated, [], generatedAt))
      .toThrow(/duplicate|missing/i);

    const wrongBaseline = [
      { ...codegraphResults[0]!, baseline: "agentic_search" as const },
      ...codegraphResults.slice(1),
    ];
    expect(() => renderBenchmarkReport(wrongBaseline, [], generatedAt))
      .toThrow(/baseline/i);
  });

  it("rejects non-finite and out-of-range metrics", () => {
    const invalid = [
      { ...codegraphResults[0]!, recallAtK: Number.NaN },
      ...codegraphResults.slice(1),
    ];
    expect(() => renderBenchmarkReport(invalid, [], generatedAt))
      .toThrow(/recallAtK/i);

    const overBudget = [
      {
        ...codegraphResults[0]!,
        contextTokens:
          BENCHMARK_TASKS[0]!.groundTruth.maxContextBudgetTokens + 1,
      },
      ...codegraphResults.slice(1),
    ];
    expect(() => renderBenchmarkReport(overBudget, [], generatedAt))
      .toThrow(/contextTokens/i);
  });
});
