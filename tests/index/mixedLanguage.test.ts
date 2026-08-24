import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { indexRepo } from "../../src/index/pipeline.js";
import { migrate, openDb, Store } from "../../src/store/index.js";

/**
 * A real mixed-language repository — the exact shape that broke indexing.
 * web-tree-sitter's Parser.init() bootstraps a single shared WASM runtime and
 * has no guard against concurrent calls. Every prior test exercised exactly
 * one language adapter per process, so this race was latent: indexing a real
 * repository containing both TypeScript and Swift (e.g. a Swift app with a
 * TypeScript marketing site, which is not a contrived case) threw
 * "Incompatible language version 0" from whichever grammar load lost the
 * race, non-deterministically.
 */
function mixedLanguageFixture(): string {
  const root = mkdtempSync(join(tmpdir(), "cg-mixed-"));
  mkdirSync(join(root, "src"));
  mkdirSync(join(root, "website"));
  writeFileSync(join(root, "tsconfig.json"), JSON.stringify({
    compilerOptions: { strict: true, module: "esnext", target: "es2022", moduleResolution: "bundler" },
    include: ["website"],
  }));
  writeFileSync(join(root, "src", "Model.swift"), "struct Model { func run() {} }");
  writeFileSync(join(root, "website", "app.ts"), "export function render(): void {}");
  return root;
}

describe("mixed-language repository", () => {
  it("indexes TypeScript and Swift together without a parser runtime race", async () => {
    const root = mixedLanguageFixture();
    const dbPath = join(root, "i.sqlite");

    // Run several times: the race is timing-dependent, so a single pass could
    // pass by luck even with the bug present.
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const stats = await indexRepo(root, dbPath);
      expect(stats.filesIndexed).toBeGreaterThan(0);
    }

    const db = openDb(dbPath);
    migrate(db);
    const names = (
      new Store(db).symbolsInFile("src/Model.swift")
    ).map((s) => s.shortName);
    db.close();
    expect(names).toContain("Model");
  });
});
