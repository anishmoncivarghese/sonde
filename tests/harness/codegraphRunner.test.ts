import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runCodegraphTask } from "../../bench/harness/codegraphRunner.js";
import { BENCHMARK_TASKS } from "../../bench/harness/tasks.js";
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

describe("runCodegraphTask", () => {
  it("finds all five Notifier implementers with recall 1", () => {
    const result = runCodegraphTask(db, task("implementations-of-notifier"));

    expect(result.recallAtK).toBe(1);
    expect(result.toolCalls).toBe(1);
    expect(result.baseline).toBe("codegraph");
    expect(result.inputTokens).toBeGreaterThan(0);
    expect(result.outputTokens).toBeGreaterThan(0);
  });

  it("reports tier utility for matched required impact evidence", () => {
    const result = runCodegraphTask(db, task("impact-notifier-signature"));

    expect(result.recallAtK).toBeGreaterThan(0);
    expect(result.tierUtility).not.toBeNull();
    expect(result.tierUtility).toBeGreaterThanOrEqual(0);
    expect(result.tierUtility).toBeLessThanOrEqual(1);
  });

  it("finds the complete production-and-test retry impact chain", () => {
    const result = runCodegraphTask(db, task("impact-retry-policy"));

    expect(result.recallAtK).toBe(1);
    expect(result.tierUtility).not.toBeNull();
  });

  it("matches test-selection ground truth through canonical file keys", () => {
    const result = runCodegraphTask(db, task("tests-for-dispatcher-change"));
    expect(result.recallAtK).toBe(1);
  });

  it("combines both queries for the queue completeness task", () => {
    const result = runCodegraphTask(db, task("completeness-queue-callers"));
    expect(result.recallAtK).toBe(1);
    expect(result.toolCalls).toBe(2);
  });
});
