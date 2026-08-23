import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runSondeTask } from "../../bench/harness/sondeRunner.js";
import { BENCHMARK_TASKS } from "../../bench/harness/tasks.js";
import type { BenchmarkTask } from "../../bench/harness/types.js";
import { indexRepo } from "../../src/index/pipeline.js";
import { migrate, openDb, type Db } from "../../src/store/index.js";

const FIXTURE = join(process.cwd(), "tests/fixtures/repos/medium");
let db: Db;
let tempDir: string;

function task(id: string) {
  const found = BENCHMARK_TASKS.find((candidate) => candidate.id === id);
  if (!found) throw new Error(`missing benchmark task ${id}`);
  return found;
}

beforeEach(async () => {
  tempDir = mkdtempSync(join(tmpdir(), "cg-runner-"));
  const dbPath = join(tempDir, "index.sqlite");
  await indexRepo(FIXTURE, dbPath);
  db = openDb(dbPath);
  migrate(db);
});

afterEach(() => {
  db.close();
  rmSync(tempDir, { recursive: true, force: true });
});

describe("runSondeTask", () => {
  it("finds all five Notifier implementers with recall 1", () => {
    const result = runSondeTask(db, task("implementations-of-notifier"));

    expect(result.recallAtK).toBe(1);
    expect(result.toolCalls).toBe(1);
    expect(result.baseline).toBe("sonde");
    expect(result.inputTokens).toBeGreaterThan(0);
    expect(result.outputTokens).toBeGreaterThan(0);
    expect(result.contextTokens).toBe(result.outputTokens);
    expect(result.preliminarySuccess).toBe(true);
    expect(result.distractorHits).toBe(0);
    expect(result.tierHits).toEqual({
      compiler: 0,
      lexical: 5,
      heuristic: 0,
      unranked: 0,
    });
    expect(result.tierUtility).toBe(0);
  });

  it("reports tier utility for matched required impact evidence", () => {
    const result = runSondeTask(db, task("impact-notifier-signature"));

    expect(result.recallAtK).toBeGreaterThan(0);
    expect(result.tierUtility).not.toBeNull();
    expect(result.tierUtility).toBeGreaterThanOrEqual(0);
    expect(result.tierUtility).toBeLessThanOrEqual(1);
  });

  it("finds the complete production-and-test retry impact chain", () => {
    const result = runSondeTask(db, task("impact-retry-policy"));

    expect(result.recallAtK).toBe(1);
    expect(result.tierUtility).not.toBeNull();
  });

  it("matches test-selection ground truth through canonical file keys", () => {
    const result = runSondeTask(db, task("tests-for-dispatcher-change"));
    expect(result.recallAtK).toBe(1);
  });

  it("combines both queries for the queue completeness task", () => {
    const result = runSondeTask(db, task("completeness-queue-callers"));
    expect(result.recallAtK).toBe(1);
    expect(result.toolCalls).toBe(2);
    expect(result.tierUtility).toBe(1);
    expect(result.tierHits?.heuristic).toBe(2);
  });

  it("scores only evidence that fits the task context budget", () => {
    const source = task("implementations-of-notifier");
    const budgeted: BenchmarkTask = {
      ...source,
      id: "budgeted-implementations",
      groundTruth: { ...source.groundTruth, maxContextBudgetTokens: 1 },
    };

    const result = runSondeTask(db, budgeted);
    expect(result.recallAtK).toBe(0);
    expect(result.contextTokens).toBeLessThanOrEqual(1);
    expect(result.preliminarySuccess).toBe(false);
  });

  it("counts helpful and distractor evidence and fails preliminary success", () => {
    const source = task("implementations-of-notifier");
    const [required, distractor, helpful] = source.groundTruth.requiredEvidence;
    const adversarial: BenchmarkTask = {
      ...source,
      id: "adversarial-implementations",
      groundTruth: {
        ...source.groundTruth,
        requiredEvidence: [required!],
        helpfulEvidence: [helpful!],
        distractors: [distractor!],
      },
    };

    const result = runSondeTask(db, adversarial);
    expect(result.recallAtK).toBe(1);
    expect(result.helpfulHits).toBe(1);
    expect(result.distractorHits).toBe(1);
    expect(result.preliminarySuccess).toBe(false);
  });
});
