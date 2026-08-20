import { describe, expect, it } from "vitest";
import { aggregateResults } from "../../bench/harness/metrics.js";
import type { TaskResult } from "../../bench/harness/types.js";

function result(overrides: Partial<TaskResult> = {}): TaskResult {
  return {
    taskId: "t",
    category: "transitive_impact",
    baseline: "codegraph",
    recallAtK: 1,
    toolCalls: 1,
    inputTokens: 10,
    outputTokens: 10,
    wallClockMs: 5,
    tierUtility: null,
    ...overrides,
  };
}

describe("aggregateResults", () => {
  it("averages recall, calls, tokens, and latency across tasks", () => {
    const metrics = aggregateResults([
      result({
        recallAtK: 1,
        toolCalls: 1,
        inputTokens: 100,
        outputTokens: 20,
        wallClockMs: 10,
      }),
      result({
        recallAtK: 0.5,
        toolCalls: 3,
        inputTokens: 200,
        outputTokens: 40,
        wallClockMs: 20,
      }),
    ]);

    expect(metrics).toMatchObject({
      taskCount: 2,
      meanRecallAtK: 0.75,
      meanToolCalls: 2,
      meanInputTokens: 150,
      meanOutputTokens: 30,
      meanWallClockMs: 15,
    });
  });

  it("averages tier utility only over tasks that reported it", () => {
    const metrics = aggregateResults([
      result({ tierUtility: 1 }),
      result({ tierUtility: null }),
      result({ tierUtility: 0.5 }),
    ]);
    expect(metrics.meanTierUtility).toBeCloseTo(0.75);
  });

  it("reports null tier utility when no task measured it", () => {
    expect(aggregateResults([result()]).meanTierUtility).toBeNull();
  });

  it("rejects empty and mixed-baseline result sets", () => {
    expect(() => aggregateResults([])).toThrow(/at least one/i);
    expect(() => aggregateResults([
      result({ baseline: "codegraph" }),
      result({ baseline: "agentic_search" }),
    ])).toThrow(/single baseline/i);
  });
});
