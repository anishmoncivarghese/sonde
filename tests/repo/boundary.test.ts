import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PathEscapeError, RepoBoundary } from "../../src/repo/boundary.js";

let base: string;
let root: string;
let outside: string;

beforeAll(() => {
  base = mkdtempSync(join(tmpdir(), "cg-"));
  root = join(base, "repo");
  outside = join(base, "outside");
  mkdirSync(root);
  mkdirSync(outside);
  writeFileSync(join(root, "a.ts"), "export const a = 1;");
  writeFileSync(join(outside, "secret.txt"), "SECRET");
  symlinkSync(join(outside, "secret.txt"), join(root, "escape.txt"));
});

afterAll(() => rmSync(base, { recursive: true, force: true }));

describe("RepoBoundary", () => {
  it("reads a file inside the root", () => {
    const boundary = new RepoBoundary(root);
    expect(boundary.readFile("a.ts").toString()).toContain("export const a");
  });

  it("rejects ../ traversal", () => {
    const boundary = new RepoBoundary(root);
    expect(() => boundary.resolve("../outside/secret.txt")).toThrow(
      PathEscapeError,
    );
  });

  it("rejects an absolute path outside the root", () => {
    const boundary = new RepoBoundary(root);
    expect(() => boundary.resolve(join(outside, "secret.txt"))).toThrow(
      PathEscapeError,
    );
  });

  it("rejects a symlink that escapes the root", () => {
    const boundary = new RepoBoundary(root);
    expect(() => boundary.readFile("escape.txt")).toThrow(PathEscapeError);
  });

  it("rejects a NUL byte in the path", () => {
    const boundary = new RepoBoundary(root);
    expect(() => boundary.resolve("a\0.ts")).toThrow(PathEscapeError);
  });
});
