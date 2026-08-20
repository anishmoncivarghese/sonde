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
    wallClockMs: 20,
    tierUtility: baseline === "codegraph" ? 0.5 : null,
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
    expect(report).toContain("| CodeGraph | 1.000 | 1.0 | 10 | 5 | 20 | 0.500 |");
    expect(report).toContain(
      "| Agentic search | PENDING — live baseline not yet run (0/12 traces) |",
    );
    expect(report).toContain("Adversarially selected per spec §10 Layer 3");
    expect(report).toContain(
      "| implementations-of-notifier | wide_interface | 1.00 | PENDING |",
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
    expect(report).toContain(`| ${first.id} | ${first.category} | 1.00 | 0.50 |`);
  });
});
