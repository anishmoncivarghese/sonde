import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AUTO_REFRESH_LIMIT } from "../../src/index/drift.js";
import { indexRepo } from "../../src/index/pipeline.js";
import { ensureFresh, NoIndexError } from "../../src/pack/refresh.js";
import {
  migrate,
  openDb,
  SchemaVersionError,
} from "../../src/store/index.js";

let root: string;
let dbPath: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "cg-refresh-"));
  mkdirSync(join(root, "src"));
  writeFileSync(join(root, "tsconfig.json"), "{}");
  writeFileSync(join(root, "src", "a.ts"), "export function a() {}\n");
  dbPath = join(root, "index.sqlite");
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

describe("ensureFresh", () => {
  it("throws NoIndexError when no index exists", async () => {
    await expect(ensureFresh(root, dbPath)).rejects.toThrow(NoIndexError);
  });

  it("propagates a schema mismatch instead of reading an incompatible index", async () => {
    await indexRepo(root, dbPath);
    const db = openDb(dbPath);
    try {
      migrate(db);
      db.prepare("UPDATE meta SET value = '999' WHERE key = 'schema_version'")
        .run();
    } finally {
      db.close();
    }

    await expect(ensureFresh(root, dbPath)).rejects.toThrow(
      SchemaVersionError,
    );
  });

  it("returns the open index as fresh when no source drifted", async () => {
    await indexRepo(root, dbPath);

    const state = await ensureFresh(root, dbPath);
    try {
      expect(state.freshness).toEqual({
        state: "fresh",
        driftCount: 0,
        verified: [],
      });
      expect(state.warnings).toEqual([]);
      expect(
        state.db.prepare("SELECT COUNT(*) AS count FROM symbol").get(),
      ).toEqual(expect.objectContaining({ count: expect.any(Number) }));
    } finally {
      state.db.close();
    }
  });

  it("surfaces compiler provenance and clears it after inline refresh", async () => {
    await indexRepo(root, dbPath, { resolve: true });

    const resolved = await ensureFresh(root, dbPath);
    try {
      expect(resolved.compilerVersion).toMatch(/^\d+\.\d+/);
    } finally {
      resolved.db.close();
    }

    writeFileSync(
      join(root, "src", "a.ts"),
      "export function a() { return 1; }\n",
    );
    const refreshed = await ensureFresh(root, dbPath);
    try {
      expect(refreshed.compilerVersion).toBeNull();
      expect(refreshed.warnings).toContainEqual(expect.stringMatching(/LEXICAL/));
    } finally {
      refreshed.db.close();
    }
  });

  it("refreshes small drift and discloses the compiler-tier downgrade", async () => {
    await indexRepo(root, dbPath);
    writeFileSync(
      join(root, "src", "a.ts"),
      "export function a() { return 1; }\nexport function added() {}\n",
    );

    const state = await ensureFresh(root, dbPath);
    try {
      expect(state.freshness).toEqual({
        state: "refreshed",
        driftCount: 1,
        verified: ["src/a.ts"],
      });
      expect(state.warnings).toContainEqual(expect.stringMatching(/LEXICAL/));
      expect(state.warnings).toContainEqual(expect.stringMatching(/HEURISTIC/));
      expect(
        state.db
          .prepare("SELECT stable_key FROM symbol WHERE short_name = 'added'")
          .get(),
      ).toBeDefined();
    } finally {
      state.db.close();
    }
  });

  it("does not list a deleted file as verified after refreshing its removal", async () => {
    await indexRepo(root, dbPath);
    rmSync(join(root, "src", "a.ts"));

    const state = await ensureFresh(root, dbPath);
    try {
      expect(state.freshness.state).toBe("refreshed");
      expect(state.freshness.verified).not.toContain("src/a.ts");
      expect(
        state.db
          .prepare("SELECT COUNT(*) AS count FROM file WHERE path = ?")
          .get("src/a.ts"),
      ).toEqual({ count: 0 });
    } finally {
      state.db.close();
    }
  });

  it("returns partial without refreshing drift over the automatic limit", async () => {
    await indexRepo(root, dbPath);
    for (let index = 0; index <= AUTO_REFRESH_LIMIT; index += 1) {
      writeFileSync(
        join(root, "src", `new-${index}.ts`),
        `export const value${index} = ${index};\n`,
      );
    }

    const state = await ensureFresh(root, dbPath);
    try {
      expect(state.freshness).toEqual({
        state: "partial",
        driftCount: AUTO_REFRESH_LIMIT + 1,
        verified: [],
      });
      expect(state.warnings).toContainEqual(
        expect.stringMatching(/sonde update/),
      );
      expect(
        state.db.prepare("SELECT COUNT(*) AS count FROM file").get(),
      ).toEqual({ count: 1 });
    } finally {
      state.db.close();
    }
  });

  it("keeps a persisted parse failure visible as partial", async () => {
    await indexRepo(root, dbPath);
    const db = openDb(dbPath);
    try {
      migrate(db);
      db.prepare("UPDATE file SET parse_state = 'failed' WHERE path = 'src/a.ts'")
        .run();
    } finally {
      db.close();
    }

    const state = await ensureFresh(root, dbPath);
    try {
      expect(state.freshness.state).toBe("partial");
      expect(state.freshness.driftCount).toBe(0);
      expect(state.warnings).toContainEqual(
        expect.stringMatching(/parse failure/i),
      );
    } finally {
      state.db.close();
    }
  });

  it("reports partial when inline refresh introduces a parse failure", async () => {
    await indexRepo(root, dbPath);
    writeFileSync(join(root, "src", "a.ts"), "export function ( {{{ ");

    const state = await ensureFresh(root, dbPath);
    try {
      expect(state.freshness.state).toBe("partial");
      expect(state.warnings).toContainEqual(
        expect.stringMatching(/parse failure/i),
      );
      expect(
        state.db
          .prepare("SELECT parse_state AS parseState FROM file WHERE path = ?")
          .get("src/a.ts"),
      ).toEqual({ parseState: "failed" });
    } finally {
      state.db.close();
    }
  });
});
