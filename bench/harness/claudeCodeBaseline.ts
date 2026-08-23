/**
 * Subscription-driven agentic-search baseline.
 *
 * Spec §10 Layer 3 asks for "a strong agentic search loop — grep/glob/read with
 * a competent agent, not naive grep". This driver uses Claude Code itself in
 * headless mode rather than a hand-rolled tool harness, so the baseline is the
 * alternative developers actually use today instead of a strawman we wrote.
 *
 * Two contamination hazards are handled deliberately:
 *
 * 1. `--allowedTools` GRANTS permission; it does not restrict the tool surface.
 *    A probe run given `--allowedTools "Glob" "Grep" "Read"` still reached for
 *    `Bash` and answered with `find | wc -l`. Only `--tools` narrows the
 *    built-in set, so that is what this driver passes.
 * 2. The benchmark fixtures live inside the CodeGraph repository, so Claude
 *    Code's CLAUDE.md auto-discovery would walk up and load AGENTS.md — priming
 *    the baseline agent with CodeGraph's own invariants. Each run therefore
 *    executes against an isolated copy of the fixture outside the repository.
 */
import { spawn } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { estimateTokens } from "../../src/pack/tokens.js";
import type { AgentTrace, BenchmarkTask, ToolCallRecord } from "./types.js";

/** The three tools the baseline is allowed, matching spec §10 Layer 3. */
export const BASELINE_TOOLS = "Grep,Glob,Read";

export const BASELINE_MODEL = "opus";

export interface ClaudeResultJson {
  is_error: boolean;
  result: string;
  duration_ms: number;
  session_id: string;
  num_turns: number;
  total_cost_usd: number;
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  };
}

export function buildClaudeArgs(task: BenchmarkTask): string[] {
  return [
    "-p",
    task.prompt,
    "--output-format",
    "json",
    // `--tools` restricts the built-in surface. `--allowedTools` would only
    // grant permission and would leave Bash reachable.
    "--tools",
    BASELINE_TOOLS,
    "--model",
    BASELINE_MODEL,
  ];
}

export function toolCallsFromTranscript(
  transcript: string,
): { toolCalls: ToolCallRecord[]; contextTokens: number } {
  const toolCalls: ToolCallRecord[] = [];
  let contextTokens = 0;

  for (const line of transcript.split("\n")) {
    if (!line.trim()) continue;
    let record: unknown;
    try {
      record = JSON.parse(line);
    } catch {
      continue;
    }
    const message = (record as { message?: { content?: unknown } }).message;
    const content = message?.content;
    if (!Array.isArray(content)) continue;

    for (const block of content) {
      if (typeof block !== "object" || block === null) continue;
      const typed = block as { type?: string; name?: string; input?: unknown; content?: unknown };

      if (typed.type === "tool_use") {
        toolCalls.push({
          tool: typed.name ?? "unknown",
          input: typed.input,
          resultSummary: "",
        });
      }

      if (typed.type === "tool_result") {
        const raw = typeof typed.content === "string"
          ? typed.content
          : JSON.stringify(typed.content ?? "");
        contextTokens += estimateTokens(raw);
        const last = toolCalls[toolCalls.length - 1];
        if (last && last.resultSummary === "") {
          last.resultSummary = `${Buffer.byteLength(raw, "utf8")} result bytes`;
        }
      }
    }
  }

  return { toolCalls, contextTokens };
}

export function parseClaudeResult(
  taskId: string,
  json: ClaudeResultJson,
  toolCalls: ToolCallRecord[],
  contextTokens: number,
): AgentTrace {
  if (json.is_error) {
    throw new Error(`Claude Code run for ${taskId} errored; refusing to score a partial trace`);
  }

  const usage = json.usage;
  // Cached prompt tokens are counted as input because the model processed them.
  // They are dominated by Claude Code's fixed harness prompt rather than the
  // task, which is why `contextTokens` — measured tool-result bytes — is the
  // arm-comparable figure and is reported separately.
  const inputTokens =
    usage.input_tokens +
    (usage.cache_creation_input_tokens ?? 0) +
    (usage.cache_read_input_tokens ?? 0);

  return {
    taskId,
    toolCalls,
    finalAnswerText: json.result,
    inputTokens,
    outputTokens: usage.output_tokens,
    contextTokens,
    wallClockMs: json.duration_ms,
  };
}

function transcriptPathFor(workDir: string, sessionId: string): string | null {
  const slug = workDir.replace(/[/.]/g, "-");
  const candidate = join(
    process.env.HOME ?? "",
    ".claude",
    "projects",
    slug,
    `${sessionId}.jsonl`,
  );
  return existsSync(candidate) ? candidate : null;
}

/**
 * Run one task. Copies the fixture outside the repository first so that neither
 * CLAUDE.md discovery nor the CodeGraph index can inform the baseline.
 */
export async function runClaudeCodeBaseline(
  task: BenchmarkTask,
  repoRoot: string,
): Promise<AgentTrace> {
  const workDir = mkdtempSync(join(tmpdir(), `cg-baseline-${task.id}-`));
  try {
    cpSync(join(repoRoot, task.fixture), workDir, { recursive: true });

    const stdout = await new Promise<string>((resolve, reject) => {
      const child = spawn("claude", buildClaudeArgs(task), {
        cwd: workDir,
        env: process.env,
      });
      let out = "";
      let err = "";
      child.stdout.on("data", (chunk) => (out += chunk));
      child.stderr.on("data", (chunk) => (err += chunk));
      child.on("error", reject);
      child.on("close", (code) =>
        code === 0 ? resolve(out) : reject(new Error(`claude exited ${code}: ${err}`)),
      );
    });

    const json = JSON.parse(stdout) as ClaudeResultJson;
    const transcript = transcriptPathFor(workDir, json.session_id);
    const extracted = transcript
      ? toolCallsFromTranscript(readFileSync(transcript, "utf8"))
      : { toolCalls: [], contextTokens: 0 };

    return parseClaudeResult(task.id, json, extracted.toolCalls, extracted.contextTokens);
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}
