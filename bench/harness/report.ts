import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { indexRepo } from "../../src/index/pipeline.js";
import { RepoBoundary } from "../../src/repo/boundary.js";
import { migrate, openDb } from "../../src/store/index.js";
import { runCodegraphTask } from "./codegraphRunner.js";
import { aggregateResults, type AggregatedMetrics } from "./metrics.js";
import { scoreTrace } from "./traceScorer.js";
import { BENCHMARK_TASKS } from "./tasks.js";
import type { AgentTrace, TaskResult } from "./types.js";

function summaryRow(label: string, aggregate: AggregatedMetrics): string {
  const tier = aggregate.meanTierUtility === null
    ? "n/a"
    : aggregate.meanTierUtility.toFixed(3);
  return `| ${label} | ${aggregate.meanRecallAtK.toFixed(3)} | ` +
    `${aggregate.preliminarySuccessRate.toFixed(3)} | ` +
    `${aggregate.meanDistractorHits.toFixed(2)} | ` +
    `${aggregate.meanHelpfulHits.toFixed(2)} | ` +
    `${aggregate.meanToolCalls.toFixed(1)} | ${aggregate.meanInputTokens.toFixed(0)} | ` +
    `${aggregate.meanOutputTokens.toFixed(0)} | ` +
    `${aggregate.meanContextTokens.toFixed(0)} | ` +
    `${aggregate.meanWallClockMs.toFixed(0)} | ${tier} |`;
}

function agenticSummaryRow(results: TaskResult[]): string {
  if (results.length !== BENCHMARK_TASKS.length) {
    const state = results.length === 0 ? "not yet run" : "incomplete";
    return `| Agentic search | PENDING — live baseline ${state} ` +
      `(${results.length}/${BENCHMARK_TASKS.length} traces) | | | | | | | | | |`;
  }
  return summaryRow("Agentic search", aggregateResults(results));
}

function assertMetric(
  result: TaskResult,
  field: keyof TaskResult,
  options: { maximum?: number; integer?: boolean } = {},
): void {
  const value = result[field];
  if (
    typeof value !== "number" || !Number.isFinite(value) || value < 0 ||
    (options.maximum !== undefined && value > options.maximum) ||
    (options.integer === true && !Number.isInteger(value))
  ) {
    throw new Error(`Invalid ${String(field)} for task ${result.taskId}`);
  }
}

function validateResult(
  result: TaskResult,
  baseline: TaskResult["baseline"],
): void {
  const task = BENCHMARK_TASKS.find((candidate) => candidate.id === result.taskId);
  if (!task) throw new Error(`Unknown benchmark task ${result.taskId}`);
  if (result.baseline !== baseline) {
    throw new Error(`Wrong baseline for ${result.taskId}: ${result.baseline}`);
  }
  if (result.category !== task.category) {
    throw new Error(`Wrong category for ${result.taskId}: ${result.category}`);
  }
  assertMetric(result, "recallAtK", { maximum: 1 });
  assertMetric(result, "toolCalls", { integer: true });
  assertMetric(result, "inputTokens");
  assertMetric(result, "outputTokens");
  assertMetric(result, "contextTokens");
  assertMetric(result, "wallClockMs");
  assertMetric(result, "helpfulHits", { integer: true });
  assertMetric(result, "distractorHits", { integer: true });
  // An over-budget result is reported, not rejected. Discarding it kept the
  // agentic arm's recall unconstrained while the CodeGraph arm paid for packing
  // to the same budget. Consistency between the two fields is still enforced.
  assertMetric(result, "contextOverageTokens", { integer: true });
  const overage = Math.max(
    0,
    result.contextTokens - task.groundTruth.maxContextBudgetTokens,
  );
  if (result.contextOverageTokens !== overage) {
    throw new Error(
      `Inconsistent contextOverageTokens for ${result.taskId}: ` +
        `${result.contextOverageTokens} != ${overage}`,
    );
  }
  if (result.budgetExceeded !== overage > 0) {
    throw new Error(`Inconsistent budgetExceeded for task ${result.taskId}`);
  }
  if (
    result.helpfulHits > task.groundTruth.helpfulEvidence.length ||
    result.distractorHits > task.groundTruth.distractors.length
  ) {
    throw new Error(`Evidence hit count exceeds ground truth for ${result.taskId}`);
  }
  if (typeof result.preliminarySuccess !== "boolean") {
    throw new Error(`Invalid preliminarySuccess for task ${result.taskId}`);
  }
  const expectedSuccess =
    result.recallAtK === 1 &&
    result.distractorHits === 0 &&
    !result.budgetExceeded;
  if (result.preliminarySuccess !== expectedSuccess) {
    throw new Error(`Inconsistent preliminarySuccess for task ${result.taskId}`);
  }
  if (result.tierUtility !== null) {
    assertMetric(result, "tierUtility", { maximum: 1 });
  }
  if (baseline === "agentic_search" && result.tierUtility !== null) {
    throw new Error(`Agentic result ${result.taskId} cannot report tierUtility`);
  }
  if (baseline === "agentic_search" && result.tierHits !== null) {
    throw new Error(`Agentic result ${result.taskId} cannot report tierHits`);
  }
  if (baseline === "codegraph" && result.tierHits === null) {
    throw new Error(`CodeGraph result ${result.taskId} must report tierHits`);
  }
  if (result.tierHits !== null) {
    for (const tier of ["compiler", "lexical", "heuristic", "unranked"] as const) {
      const count = result.tierHits[tier];
      if (!Number.isInteger(count) || count < 0) {
        throw new Error(`Invalid tierHits.${tier} for task ${result.taskId}`);
      }
    }
  }
}

