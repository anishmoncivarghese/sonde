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

  it("reports unknown dirtiness outside a git repository, never clean", () => {
    // This asserted `dirty: false` until 2026-08-19. Invariant 8 requires
    // degrading visibly; claiming a clean worktree when git could not be
    // consulted is the unsafe direction, because freshness consumes it and a
    // stale index would present itself as current. `null` is the only honest
    // answer, and strictNullChecks stops a consumer reading it as clean.
    const bare = mkdtempSync(join(tmpdir(), "cg-nogit-"));
    try {
      const bareBoundary = new RepoBoundary(bare);
      expect(gitState(bareBoundary)).toEqual({
        revision: null,
        dirty: null,
      });
      // Same defect class: `[]` would claim "nothing changed", so a caller
      // deciding what to re-index would skip every file.
      expect(changedFiles(bareBoundary)).toBeNull();
    } finally {
      rmSync(bare, { recursive: true, force: true });
    }
  });

  it("reports unknown dirtiness in a repository with no commits", () => {
    // `rev-parse HEAD` fails here while `status` succeeds, so this is a real
    // repository whose revision is genuinely unknowable — the case that most
    // easily reached the old `dirty: false` and reported a freshly initialised
    // repo full of untracked files as a clean tree.
    const fresh = mkdtempSync(join(tmpdir(), "cg-nocommit-"));
    try {
      execFileSync("git", ["init", "-q"], { cwd: fresh });
      writeFileSync(join(fresh, "a.ts"), "export const a = 1;\n");
      const state = gitState(new RepoBoundary(fresh));
      expect(state.revision).toBeNull();
      expect(state.dirty).toBeNull();
    } finally {
      rmSync(fresh, { recursive: true, force: true });
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
