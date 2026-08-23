/**
 * Entry point for the live agentic-search baseline (spec §12 item 5).
 *
 * Resumable by design: a trace already on disk is never re-run, so an
 * interrupted pass does not repeat completed work. Delete a trace file to
 * force that one task to run again.
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { BENCHMARK_TASKS } from "./tasks.js";
import { runClaudeCodeBaseline, BASELINE_MODEL, BASELINE_TOOLS } from "./claudeCodeBaseline.js";

const repoRoot = process.cwd();
const tracesDir = join(repoRoot, "bench", "harness", "traces");
mkdirSync(tracesDir, { recursive: true });

const only = process.argv[2];
const tasks = only
  ? BENCHMARK_TASKS.filter((task) => task.id === only)
  : BENCHMARK_TASKS;

if (tasks.length === 0) {
  console.error(`no benchmark task matches "${only}"`);
  process.exit(1);
}

console.log(`baseline: Claude Code headless, model=${BASELINE_MODEL}, tools=${BASELINE_TOOLS}`);
console.log(`${tasks.length} task(s); existing traces are skipped\n`);

let ran = 0;
let skipped = 0;
let failed = 0;

for (const task of tasks) {
  const tracePath = join(tracesDir, `${task.id}.json`);
  if (existsSync(tracePath)) {
    console.log(`skip  ${task.id} (trace exists)`);
    skipped += 1;
    continue;
  }

  process.stdout.write(`run   ${task.id} ... `);
  try {
    const trace = await runClaudeCodeBaseline(task, repoRoot);
    writeFileSync(tracePath, `${JSON.stringify(trace, null, 2)}\n`);
    console.log(
      `ok (${trace.toolCalls.length} tool calls, ` +
        `${trace.contextTokens} context tokens, ${trace.wallClockMs} ms)`,
    );
    ran += 1;
  } catch (error) {
    console.log(`FAILED: ${(error as Error).message}`);
    failed += 1;
  }
}

console.log(`\n${ran} run, ${skipped} skipped, ${failed} failed`);
console.log("next: npm run bench:harness to score and republish BENCHMARK.md");
if (failed > 0) process.exit(1);