function resultMap(
  results: TaskResult[],
  baseline: TaskResult["baseline"],
  complete: boolean,
): Map<string, TaskResult> {
  const mapped = new Map<string, TaskResult>();
  for (const result of results) {
    validateResult(result, baseline);
    if (mapped.has(result.taskId)) {
      throw new Error(`Duplicate result for task ${result.taskId}`);
    }
    mapped.set(result.taskId, result);
  }
  if (complete) {
    for (const task of BENCHMARK_TASKS) {
      if (!mapped.has(task.id)) throw new Error(`Missing result for task ${task.id}`);
    }
    if (mapped.size !== BENCHMARK_TASKS.length) {
      throw new Error(`Expected ${BENCHMARK_TASKS.length} ${baseline} results`);
    }
  }
  return mapped;
}

function tierHitsCell(result: TaskResult): string {
  const hits = result.tierHits;
  if (!hits) return "n/a";
  return `${hits.compiler}/${hits.lexical}/${hits.heuristic}/${hits.unranked}`;
}

export function renderBenchmarkReport(
  codegraphResults: TaskResult[],
  agenticResults: TaskResult[],
  generatedAt = new Date(),
): string {
  const codegraphByTask = resultMap(codegraphResults, "codegraph", true);
  const agenticByTask = resultMap(agenticResults, "agentic_search", false);
  const rows = BENCHMARK_TASKS.map((task) => {
    const codegraph = codegraphByTask.get(task.id);
    if (!codegraph) throw new Error(`Missing CodeGraph result for ${task.id}`);
    const agentic = agenticByTask.get(task.id);
    return `| ${task.id} | ${task.category} | ${codegraph.recallAtK.toFixed(2)} | ` +
      `${codegraph.preliminarySuccess ? "yes" : "no"} | ` +
      `${tierHitsCell(codegraph)} | ` +
      `${agentic ? agentic.recallAtK.toFixed(2) : "PENDING"} | ` +
      `${agentic ? (agentic.preliminarySuccess ? "yes" : "no") : "PENDING"} |`;
  });

  return [
    "# CodeGraph vs. agentic search — 12-task benchmark",
    "",
    `Generated: ${generatedAt.toISOString()}`,
    "",
    "Adversarially selected per spec §10 Layer 3, not drawn uniformly — a " +
      "uniform sample would show parity on tasks modern agentic search is " +
      "already good at and invite the wrong conclusion. Selection criteria, " +
      "disclosed as the spec requires:",
    "",
    "- Transitive impact at depth >= 2 (4 tasks)",
    "- `implementations_of` across a wide interface (2 tasks)",
    "- Completeness claims — \"what did I miss\" (2 tasks)",
    "- Test selection for a change (2 tasks)",
    "- Semantic-disadvantage controls (2 tasks) — behavioral description with " +
      "no identifier overlap, and a synonym-heavy domain query; these two are " +
      "the classes v0.1's lexical+structural retrieval is *expected to lose*, " +
      "per spec §2.1's falsifiable deferral of semantic search.",
    "",
    "## Methodology",
    "",
    "Recall@k scores only evidence admitted by each task's disclosed context-token " +
      "budget. Preliminary success requires recall@k = 1, zero distractor hits, " +
      "and staying inside that budget; it is a deterministic proxy, not a " +
      "validated semantic success judge. " +
      "Tier utility is the fraction of all required evidence contributed by " +
      "HEURISTIC edges. C/L/H/U required hits report compiler, lexical, heuristic, " +
      "and unranked matches respectively.",
    "",
    "**Budget asymmetry, disclosed.** The two arms reach the budget differently, " +
      "and this changes how the numbers should be read. CodeGraph's packer " +
      "truncates evidence TO the budget, so it can never exceed it and its recall " +
      "already pays for whatever does not fit. The agentic baseline is " +
      "unconstrained and consumes whatever context it reads. Over-budget baseline " +
      "runs are therefore reported with their recall intact and an explicit " +
      "overage rather than discarded or silently credited, and are denied " +
      "preliminary success because staying inside the budget is the constraint " +
      "the CodeGraph arm pays on every task.",
    "",
    "**Token comparison caveat.** Baseline input tokens include Claude Code's " +
      "cached harness prompt — roughly 79k tokens on a probe against 4 tokens of " +
      "real task input. That fixed overhead is not attributable to the task, so " +
      "context tokens (measured tool-result bytes) is the arm-comparable figure, " +
      "not input tokens.",
    "",
    "## Summary",
    "",
    "| Baseline | Mean recall@k | Preliminary success rate | Mean distractors | " +
      "Mean helpful | Mean tool calls | Mean input tokens | Mean output tokens | " +
      "Mean context tokens | Mean latency (ms) | Mean heuristic utility |",
    "|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|",
    summaryRow("CodeGraph", aggregateResults(codegraphResults)),
    agenticSummaryRow(agenticResults),
    "",
    "## Per-task recall@k",
    "",
    "| Task | Category | CodeGraph recall | CodeGraph success | C/L/H/U required hits | " +
      "Agentic recall | Agentic success |",
    "|---|---|---:|:---:|---:|---:|:---:|",
    ...rows,
    "",
  ].join("\n");
}

