import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { indexPathFor } from "../../src/index/cache.js";

let root: string;
let cacheHome: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "cg-cache-repo-"));
  cacheHome = mkdtempSync(join(tmpdir(), "cg-cache-home-"));
  vi.stubEnv("HOME", cacheHome);
});

afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(root, { recursive: true, force: true });
  rmSync(cacheHome, { recursive: true, force: true });
});

describe("indexPathFor", () => {
  it("returns a stable path for the same canonical root", () => {
    expect(indexPathFor(root)).toBe(indexPathFor(root));
  });

  it("returns different paths for different roots", () => {
    const other = mkdtempSync(join(tmpdir(), "cg-cache-repo-"));
    try {
      expect(indexPathFor(root)).not.toBe(indexPathFor(other));
    } finally {
      rmSync(other, { recursive: true, force: true });
    }
  });

  it("ends in index.sqlite under the user cache directory", () => {
    expect(indexPathFor(root)).toMatch(
      /\.cache[\\/]codegraph[\\/][0-9a-f]{16}[\\/]index\.sqlite$/,
    );
  });
});
