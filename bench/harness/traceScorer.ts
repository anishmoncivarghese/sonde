import type { AgentTrace, BenchmarkTask, TaskResult } from "./types.js";

function assertNonNegativeFinite(value: unknown, field: string): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(`AgentTrace.${field} must be a non-negative finite number`);
  }
}

function validateTrace(trace: AgentTrace): void {
  if (typeof trace !== "object" || trace === null) {
    throw new Error("AgentTrace must be an object");
  }
  if (typeof trace.taskId !== "string") {
    throw new Error("AgentTrace.taskId must be a string");
  }
  if (!Array.isArray(trace.toolCalls)) {
    throw new Error("AgentTrace.toolCalls must be an array");
  }
  for (const [index, call] of trace.toolCalls.entries()) {
    if (
      typeof call !== "object" || call === null ||
      typeof call.tool !== "string" || typeof call.resultSummary !== "string"
    ) {
      throw new Error(`AgentTrace.toolCalls[${index}] is malformed`);
    }
  }
  if (typeof trace.finalAnswerText !== "string") {
    throw new Error("AgentTrace.finalAnswerText must be a string");
  }
  assertNonNegativeFinite(trace.inputTokens, "inputTokens");
  assertNonNegativeFinite(trace.outputTokens, "outputTokens");
  assertNonNegativeFinite(trace.contextTokens, "contextTokens");
  assertNonNegativeFinite(trace.wallClockMs, "wallClockMs");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function boundedMatch(answer: string, value: string): boolean {
  const token = "[\\p{L}\\p{N}_$]";
  return new RegExp(
    `(?<!${token})${escapeRegExp(value)}(?!${token})`,
    "iu",
  ).test(answer);
}

function evidenceAppears(
  answer: string,
  evidence: BenchmarkTask["groundTruth"]["requiredEvidence"][number],
): boolean {
  return [evidence.qualifiedName, evidence.path, evidence.stableKey]
    .some((candidate) => boundedMatch(answer, candidate));
}

export function scoreTrace(task: BenchmarkTask, trace: AgentTrace): TaskResult {
  validateTrace(trace);
  if (trace.taskId !== task.id) {
    throw new Error(
      `Trace task ID ${trace.taskId} does not match benchmark task ${task.id}`,
    );
  }
  if (trace.contextTokens > task.groundTruth.maxContextBudgetTokens) {
    throw new Error(
      `Trace context budget exceeded for ${task.id}: ` +
        `${trace.contextTokens} > ${task.groundTruth.maxContextBudgetTokens}`,
    );
  }

  const answer = trace.finalAnswerText;
  const required = task.groundTruth.requiredEvidence;
  const hits = required.filter((evidence) => evidenceAppears(answer, evidence)).length;
  const helpfulHits = task.groundTruth.helpfulEvidence
    .filter((evidence) => evidenceAppears(answer, evidence)).length;
  const distractorHits = task.groundTruth.distractors
    .filter((evidence) => evidenceAppears(answer, evidence)).length;
  const recallAtK = hits / required.length;

  return {
    taskId: task.id,
    category: task.category,
    baseline: "agentic_search",
    recallAtK,
    toolCalls: trace.toolCalls.length,
    inputTokens: trace.inputTokens,
    outputTokens: trace.outputTokens,
    contextTokens: trace.contextTokens,
    wallClockMs: trace.wallClockMs,
    helpfulHits,
    distractorHits,
    preliminarySuccess: recallAtK === 1 && distractorHits === 0,
    tierUtility: null,
    tierHits: null,
  };
}
