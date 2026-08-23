/**
 * Benchmark report for the large fixture.
 *
 * Kept separate from the medium-fixture report so the two corpora are never
 * averaged together: they answer different questions. The medium fixture is
 * small enough for an agent to read exhaustively, so it measures retrieval
 * quality on a corpus where exhaustive reading is a winning strategy. This one
 * is two orders of magnitude larger than any task budget, so it measures what
 * the benchmark actually set out to test.
 */
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { indexRepo } from "../../src/index/pipeline.js";
import { migrate, openDb } from "../../src/store/index.js";
import { runCodegraphTask } from "./codegraphRunner.js";
import { aggregateResults, type AggregatedMetrics } from "./metrics.js";
import { scoreTrace } from "./traceScorer.js";
import { LARGE_BENCHMARK_TASKS, LARGE_FIXTURE } from "./tasksLarge.js";
import type { AgentTrace, TaskResult } from "./types.js";

const repoRoot = process.cwd();
const fixtureRoot = join(repoRoot, LARGE_FIXTURE);

if (!existsSync(join(fixtureRoot, "src"))) {
  console.error(
    `large fixture missing at ${fixtureRoot}\nRun: npm run bench:fixture`,
  );
  process.exit(1);
}

function loadTrace(taskId: string): AgentTrace | null {
  const path = join(repoRoot, "bench", "harness", "traces-large", `${taskId}.json`);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf8")) as AgentTrace;
}

function row(label: string, m: AggregatedMetrics): string {
  return `| ${label} | ${m.meanRecallAtK.toFixed(3)} | ${m.preliminarySuccessRate.toFixed(3)} | ` +
    `${m.meanDistractorHits.toFixed(2)} | ${m.meanToolCalls.toFixed(1)} | ` +
    `${Math.round(m.meanInputTokens)} | ${Math.round(m.meanContextTokens)} | ` +
    `${Math.round(m.meanWallClockMs)} |`;
}

const tempDirectory = mkdtempSync(join(tmpdir(), "codegraph-bench-large-"));
const dbPath = join(tempDirectory, "index.sqlite");

try {
  const stats = await indexRepo(fixtureRoot, dbPath);
  const db = openDb(dbPath);
  migrate(db);

  const codegraph = LARGE_BENCHMARK_TASKS.map((task) => runCodegraphTask(db, task));
  const agentic: TaskResult[] = [];
  for (const task of LARGE_BENCHMARK_TASKS) {
    const trace = loadTrace(task.id);
    if (trace) agentic.push(scoreTrace(task, trace));
  }
  db.close();

  const lines = [
    "# CodeGraph vs. agentic search — large fixture",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    `Fixture: Hono v4.6.3 (MIT) — ${stats.filesIndexed} files indexed, ` +
      `${stats.symbols} symbols, ${stats.edges} edges, ` +
      `${stats.parseFailures} parse failures.`,
    "",
    "The medium-fixture benchmark is reported separately in BENCHMARK.md and the",
    "two are never averaged. That corpus is 198 lines — about 1,400 tokens — so",
    "the agentic baseline read all of it, which cannot test whether structural",
    "retrieval beats exhaustive reading. This corpus is two orders of magnitude",
    "beyond any task budget, so neither arm can read it exhaustively.",
    "",
    "Ground truth was verified by reading the fixture source, not generated from",
    "CodeGraph's own output: an oracle derived from the tool under test would",
    "agree with its own bugs.",
    "",
    "## Summary",
    "",
    "| Baseline | Mean recall@k | Success rate | Mean distractors | Mean tool calls | Mean input tokens | Mean context tokens | Mean latency (ms) |",
    "|---|---:|---:|---:|---:|---:|---:|---:|",
    row("CodeGraph", aggregateResults(codegraph)),
    agentic.length === LARGE_BENCHMARK_TASKS.length
      ? row("Agentic search", aggregateResults(agentic))
      : `| Agentic search | PENDING — ${agentic.length}/${LARGE_BENCHMARK_TASKS.length} traces | | | | | | |`,
    "",
    "## Per-task",
    "",
    "| Task | Category | CodeGraph recall | Agentic recall | CodeGraph ctx | Agentic ctx |",
    "|---|---|---:|---:|---:|---:|",
  ];

  for (const task of LARGE_BENCHMARK_TASKS) {
    const cg = codegraph.find((r) => r.taskId === task.id);
    const ag = agentic.find((r) => r.taskId === task.id);
    lines.push(
      `| ${task.id} | ${task.category} | ` +
        `${cg ? cg.recallAtK.toFixed(2) : "n/a"} | ` +
        `${ag ? ag.recallAtK.toFixed(2) : "PENDING"} | ` +
        `${cg ? cg.contextTokens : "n/a"} | ` +
        `${ag ? ag.contextTokens : "PENDING"} |`,
    );
  }

  const output = `${lines.join("\n")}\n`;
  writeFileSync(join(repoRoot, "BENCHMARK-LARGE.md"), output);
  console.log(output);
} finally {
  rmSync(tempDirectory, { recursive: true, force: true });
}
