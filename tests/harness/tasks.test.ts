import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BENCHMARK_TASKS } from "../../bench/harness/tasks.js";
import { indexRepo } from "../../src/index/pipeline.js";
import { getImpactRadius } from "../../src/query/impact.js";
import { RepoBoundary } from "../../src/repo/boundary.js";
import { migrate, openDb } from "../../src/store/index.js";

const FIXTURE = join(process.cwd(), "tests/fixtures/repos/medium");

function taskById(id: string) {
  const task = BENCHMARK_TASKS.find((candidate) => candidate.id === id);
  if (!task) throw new Error(`Missing benchmark task: ${id}`);
  return task;
}

describe("BENCHMARK_TASKS", () => {
  it("defines exactly 12 tasks in the spec category distribution", () => {
    expect(BENCHMARK_TASKS).toHaveLength(12);
    const counts: Record<string, number> = {};
    for (const task of BENCHMARK_TASKS) {
      counts[task.category] = (counts[task.category] ?? 0) + 1;
    }
    expect(counts).toEqual({
      transitive_impact: 4,
      wide_interface: 2,
      completeness: 2,
      test_selection: 2,
      semantic_disadvantage: 2,
    });
  });

  it("documents every task with required evidence", () => {
    for (const task of BENCHMARK_TASKS) {
      expect(task.rationale.length).toBeGreaterThan(0);
      expect(task.groundTruth.requiredEvidence.length).toBeGreaterThan(0);
    }
  });

  it("gives all four impact tasks verified required evidence at depth 2 or more", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "cg-task-depth-"));
    const dbPath = join(tempDir, "index.sqlite");
    try {
      await indexRepo(FIXTURE, dbPath);
      const db = openDb(dbPath);
      try {
        migrate(db);
        for (const task of BENCHMARK_TASKS.filter(
          (candidate) => candidate.category === "transitive_impact",
        )) {
          const impactSeeds = task.seeds.filter((seed) => seed.kind === "impact");
          expect(impactSeeds, task.id).toHaveLength(1);
          const result = getImpactRadius(
            db,
            new RepoBoundary(FIXTURE),
            { symbols: impactSeeds[0]!.symbols },
          );
          const deepEvidence = task.groundTruth.requiredEvidence.filter(
            (evidence) => (evidence.expectedDepth ?? 0) >= 2,
          );
          expect(deepEvidence.length, task.id).toBeGreaterThan(0);
          for (const evidence of deepEvidence) {
            expect(
              result.affected.find((row) => row.stableKey === evidence.stableKey)?.depth,
              `${task.id}: ${evidence.stableKey}`,
            ).toBe(evidence.expectedDepth);
          }
        }
      } finally {
        db.close();
      }
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("models queue completeness with both its writer and reader required", () => {
    const task = taskById("completeness-queue-callers");
    expect(task.seeds).toHaveLength(2);
    expect(task.groundTruth.requiredEvidence.map((evidence) => evidence.qualifiedName))
      .toEqual(["Dispatcher.dispatch", "summarizeActivity"]);
  });

  it("attributes Notifier type references to the actual containing symbols", () => {
    const task = taskById("completeness-notifier-references");
    expect(task.groundTruth.requiredEvidence.map((evidence) => evidence.stableKey))
      .toEqual([
        "ts:src/index.ts#",
        "ts:src/scheduler/dispatcher.ts#Dispatcher",
      ]);
  });

  it("has no duplicate task ids", () => {
    const ids = new Set(BENCHMARK_TASKS.map((task) => task.id));
    expect(ids.size).toBe(BENCHMARK_TASKS.length);
  });

  it("cites only symbols that exist in the indexed fixture", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "cg-task-truth-"));
    const dbPath = join(tempDir, "index.sqlite");
    try {
      await indexRepo(FIXTURE, dbPath);
      const db = openDb(dbPath);
      try {
        migrate(db);
        const statement = db.prepare(
          `SELECT s.qualified_name AS qualifiedName, f.path AS path
           FROM symbol s JOIN file f ON f.id = s.file_id
           WHERE s.stable_key = ?`,
        );
        for (const task of BENCHMARK_TASKS) {
          const evidence = [
            ...task.groundTruth.requiredEvidence,
            ...task.groundTruth.helpfulEvidence,
            ...task.groundTruth.distractors,
          ];
          for (const expected of evidence) {
            expect(statement.get(expected.stableKey), expected.stableKey)
              .toEqual({
                qualifiedName: expected.qualifiedName,
                path: expected.path,
              });
          }
        }
      } finally {
        db.close();
      }
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
