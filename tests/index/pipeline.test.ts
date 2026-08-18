import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { indexRepo, updateRepo } from "../../src/index/pipeline.js";
import { migrate, openDb } from "../../src/store/index.js";

let root: string;
let dbPath: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "cg-idx-"));
  dbPath = join(root, "index.sqlite");
  mkdirSync(join(root, "src"));
  writeFileSync(join(root, "tsconfig.json"), "{}");
  writeFileSync(
    join(root, "src", "util.ts"),
    "export function validate(t: string) { return !!t; }",
  );
  writeFileSync(
    join(root, "src", "auth.ts"),
    'import { validate } from "./util";\nexport function refresh() { return validate("x"); }',
  );
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

describe("index pipeline", () => {
  it("indexes symbols and a cross-file call edge", async () => {
    const stats = await indexRepo(root, dbPath);
    expect(stats.filesIndexed).toBe(2);
    expect(stats.symbols).toBeGreaterThanOrEqual(2);
    expect(stats.edges).toBeGreaterThan(0);
  });

  it("skips unchanged files on update", async () => {
    await indexRepo(root, dbPath);
    const stats = await updateRepo(root, dbPath);
    expect(stats.filesIndexed).toBe(0);
    expect(stats.filesSkipped).toBe(2);
  });

  it("re-indexes only a changed file", async () => {
    await indexRepo(root, dbPath);
    writeFileSync(
      join(root, "src", "auth.ts"),
      'import { validate } from "./util";\nexport function refresh() { return validate("y"); }\nexport function extra() {}',
    );

    const stats = await updateRepo(root, dbPath);
    expect(stats.filesIndexed).toBe(1);
    expect(stats.filesSkipped).toBe(1);
  });

  it("demotes inbound edges to unresolved when a target symbol is deleted", async () => {
    await indexRepo(root, dbPath);
    writeFileSync(
      join(root, "src", "util.ts"),
      "export function somethingElse() { return 1; }",
    );
    await updateRepo(root, dbPath);

    const db = openDb(dbPath);
    migrate(db);
    const unresolved = db
      .prepare("SELECT name, reason FROM unresolved_ref")
      .all() as Array<{ name: string; reason: string }>;
    expect(unresolved).toContainEqual({
      name: "validate",
      reason: "target_removed",
    });
    db.close();
  });

  it("re-attempts unresolved refs when a matching symbol appears", async () => {
    writeFileSync(
      join(root, "src", "auth.ts"),
      "export function refresh() { return brandNew(); }",
    );
    await indexRepo(root, dbPath);

    writeFileSync(
      join(root, "src", "util.ts"),
      "export function brandNew() { return 1; }",
    );
    await updateRepo(root, dbPath);

    const db = openDb(dbPath);
    migrate(db);
    const calls = db
      .prepare("SELECT COUNT(*) AS count FROM edge WHERE kind = 'CALLS'")
      .get() as { count: number };
    expect(calls.count).toBeGreaterThan(0);
    db.close();
  });

  it("continues indexing when one file fails to parse", async () => {
    writeFileSync(join(root, "src", "broken.ts"), "export function ( {{{ ");
    const stats = await indexRepo(root, dbPath);
    expect(stats.parseFailures).toBeGreaterThanOrEqual(1);
    expect(stats.filesIndexed).toBeGreaterThanOrEqual(2);
  });

  it("persists parse failures and diagnostics instead of failing silently", async () => {
    writeFileSync(join(root, "src", "broken.ts"), "export function ( {{{ ");
    await indexRepo(root, dbPath);

    const db = openDb(dbPath);
    migrate(db);
    const file = db
      .prepare("SELECT parse_state AS parseState, diagnostics FROM file WHERE path = ?")
      .get("src/broken.ts") as { parseState: string; diagnostics: string };
    expect(file.parseState).toBe("failed");
    expect(JSON.parse(file.diagnostics)).not.toEqual([]);
    db.close();
  });

  it("labels inbound references to a newly unparsable target as parse_failed", async () => {
    await indexRepo(root, dbPath);
    writeFileSync(join(root, "src", "util.ts"), "export function ( {{{ ");
    await updateRepo(root, dbPath);

    const db = openDb(dbPath);
    migrate(db);
    const unresolved = db
      .prepare("SELECT name, reason FROM unresolved_ref")
      .all() as Array<{ name: string; reason: string }>;
    expect(unresolved).toContainEqual({
      name: "validate",
      reason: "parse_failed",
    });
    db.close();
  });

  it("preserves target_removed when the target file itself is deleted", async () => {
    await indexRepo(root, dbPath);
    rmSync(join(root, "src", "util.ts"));
    await updateRepo(root, dbPath);

    const db = openDb(dbPath);
    migrate(db);
    const unresolved = db
      .prepare("SELECT name, reason FROM unresolved_ref")
      .all() as Array<{ name: string; reason: string }>;
    expect(unresolved).toContainEqual({
      name: "validate",
      reason: "target_removed",
    });
    db.close();
  });
});
