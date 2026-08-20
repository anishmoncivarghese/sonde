import { describe, expect, it } from "vitest";

import { scoreTrace } from "../../bench/harness/traceScorer.js";
import { BENCHMARK_TASKS } from "../../bench/harness/tasks.js";
import type { AgentTrace, BenchmarkTask } from "../../bench/harness/types.js";

function taskById(id: string): BenchmarkTask {
  const task = BENCHMARK_TASKS.find((candidate) => candidate.id === id);
  if (!task) throw new Error(`Missing benchmark task: ${id}`);
  return task;
}

function traceFor(task: BenchmarkTask, finalAnswerText: string): AgentTrace {
  return {
    taskId: task.id,
    toolCalls: [],
    finalAnswerText,
    inputTokens: 100,
    outputTokens: 10,
    wallClockMs: 500,
  };
}

describe("scoreTrace", () => {
  it("finds full recall when every required symbol is named in the answer", () => {
    const task = taskById("implementations-of-notifier");
    const trace = traceFor(
      task,
      "EmailNotifier, SlackNotifier, SmsNotifier, WebhookNotifier, and " +
        "ConsoleNotifier all implement Notifier.",
    );
    trace.toolCalls.push({
      tool: "grep",
      input: { pattern: "implements Notifier" },
      resultSummary: "5 matches",
    });

    const result = scoreTrace(task, trace);
    expect(result.recallAtK).toBe(1);
    expect(result.baseline).toBe("agentic_search");
    expect(result.toolCalls).toBe(1);
    expect(result.tierUtility).toBeNull();
  });

  it("scores partial recall case-insensitively", () => {
    const task = taskById("implementations-of-notifier");
    const trace = traceFor(
      task,
      "emailnotifier and SLACKNOTIFIER implement Notifier.",
    );

    const result = scoreTrace(task, trace);
    expect(result.recallAtK).toBeCloseTo(2 / 5);
  });

  it("gives true-negative tasks full recall", () => {
    const task = taskById("impact-retry-policy");

    expect(scoreTrace(task, traceFor(task, "No callers were found.")).recallAtK).toBe(1);
  });

  it("rejects a trace recorded for a different task", () => {
    const task = taskById("implementations-of-notifier");
    const trace = traceFor(task, "EmailNotifier");
    trace.taskId = "different-task";

    expect(() => scoreTrace(task, trace)).toThrow(/different-task/);
  });
});
