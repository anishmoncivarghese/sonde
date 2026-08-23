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
