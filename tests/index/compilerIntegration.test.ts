import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { indexRepo } from "../../src/index/pipeline.js";
import { migrate, openDb, Store } from "../../src/store/index.js";

function ambiguousFixture(): string {
  const root = mkdtempSync(join(tmpdir(), "cg-int-"));
  mkdirSync(join(root, "src"));
  writeFileSync(
    join(root, "src", "store.ts"),
    "export class Store { get(): number { return 1; } }",
  );
  for (let index = 0; index < 8; index += 1) {
    writeFileSync(
      join(root, "src", `cache-${index}.ts`),
      `export class Cache${index} { get(): number { return ${index}; } }`,
    );
  }
  writeFileSync(
    join(root, "src", "app.ts"),
    "import { Store } from './store.js';\n" +
      "export function run(s: Store): number { return s.get(); }",
  );
  writeFileSync(
    join(root, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        strict: true,
        module: "esnext",
        target: "es2022",
        moduleResolution: "bundler",
      },
      include: ["src"],
    }),
  );
  return root;
}

describe("compiler pass integration", () => {
  it("does not build a program unless asked", async () => {
    const root = ambiguousFixture();
    const stats = await indexRepo(root, join(root, "i.sqlite"));
    expect(stats.compilerUpgraded).toBeNull();
  });

  it("produces COMPILER-tier edges when asked", async () => {
    const root = ambiguousFixture();
    const dbPath = join(root, "i.sqlite");
    const stats = await indexRepo(root, dbPath, { resolve: true });
    expect(stats.compilerUpgraded).toBeGreaterThan(0);

    const db = openDb(dbPath);
    migrate(db);
    expect(new Store(db).tierCounts().COMPILER).toBeGreaterThan(0);
    const finalEdgeCount = db
      .prepare("SELECT COUNT(*) AS count FROM edge")
      .get() as { count: number };
    expect(stats.edges).toBe(finalEdgeCount.count);
    const exactCall = db
      .prepare(
        `SELECT COUNT(*) AS count
         FROM edge e
         JOIN symbol s ON s.id = e.src_symbol_id
         JOIN symbol d ON d.id = e.dst_symbol_id
         WHERE s.stable_key = 'ts:src/app.ts#run'
           AND d.stable_key = 'ts:src/store.ts#Store.get'
           AND e.kind = 'CALLS'
           AND e.tier = 'COMPILER'`,
      )
      .get() as { count: number };
    expect(exactCall.count).toBe(1);
    db.close();
  });

  it("indexes successfully with --resolve when no tsconfig exists", async () => {
    // Invariant 8: degraded, not broken.
    const root = mkdtempSync(join(tmpdir(), "cg-int-none-"));
    mkdirSync(join(root, "src"));
    writeFileSync(
      join(root, "src", "a.ts"),
      "export function a(): void {}",
    );
    const stats = await indexRepo(root, join(root, "i.sqlite"), {
      resolve: true,
    });
    expect(stats.compilerUpgraded).toBeNull();
    expect(stats.symbols).toBeGreaterThan(0);
  });
});

describe("stats reflect the compiler pass", () => {
  it("recomputes the unresolved count after compiler placements", async () => {
    // stats.edges was refreshed after the pass but stats.unresolved was not, so
    // `index --resolve` reported 21,078 unresolved on the large fixture while
    // the database held 19,361. The figure understated the benefit of the flag.
    const root = ambiguousFixture();
    const dbPath = join(root, "i.sqlite");
    const stats = await indexRepo(root, dbPath, { resolve: true });

    const db = openDb(dbPath);
    migrate(db);
    const actual = (
      db.prepare("SELECT COUNT(*) AS n FROM unresolved_ref").get() as { n: number }
    ).n;
    db.close();

    expect(stats.unresolved).toBe(actual);
  });

  it("leaves the unresolved count alone when the pass does not run", async () => {
    const root = ambiguousFixture();
    const dbPath = join(root, "i.sqlite");
    const stats = await indexRepo(root, dbPath);

    const db = openDb(dbPath);
    migrate(db);
    const actual = (
      db.prepare("SELECT COUNT(*) AS n FROM unresolved_ref").get() as { n: number }
    ).n;
    db.close();

    expect(stats.unresolved).toBe(actual);
  });
});
