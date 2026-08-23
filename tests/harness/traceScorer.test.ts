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
    contextTokens: 20,
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
    expect(result.tierHits).toBeNull();
    expect(result.preliminarySuccess).toBe(true);
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

  it("scores the complete transitive retry impact chain", () => {
    const task = taskById("impact-retry-policy");

    const answer =
      "scheduleRetry and handleFailure lead to retryFailed; also run " +
      "src/scheduler/retryPolicy.test.ts.";
    expect(scoreTrace(task, traceFor(task, answer)).recallAtK).toBe(1);
  });

  it("rejects a trace recorded for a different task", () => {
    const task = taskById("implementations-of-notifier");
    const trace = traceFor(task, "EmailNotifier");
    trace.taskId = "different-task";

    expect(() => scoreTrace(task, trace)).toThrow(/different-task/);
  });

  it("matches identifiers at boundaries rather than inside unrelated words", () => {
    const task = taskById("impact-dispatch-two-hop");

    expect(scoreTrace(task, traceFor(task, "Restart the service.")).recallAtK)
      .toBe(0);
    expect(scoreTrace(task, traceFor(task, "start and run are affected.")).recallAtK)
      .toBe(1);
  });

  it("counts helpful and distractor mentions in preliminary success", () => {
    const source = taskById("implementations-of-notifier");
    const [required, distractor, helpful] = source.groundTruth.requiredEvidence;
    const task: BenchmarkTask = {
      ...source,
      id: "trace-distractors",
      groundTruth: {
        ...source.groundTruth,
        requiredEvidence: [required!],
        helpfulEvidence: [helpful!],
        distractors: [distractor!],
      },
    };
    const trace = traceFor(
      task,
      `${required!.qualifiedName}, ${helpful!.qualifiedName}, ${distractor!.qualifiedName}`,
    );

    const result = scoreTrace(task, trace);
    expect(result.helpfulHits).toBe(1);
    expect(result.distractorHits).toBe(1);
    expect(result.preliminarySuccess).toBe(false);
  });

  it("records a budget overrun instead of discarding the trace", () => {
    // The CodeGraph arm packs TO the budget and its recall already pays for
    // whatever does not fit (codegraphRunner.ts). Throwing away an over-budget
    // agentic trace measured the two arms asymmetrically in the baseline's
    // favour: it kept unconstrained recall while CodeGraph paid for truncation.
    const task = taskById("semantic-alerting-synonym");
    const trace = traceFor(task, "Notifier");
    trace.contextTokens = task.groundTruth.maxContextBudgetTokens + 89;

    const result = scoreTrace(task, trace);
    expect(result.budgetExceeded).toBe(true);
    expect(result.contextOverageTokens).toBe(89);
  });

  it("denies preliminary success to an over-budget trace even at full recall", () => {
    const task = taskById("semantic-alerting-synonym");
    const trace = traceFor(
      task,
      task.groundTruth.requiredEvidence.map((e) => e.qualifiedName).join(", "),
    );
    trace.contextTokens = task.groundTruth.maxContextBudgetTokens + 1;

    const result = scoreTrace(task, trace);
    expect(result.recallAtK).toBe(1);
    expect(result.preliminarySuccess).toBe(false);
  });

  it("reports no overage for a trace inside its budget", () => {
    const task = taskById("semantic-alerting-synonym");
    const trace = traceFor(task, "Notifier");
    trace.contextTokens = task.groundTruth.maxContextBudgetTokens;

    const result = scoreTrace(task, trace);
    expect(result.budgetExceeded).toBe(false);
    expect(result.contextOverageTokens).toBe(0);
  });

  it("rejects malformed and non-finite trace fields", () => {
    const task = taskById("semantic-alerting-synonym");
    const nonFinite = traceFor(task, "Notifier");
    nonFinite.inputTokens = Number.NaN;
    expect(() => scoreTrace(task, nonFinite)).toThrow(/inputTokens/i);

    const malformed = {
      ...traceFor(task, "Notifier"),
      finalAnswerText: undefined,
    } as unknown as AgentTrace;
    expect(() => scoreTrace(task, malformed)).toThrow(/finalAnswerText/i);
  });
});
