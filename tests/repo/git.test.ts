import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { changedFiles, gitState } from "../../src/repo/git.js";
import { RepoBoundary } from "../../src/repo/boundary.js";

let root: string;
let boundary: RepoBoundary;

function git(...args: string[]): void {
  execFileSync("git", args, { cwd: root });
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "cg-git-"));
  git("init", "-q");
  git("config", "user.email", "test@example.com");
  git("config", "user.name", "test");
  writeFileSync(join(root, "a.ts"), "export const a = 1;\n");
  git("add", "a.ts");
  git("commit", "-q", "-m", "initial");
  boundary = new RepoBoundary(root);
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

describe("gitState", () => {
  it("reports the current revision and a clean tree", () => {
    const state = gitState(boundary);
    expect(state.revision).toMatch(/^[0-9a-f]{40}$/);
    expect(state.dirty).toBe(false);
  });

  it("reports dirty after an uncommitted change", () => {
    writeFileSync(join(root, "a.ts"), "export const a = 2;\n");
    expect(gitState(boundary).dirty).toBe(true);
  });

  it("degrades outside a git repository", () => {
    const bare = mkdtempSync(join(tmpdir(), "cg-nogit-"));
    try {
      const bareBoundary = new RepoBoundary(bare);
      expect(gitState(bareBoundary)).toEqual({
        revision: null,
        dirty: false,
      });
      expect(changedFiles(bareBoundary)).toEqual([]);
    } finally {
      rmSync(bare, { recursive: true, force: true });
    }
  });
});

describe("changedFiles", () => {
  it("lists files changed since the given revision", () => {
    const base = gitState(boundary).revision!;
    writeFileSync(join(root, "b.ts"), "export const b = 1;\n");
    git("add", "b.ts");
    git("commit", "-q", "-m", "second");
    expect(changedFiles(boundary, base)).toEqual(["b.ts"]);
  });

  it("lists the uncommitted working-tree diff when no revision is given", () => {
    writeFileSync(join(root, "a.ts"), "export const a = 3;\n");
    expect(changedFiles(boundary)).toEqual(["a.ts"]);
  });
});