function loadTrace(boundary: RepoBoundary, taskId: string): TaskResult | null {
  let bytes: Buffer;
  try {
    bytes = boundary.readFile(`bench/harness/traces/${taskId}.json`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
  const task = BENCHMARK_TASKS.find((candidate) => candidate.id === taskId);
  if (!task) throw new Error(`Missing benchmark task: ${taskId}`);
  return scoreTrace(task, JSON.parse(bytes.toString("utf8")) as AgentTrace);
}

export async function runBenchmarkReport(repoRoot = process.cwd()): Promise<string> {
  const boundary = new RepoBoundary(repoRoot);
  const tempDirectory = mkdtempSync(join(tmpdir(), "codegraph-bench-"));
  const dbPath = join(tempDirectory, "index.sqlite");

  try {
    await indexRepo(boundary.resolve("tests/fixtures/repos/medium"), dbPath);
    const db = openDb(dbPath);
    try {
      migrate(db);
      const codegraphResults = BENCHMARK_TASKS.map((task) =>
        runCodegraphTask(db, task),
      );
      const agenticResults = BENCHMARK_TASKS.flatMap((task) => {
        const result = loadTrace(boundary, task.id);
        return result ? [result] : [];
      });
      const output = renderBenchmarkReport(codegraphResults, agenticResults);
      writeFileSync(boundary.resolve("BENCHMARK.md"), output);
      return output;
    } finally {
      db.close();
    }
  } finally {
    rmSync(tempDirectory, { recursive: true, force: true });
  }
}

const entrypoint = process.argv[1];
if (entrypoint && import.meta.url === pathToFileURL(entrypoint).href) {
  console.log(await runBenchmarkReport());
}
