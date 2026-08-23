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
  createContextBudget,
  globTool,
  grepTool,
  readFileTool,
  takeContextResult,
} from "../../bench/harness/runLiveBaseline.js";
import { estimateTokens } from "../../src/pack/tokens.js";
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

  it("keeps cumulative tool results within the context budget", () => {
    const budget = createContextBudget(5);
    const first = takeContextResult(budget, "alpha beta gamma delta");
    const second = takeContextResult(budget, "epsilon zeta eta theta");

    expect(estimateTokens(first) + estimateTokens(second)).toBeLessThanOrEqual(5);
    expect(budget.usedTokens).toBeLessThanOrEqual(5);
    expect(budget.usedTokens).toBe(
      estimateTokens(first) + estimateTokens(second),
    );
  });
});
