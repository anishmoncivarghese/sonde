import { describe, it, expect } from "vitest";

import {
  buildClaudeArgs,
  parseClaudeResult,
  toolCallsFromTranscript,
  type ClaudeResultJson,
} from "../../bench/harness/claudeCodeBaseline.js";
import { BENCHMARK_TASKS } from "../../bench/harness/tasks.js";

const task = BENCHMARK_TASKS[0]!;

const resultJson: ClaudeResultJson = {
  is_error: false,
  result: "EmailNotifier.notify and Dispatcher.dispatch break.",
  duration_ms: 6324,
  session_id: "e371a698-f25d-4630-abb9-68cd6d84a587",
  num_turns: 2,
  total_cost_usd: 0.25,
  usage: {
    input_tokens: 4,
    output_tokens: 164,
    cache_creation_input_tokens: 39823,
    cache_read_input_tokens: 39616,
  },
};

describe("buildClaudeArgs", () => {
  it("restricts the tool surface with --tools, not --allowedTools", () => {
    const args = buildClaudeArgs(task);
    expect(args).toContain("--tools");
    expect(args[args.indexOf("--tools") + 1]).toBe("Grep,Glob,Read");
    // --allowedTools only grants permission; it does not remove Bash from the
    // tool surface, which would let the baseline shell out to find/grep/awk.
    expect(args).not.toContain("--allowedTools");
  });

  it("requests structured output and passes the task prompt", () => {
    const args = buildClaudeArgs(task);
    expect(args[args.indexOf("--output-format") + 1]).toBe("json");
    expect(args).toContain("-p");
    expect(args).toContain(task.prompt);
  });
});

describe("parseClaudeResult", () => {
  it("maps a Claude Code result into an AgentTrace", () => {
    const trace = parseClaudeResult(task.id, resultJson, [], 0);
    expect(trace.taskId).toBe(task.id);
    expect(trace.finalAnswerText).toBe(resultJson.result);
    expect(trace.outputTokens).toBe(164);
    expect(trace.wallClockMs).toBe(6324);
  });

  it("counts cached prompt tokens as input, since the agent consumed them", () => {
    const trace = parseClaudeResult(task.id, resultJson, [], 0);
    expect(trace.inputTokens).toBe(4 + 39823 + 39616);
  });

  it("takes contextTokens from measured tool-result size, not from usage", () => {
    const trace = parseClaudeResult(task.id, resultJson, [], 512);
    expect(trace.contextTokens).toBe(512);
  });

  it("rejects an errored run rather than scoring a partial trace", () => {
    expect(() =>
      parseClaudeResult(task.id, { ...resultJson, is_error: true }, [], 0),
    ).toThrow(/errored/i);
  });
});

describe("toolCallsFromTranscript", () => {
  const lines = [
    JSON.stringify({
      type: "assistant",
      message: {
        content: [
          { type: "tool_use", name: "Grep", input: { pattern: "notify" } },
        ],
      },
    }),
    JSON.stringify({
      type: "user",
      message: {
        content: [
          { type: "tool_result", content: "src/notifiers/emailNotifier.ts" },
        ],
      },
    }),
  ].join("\n");

  it("extracts tool calls with their inputs", () => {
    const { toolCalls } = toolCallsFromTranscript(lines);
    expect(toolCalls).toHaveLength(1);
    expect(toolCalls[0]!.tool).toBe("Grep");
    expect(toolCalls[0]!.input).toEqual({ pattern: "notify" });
  });

  it("measures tool-result bytes so context cost is attributable to the task", () => {
    const { contextTokens } = toolCallsFromTranscript(lines);
    expect(contextTokens).toBeGreaterThan(0);
  });

  it("returns an empty trace for a transcript with no tool use", () => {
    const { toolCalls, contextTokens } = toolCallsFromTranscript("");
    expect(toolCalls).toEqual([]);
    expect(contextTokens).toBe(0);
  });
});
