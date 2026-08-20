import type { AgentTrace, BenchmarkTask, TaskResult } from "./types.js";

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
