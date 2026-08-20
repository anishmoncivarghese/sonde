import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { indexRepo } from "../../src/index/pipeline.js";
import { migrate, openDb } from "../../src/store/index.js";

const FIXTURE = join(process.cwd(), "tests/fixtures/repos/medium");
let dbPath: string;
let tempDir: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "cg-medium-fixture-"));
  dbPath = join(tempDir, "index.sqlite");
});

afterEach(() => rmSync(tempDir, { recursive: true, force: true }));

describe("medium fixture", () => {
  it("indexes cleanly with five Notifier implementations", async () => {
    const stats = await indexRepo(FIXTURE, dbPath);
    expect(stats.parseFailures).toBe(0);

    const db = openDb(dbPath);
    try {
      migrate(db);
      const implementers = db
        .prepare(
          `SELECT COUNT(*) AS count FROM edge WHERE kind = 'IMPLEMENTS'
           AND dst_symbol_id = (
             SELECT id FROM symbol
             WHERE stable_key = 'ts:src/notifiers/notifier.ts#Notifier'
           )`,
        )
        .get() as { count: number };
      expect(implementers.count).toBe(5);

      const depthThreeTarget = db
        .prepare("SELECT id FROM symbol WHERE stable_key = ?")
        .get("ts:src/notifiers/emailNotifier.ts#EmailNotifier.sendMail");
      expect(depthThreeTarget).toBeDefined();
    } finally {
      db.close();
    }
  });
});
