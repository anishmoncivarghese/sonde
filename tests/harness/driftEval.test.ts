import { cpSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { indexRepo } from "../../src/index/pipeline.js";
import { ensureFresh } from "../../src/pack/refresh.js";
import { verifySymbolBody } from "../../src/pack/verify.js";
import { RepoBoundary } from "../../src/repo/boundary.js";

let root: string;
let dbPath: string;

beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), "cg-drift-eval-"));
  cpSync(join(process.cwd(), "tests/fixtures/repos/medium"), root, {
    recursive: true,
  });
  dbPath = join(root, "index.sqlite");
  await indexRepo(root, dbPath);
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

describe("freshness eval suite (DoD item 3)", () => {
  it("never verifies stale symbol bytes after their file changes", async () => {
    const boundary = new RepoBoundary(root);
    const before = await ensureFresh(root, dbPath);
    const target = before.db
      .prepare(
        "SELECT s.start_byte AS startByte, s.end_byte AS endByte, " +
          "s.body_hash AS bodyHash, f.path AS path " +
          "FROM symbol s JOIN file f ON f.id = s.file_id " +
          "WHERE s.stable_key = 'ts:src/scheduler/retryPolicy.ts#nextDelay'",
      )
      .get() as {
        startByte: number;
        endByte: number;
        bodyHash: string | null;
        path: string;
      };
    before.db.close();

    writeFileSync(
      join(root, "src/scheduler/retryPolicy.ts"),
      "export const MAX_ATTEMPTS = 5;\n" +
        "export function nextDelay(attempt: number): number {\n" +
        "  return 999;\n" +
        "}\n",
    );

    expect(verifySymbolBody(boundary, target).verified).toBe(false);

    const after = await ensureFresh(root, dbPath);
    try {
      expect(after.freshness.state).toBe("refreshed");
      expect(after.freshness.driftCount).toBe(1);
      expect(after.freshness.verified).toContain(target.path);
    } finally {
      after.db.close();
    }
  });

  it("reports fresh with zero drift when nothing has changed", async () => {
    const state = await ensureFresh(root, dbPath);
    try {
      expect(state.freshness).toEqual({
        state: "fresh",
        driftCount: 0,
        verified: [],
      });
    } finally {
      state.db.close();
    }
  });

  it("detects and refreshes every added file across repeated mutations", async () => {
    for (let index = 0; index < 5; index += 1) {
      const relativePath = `src/generated-${index}.ts`;
      writeFileSync(
        join(root, relativePath),
        `export const value${index} = ${index};\n`,
      );
      const state = await ensureFresh(root, dbPath);
      try {
        expect(state.freshness.state).toBe("refreshed");
        expect(state.freshness.driftCount).toBe(1);
        expect(state.freshness.verified).toContain(relativePath);
      } finally {
        state.db.close();
      }
    }
  });
});
