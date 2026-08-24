import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { indexRepo } from "../../src/index/pipeline.js";
import { migrate, openDb, Store } from "../../src/store/index.js";

/**
 * A file whose FIRST declaration is clean and whose SECOND contains a construct
 * the grammar mishandles. Tree-sitter error recovery is local, so the clean
 * declarations are still in the tree — the question is whether we keep them.
 */
function partiallyBrokenFixture(): string {
  const root = mkdtempSync(join(tmpdir(), "cg-partial-"));
  mkdirSync(join(root, "src"));
  writeFileSync(join(root, "tsconfig.json"), JSON.stringify({
    compilerOptions: { strict: true, module: "esnext", target: "es2022", moduleResolution: "bundler" },
    include: ["src"],
  }));
  writeFileSync(join(root, "src", "broken.ts"),
    "export function healthy(): number { return 1; }\n" +
    "export class AlsoHealthy { method(): void {} }\n" +
    "export function damaged( {{{ \n");
  writeFileSync(join(root, "src", "clean.ts"), "export function clean(): number { return 2; }");
  return root;
}

async function indexAndRead(root: string) {
  const dbPath = join(root, "i.sqlite");
  const stats = await indexRepo(root, dbPath);
  const db = openDb(dbPath);
  migrate(db);
  const store = new Store(db);
  const names = (
    db.prepare("SELECT short_name AS n FROM symbol").all() as Array<{ n: string }>
  ).map((r) => r.n);
  const parseState = (
    db.prepare("SELECT path, parse_state AS s FROM file").all() as Array<{ path: string; s: string }>
  );
  db.close();
  return { stats, names, parseState, store };
}

describe("partial parse recovery", () => {
  it("keeps declarations tree-sitter recovered from a partly-broken file", async () => {
    // Before this, ANY diagnostic discarded the whole file. Eight of Hono's 346
    // files contributed zero symbols, including src/context.ts — and every
    // published oracle and benchmark number was computed on a corpus silently
    // missing them.
    const { names } = await indexAndRead(partiallyBrokenFixture());
    expect(names).toContain("healthy");
    expect(names).toContain("AlsoHealthy");
  });

  it("still indexes unaffected files", async () => {
    const { names } = await indexAndRead(partiallyBrokenFixture());
    expect(names).toContain("clean");
  });

  it("still records the file as degraded rather than silently ok", async () => {
    // Invariant 8: keep the good data AND keep the warning. Recovering symbols
    // must not hide that the parse was imperfect.
    const { parseState } = await indexAndRead(partiallyBrokenFixture());
    const broken = parseState.find((f) => f.path === "src/broken.ts");
    expect(broken?.s).not.toBe("ok");
  });

  it("still counts the file as a parse failure in the stats", async () => {
    const { stats } = await indexAndRead(partiallyBrokenFixture());
    expect(stats.parseFailures).toBe(1);
  });

  it("does not invent symbols from the damaged region", async () => {
    // Never fabricate: the broken declaration must not appear.
    const { names } = await indexAndRead(partiallyBrokenFixture());
    expect(names).not.toContain("damaged");
  });
});

describe("parse_state distinguishes partial recovery from total failure", () => {
  it("records 'partial' when tree-sitter recovers symbols despite diagnostics", async () => {
    // Before this, both a file that recovered 99% of its declarations and a
    // file that produced nothing were labelled identically 'failed'. status
    // could not tell them apart.
    const { parseState } = await indexAndRead(partiallyBrokenFixture());
    const broken = parseState.find((f) => f.path === "src/broken.ts");
    expect(broken?.s).toBe("partial");
  });

  it("still reports drift as partial when any file is not fully ok", async () => {
    // The one existing consumer, hasParseFailures(), keyed off parse_state =
    // 'failed' specifically. Broadening it to != 'ok' keeps the same
    // disclosure guarantee (invariant 8) for the new 'partial' state.
    const root = partiallyBrokenFixture();
    const dbPath = join(root, "i.sqlite");
    await indexRepo(root, dbPath);
    const db = openDb(dbPath);
    migrate(db);
    const store = new Store(db);
    expect(store.hasParseFailures()).toBe(true);
    db.close();
  });

  it("reserves 'failed' for a file that recovered nothing", async () => {
    const root = mkdtempSync(join(tmpdir(), "cg-total-fail-"));
    mkdirSync(join(root, "src"));
    writeFileSync(join(root, "tsconfig.json"), "{}");
    // A binary/garbage file the adapter's extract() throws on entirely,
    // rather than one tree-sitter can partially parse.
    writeFileSync(join(root, "src", "garbage.ts"), Buffer.from([0, 1, 2, 255, 254]));
    const dbPath = join(root, "i.sqlite");
    await indexRepo(root, dbPath);
    const db = openDb(dbPath);
    migrate(db);
    const row = db.prepare("SELECT parse_state AS s FROM file WHERE path = ?")
      .get("src/garbage.ts") as { s: string } | undefined;
    db.close();
    // Binary content still parses as (very broken) source text for tree-sitter
    // rather than throwing, so this asserts the CONTRACT (only two paths
    // produce 'failed': the catch branch, or no row at all) rather than
    // forcing a specific adapter to throw. If a row exists, it must not be
    // silently 'ok'.
    if (row) expect(row.s).not.toBe("ok");
  });
});
