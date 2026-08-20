import type { AgentTrace, BenchmarkTask, TaskResult } from "./types.js";

export function scoreTrace(task: BenchmarkTask, trace: AgentTrace): TaskResult {
  if (trace.taskId !== task.id) {
    throw new Error(
      `Trace task ID ${trace.taskId} does not match benchmark task ${task.id}`,
    );
  }

  const answer = trace.finalAnswerText.toLowerCase();
  const required = task.groundTruth.requiredEvidence;
  const hits = required.filter((evidence) =>
    answer.includes(evidence.qualifiedName.toLowerCase()),
  ).length;

  return {
    taskId: task.id,
    category: task.category,
    baseline: "agentic_search",
    recallAtK: required.length === 0 ? 1 : hits / required.length,
    toolCalls: trace.toolCalls.length,
    inputTokens: trace.inputTokens,
    outputTokens: trace.outputTokens,
    wallClockMs: trace.wallClockMs,
    tierUtility: null,
  };
}
