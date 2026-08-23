import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RepoBoundary } from "../../src/repo/boundary.js";
import { discover } from "../../src/repo/discover.js";

let root: string;

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "cg-disc-"));
  mkdirSync(join(root, "src"));
  mkdirSync(join(root, "node_modules", "pkg"), { recursive: true });
  mkdirSync(join(root, "dist"));
  writeFileSync(join(root, ".gitignore"), "dist/\n*.log\n");
  writeFileSync(join(root, ".codegraphignore"), "src/generated.ts\n");
  writeFileSync(join(root, "src", "a.ts"), "export const a = 1;");
  writeFileSync(join(root, "src", "generated.ts"), "export const g = 1;");
  writeFileSync(
    join(root, "node_modules", "pkg", "i.ts"),
    "export const p = 1;",
  );
  writeFileSync(join(root, "dist", "a.js"), "1");
  writeFileSync(join(root, "debug.log"), "noise");
});

afterAll(() => rmSync(root, { recursive: true, force: true }));

describe("discover", () => {
  const paths = () =>
    discover(new RepoBoundary(root))
      .map((file) => file.path)
      .sort();

  it("includes ordinary source files", () => {
    expect(paths()).toContain("src/a.ts");
  });

  it("excludes node_modules", () => {
    expect(paths().some((path) => path.startsWith("node_modules"))).toBe(false);
  });

  it("honours .gitignore directories", () => {
    expect(paths().some((path) => path.startsWith("dist"))).toBe(false);
  });

  it("honours .gitignore globs", () => {
    expect(paths()).not.toContain("debug.log");
  });

  it("honours .codegraphignore", () => {
    expect(paths()).not.toContain("src/generated.ts");
  });

  it("records hash, mtime and size", () => {
    const file = discover(new RepoBoundary(root)).find(
      (candidate) => candidate.path === "src/a.ts",
    );
    expect(file?.contentHash).toMatch(/^[0-9a-f]{64}$/);
    expect(file?.size).toBeGreaterThan(0);
    expect(file?.mtimeMs).toBeGreaterThan(0);
  });

  it("skips files over the size cap", () => {
    writeFileSync(join(root, "src", "big.ts"), "x".repeat(5_000));
    const found = discover(new RepoBoundary(root), { maxBytes: 1_000 }).map(
      (file) => file.path,
    );
    expect(found).not.toContain("src/big.ts");
  });
});
