import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  globTool,
  grepTool,
  readFileTool,
} from "../../bench/harness/runLiveBaseline.js";
import { RepoBoundary } from "../../src/repo/boundary.js";

let base: string;
let root: string;
let boundary: RepoBoundary;

beforeEach(() => {
  base = mkdtempSync(join(tmpdir(), "cg-live-baseline-"));
  root = join(base, "repo");
  mkdirSync(join(root, "src"), { recursive: true });
  writeFileSync(join(root, "src", "a.ts"), "export function nextDelay() {}\n");
  writeFileSync(join(root, "src", "b.ts"), "export function other() {}\n");
  writeFileSync(join(base, "secret.ts"), "SECRET\n");
  symlinkSync(join(base, "secret.ts"), join(root, "src", "escape.ts"));
  boundary = new RepoBoundary(root);
});

afterEach(() => rmSync(base, { recursive: true, force: true }));

describe("live baseline tool handlers", () => {
  it("grep finds a literal pattern and reports matching files", async () => {
    const result = await grepTool(boundary, { pattern: "nextDelay" });
    expect(result).toBe("src/a.ts");
  });

  it("grep reports no matches without throwing", async () => {
    expect(await grepTool(boundary, { pattern: "doesNotExist" })).toBe("no matches");
  });

  it("grep skips symlinks instead of following an escaping target", async () => {
    expect(await grepTool(boundary, { pattern: "SECRET" })).toBe("no matches");
  });

  it("glob lists TypeScript files in deterministic order", async () => {
    expect(await globTool(boundary, { pattern: "**/*.ts" })).toBe(
      "src/a.ts\nsrc/b.ts",
    );
  });

  it("glob reports unsupported patterns honestly", async () => {
    expect(await globTool(boundary, { pattern: "**/*.json" })).toMatch(/unsupported/i);
  });

  it("read_file returns file contents", async () => {
    expect(await readFileTool(boundary, { path: "src/a.ts" })).toContain("nextDelay");
  });

  it("read_file reports missing and escaping paths without throwing", async () => {
    expect(await readFileTool(boundary, { path: "src/missing.ts" })).toMatch(/error/i);
    expect(await readFileTool(boundary, { path: "../secret.ts" })).toMatch(/error/i);
    expect(await readFileTool(boundary, { path: "src/escape.ts" })).not.toContain("SECRET");
  });
});
