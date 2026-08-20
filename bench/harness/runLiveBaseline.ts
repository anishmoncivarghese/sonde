import Anthropic from "@anthropic-ai/sdk";
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";

import { RepoBoundary } from "../../src/repo/boundary.js";
import { estimateTokens } from "../../src/pack/tokens.js";
import type { AgentTrace, BenchmarkTask, ToolCallRecord } from "./types.js";

const MODEL = "claude-opus-5";
const MAX_ITERATIONS = 30;

export interface ContextBudget {
  limitTokens: number;
  usedTokens: number;
}

export function createContextBudget(limitTokens: number): ContextBudget {
  return {
    limitTokens: Number.isFinite(limitTokens)
      ? Math.max(0, Math.floor(limitTokens))
      : 0,
    usedTokens: 0,
  };
}

export function takeContextResult(budget: ContextBudget, result: string): string {
  const remaining = budget.limitTokens - budget.usedTokens;
  if (remaining <= 0) return "";
  const fullTokens = estimateTokens(result);
  if (fullTokens <= remaining) {
    budget.usedTokens += fullTokens;
    return result;
  }

  const characters = Array.from(result);
  let low = 0;
  let high = characters.length;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (estimateTokens(characters.slice(0, middle).join("")) <= remaining) {
      low = middle;
    } else {
      high = middle - 1;
    }
  }
  const truncated = characters.slice(0, low).join("");
  budget.usedTokens += estimateTokens(truncated);
  return truncated;
}

function typescriptFiles(boundary: RepoBoundary): string[] {
  const matches: string[] = [];
  const walk = (directory: string): void => {
    const entries = boundary.readDirectory(directory)
      .sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const path = directory === "." ? entry.name : `${directory}/${entry.name}`;
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        walk(path);
      } else if (entry.isFile() && path.endsWith(".ts")) {
        matches.push(path);
      }
    }
  };
  walk(".");
  return matches;
}

export async function grepTool(
  boundary: RepoBoundary,
  input: { pattern: string },
): Promise<string> {
  const matches = typescriptFiles(boundary).filter((path) =>
    boundary.readFile(path).toString("utf8").includes(input.pattern),
  );
  return matches.length > 0 ? matches.join("\n") : "no matches";
}

export async function globTool(
  boundary: RepoBoundary,
  input: { pattern: string },
): Promise<string> {
  if (input.pattern !== "**/*.ts") {
    return `unsupported pattern: ${input.pattern}; only **/*.ts is supported`;
  }
  return typescriptFiles(boundary).join("\n");
}

export async function readFileTool(
  boundary: RepoBoundary,
  input: { path: string },
): Promise<string> {
  try {
    return boundary.readFile(input.path).toString("utf8");
  } catch (error) {
    return `error: could not read ${input.path}: ${(error as Error).message}`;
  }
}

function resultSummary(result: string): string {
  if (result === "no matches" || result.startsWith("error:")) return result;
  return `${Buffer.byteLength(result, "utf8")} result bytes`;
}

function buildTools(
  boundary: RepoBoundary,
  calls: ToolCallRecord[],
  budget: ContextBudget,
) {
  const record = async (
    tool: string,
    input: unknown,
    run: () => Promise<string>,
  ): Promise<string> => {
    const result = takeContextResult(budget, await run());
    calls.push({ tool, input, resultSummary: resultSummary(result) });
    return result;
  };

  return [
    betaZodTool({
      name: "grep",
      description: "Search all .ts files in the repository for a literal substring.",
      inputSchema: z.object({ pattern: z.string() }),
      run: (input) => record("grep", input, () => grepTool(boundary, input)),
    }),
    betaZodTool({
      name: "glob",
      description: "List every .ts file in the repository. Use the pattern **/*.ts.",
      inputSchema: z.object({ pattern: z.string() }),
      run: (input) => record("glob", input, () => globTool(boundary, input)),
    }),
    betaZodTool({
      name: "read_file",
      description: "Read one file by repository-relative path.",
      inputSchema: z.object({ path: z.string() }),
      run: (input) => record("read_file", input, () => readFileTool(boundary, input)),
    }),
  ];
}

/**
 * Run one opt-in, live agentic-search baseline. The benchmark test suite only
 * exercises the local tools and never invokes this network-backed function.
 */
export async function runAgenticBaseline(
  client: Anthropic,
  task: BenchmarkTask,
  fixtureRoot: string,
): Promise<AgentTrace> {
  const boundary = new RepoBoundary(fixtureRoot);
  const startedAt = Date.now();
  const toolCalls: ToolCallRecord[] = [];
  const contextBudget = createContextBudget(
    task.groundTruth.maxContextBudgetTokens,
  );
  let inputTokens = 0;
  let outputTokens = 0;
  let finalAnswerText = "";

  const runner = client.beta.messages.toolRunner({
    model: MODEL,
    max_tokens: 16_000,
    max_iterations: MAX_ITERATIONS,
    tools: buildTools(boundary, toolCalls, contextBudget),
    messages: [{ role: "user", content: task.prompt }],
  });

  for await (const message of runner) {
    inputTokens += message.usage.input_tokens;
    outputTokens += message.usage.output_tokens;
    const answer = message.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("\n");
    if (answer) finalAnswerText = answer;
  }

  return {
    taskId: task.id,
    toolCalls,
    finalAnswerText,
    inputTokens,
    outputTokens,
    contextTokens: contextBudget.usedTokens,
    wallClockMs: Date.now() - startedAt,
  };
}
