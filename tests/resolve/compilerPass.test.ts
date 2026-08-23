import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { indexRepo } from "../../src/index/pipeline.js";
import {
  createCompilerContext,
  runCompilerPass,
  TSC_VERSION,
} from "../../src/resolve/compilerPass.js";
import { migrate, openDb, Store } from "../../src/store/index.js";

function fixture(withConfig: boolean): string {
  const root = mkdtempSync(join(tmpdir(), "cg-compiler-"));
  mkdirSync(join(root, "src"));
  writeFileSync(
    join(root, "src", "a.ts"),
    "export function a(): number { return 1; }",
  );
  if (withConfig) {
    writeFileSync(
      join(root, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: {
          strict: true,
          moduleResolution: "bundler",
          module: "esnext",
          target: "es2022",
        },
        include: ["src"],
      }),
    );
  }
  return root;
}

describe("createCompilerContext", () => {
  it("builds a program when a tsconfig is present", () => {
    const context = createCompilerContext(fixture(true));
    expect(context).not.toBeNull();
    expect(context!.program.getSourceFiles().length).toBeGreaterThan(0);
  });

  it("returns null rather than throwing when tsconfig is absent", () => {
    // Invariant 8: a missing toolchain degrades with a warning; it never
    // crashes an index that would otherwise have succeeded.
    expect(createCompilerContext(fixture(false))).toBeNull();
  });

  it("returns null rather than throwing on a malformed tsconfig", () => {
    const root = fixture(false);
    writeFileSync(join(root, "tsconfig.json"), "{ this is not json");
    expect(createCompilerContext(root)).toBeNull();
  });

  it("classifies repository files as in-repo and node_modules as out", () => {
    const root = fixture(true);
    const context = createCompilerContext(root)!;
    expect(context.inRepo(join(root, "src", "a.ts"))).toBe(true);
    expect(context.inRepo(join(root, "node_modules", "x", "index.d.ts"))).toBe(
      false,
    );
  });

  it("reports the bundled compiler version, not the target repository's", () => {
    // SEC-008: the target repo's typescript is never loaded. Disclosing which
    // version resolved the edges is required by spec §5.3.
    expect(TSC_VERSION).toMatch(/^\d+\.\d+/);
  });
});

describe("runCompilerPass", () => {
  it("upgrades a member call the tree-sitter path could only guess at", async () => {
    // Two classes declare `get`. Without types the reference is HEURISTIC or,
    // past AMBIGUITY_CAP, dropped entirely with reason "too_ambiguous".
    const root = mkdtempSync(join(tmpdir(), "cg-pass-"));
    mkdirSync(join(root, "src"));
    writeFileSync(
      join(root, "src", "store.ts"),
      "export class Store { get(): number { return 1; } }",
    );
    writeFileSync(
      join(root, "src", "cache.ts"),
      "export class Cache { get(): number { return 2; } }",
    );
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

    const dbPath = join(root, "index.sqlite");
    await indexRepo(root, dbPath);
    const db = openDb(dbPath);
    migrate(db);
    const store = new Store(db);

    const result = runCompilerPass(root, store);
    expect(result).not.toBeNull();
    expect(result!.upgraded).toBeGreaterThan(0);

    const compilerEdges = db
      .prepare(
        `SELECT d.stable_key AS dst FROM edge e
         JOIN symbol d ON d.id = e.dst_symbol_id
         WHERE e.tier = 'COMPILER' AND e.kind = 'CALLS'`,
      )
      .all() as Array<{ dst: string }>;

    // The point of the whole plan: it resolves to Store.get, not Cache.get.
    expect(compilerEdges.map((row) => row.dst)).toContain(
      "ts:src/store.ts#Store.get",
    );
    expect(compilerEdges.map((row) => row.dst)).not.toContain(
      "ts:src/cache.ts#Cache.get",
    );
    db.close();
  });

  it("returns null without a tsconfig instead of throwing", async () => {
    const root = mkdtempSync(join(tmpdir(), "cg-pass-none-"));
    mkdirSync(join(root, "src"));
    writeFileSync(
      join(root, "src", "a.ts"),
      "export function a(): void {}",
    );
    const dbPath = join(root, "index.sqlite");
    await indexRepo(root, dbPath);
    const db = openDb(dbPath);
    migrate(db);
    expect(runCompilerPass(root, new Store(db))).toBeNull();
    db.close();
  });
});
