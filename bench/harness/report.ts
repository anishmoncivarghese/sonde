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
    `${aggregate.meanToolCalls.toFixed(1)} | ${aggregate.meanInputTokens.toFixed(0)} | ` +
    `${aggregate.meanOutputTokens.toFixed(0)} | ${aggregate.meanWallClockMs.toFixed(0)} | ` +
    `${tier} |`;
}

function agenticSummaryRow(results: TaskResult[]): string {
  if (results.length !== BENCHMARK_TASKS.length) {
    const state = results.length === 0 ? "not yet run" : "incomplete";
    return `| Agentic search | PENDING — live baseline ${state} ` +
      `(${results.length}/${BENCHMARK_TASKS.length} traces) | | | | | |`;
  }
  return summaryRow("Agentic search", aggregateResults(results));
}

export function renderBenchmarkReport(
  codegraphResults: TaskResult[],
  agenticResults: TaskResult[],
  generatedAt = new Date(),
): string {
  const codegraphByTask = new Map(codegraphResults.map((result) => [result.taskId, result]));
  const agenticByTask = new Map(agenticResults.map((result) => [result.taskId, result]));
  const rows = BENCHMARK_TASKS.map((task) => {
    const codegraph = codegraphByTask.get(task.id);
    if (!codegraph) throw new Error(`Missing CodeGraph result for ${task.id}`);
    const agentic = agenticByTask.get(task.id);
    return `| ${task.id} | ${task.category} | ${codegraph.recallAtK.toFixed(2)} | ` +
      `${agentic ? agentic.recallAtK.toFixed(2) : "PENDING"} |`;
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
    "## Summary",
    "",
    "| Baseline | Mean recall@k | Mean tool calls | Mean input tokens | " +
      "Mean output tokens | Mean latency (ms) | Mean tier utility |",
    "|---|---:|---:|---:|---:|---:|---:|",
    summaryRow("CodeGraph", aggregateResults(codegraphResults)),
    agenticSummaryRow(agenticResults),
    "",
    "## Per-task recall@k",
    "",
    "| Task | Category | CodeGraph | Agentic search |",
    "|---|---|---:|---:|",
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
