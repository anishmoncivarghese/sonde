import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BENCHMARK_TASKS } from "../../bench/harness/tasks.js";
import { indexRepo } from "../../src/index/pipeline.js";
import { migrate, openDb } from "../../src/store/index.js";

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

  it("documents every task and only leaves the true-negative requirement empty", () => {
    for (const task of BENCHMARK_TASKS) {
      expect(task.rationale.length).toBeGreaterThan(0);
      if (task.id === "impact-retry-policy") {
        expect(task.groundTruth.requiredEvidence).toEqual([]);
      } else {
        expect(task.groundTruth.requiredEvidence.length).toBeGreaterThan(0);
      }
    }
  });

  it("has no duplicate task ids", () => {
    const ids = new Set(BENCHMARK_TASKS.map((task) => task.id));
    expect(ids.size).toBe(BENCHMARK_TASKS.length);
  });

  it("cites only symbols that exist in the indexed fixture", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "cg-task-truth-"));
    const dbPath = join(tempDir, "index.sqlite");
    try {
      const fixture = join(process.cwd(), "tests/fixtures/repos/medium");
      await indexRepo(fixture, dbPath);
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
