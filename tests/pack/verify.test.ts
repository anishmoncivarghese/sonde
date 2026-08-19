import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { verifySymbolBody } from "../../src/pack/verify.js";
import { RepoBoundary } from "../../src/repo/boundary.js";

let root: string;
let boundary: RepoBoundary;

const original = "export function run() { return 1; }";

function hash(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "cg-verify-"));
  mkdirSync(join(root, "src"));
  writeFileSync(join(root, "src", "a.ts"), `${original}\n`);
  boundary = new RepoBoundary(root);
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

describe("verifySymbolBody", () => {
  it("returns bytes only as verified when their hash matches the index", () => {
    const expected = Buffer.from(original);

    const result = verifySymbolBody(boundary, {
      path: "src/a.ts",
      startByte: 0,
      endByte: expected.length,
      bodyHash: hash(expected),
    });

    expect(result.verified).toBe(true);
    expect(result.bytes.equals(expected)).toBe(true);
    expect(result.hash).toBe(hash(expected));
  });

  it("reports unverified when the indexed range changed on disk", () => {
    const before = Buffer.from(original);
    writeFileSync(
      join(root, "src", "a.ts"),
      "export function run() { return 2; }\n",
    );

    const result = verifySymbolBody(boundary, {
      path: "src/a.ts",
      startByte: 0,
      endByte: before.length,
      bodyHash: hash(before),
    });

    expect(result.verified).toBe(false);
  });

  it("cannot verify a symbol that has no indexed body hash", () => {
    const result = verifySymbolBody(boundary, {
      path: "src/a.ts",
      startByte: 0,
      endByte: Buffer.byteLength(original),
      bodyHash: null,
    });

    expect(result.verified).toBe(false);
  });

  it("rejects an indexed byte range outside the current file", () => {
    const result = verifySymbolBody(boundary, {
      path: "src/a.ts",
      startByte: 0,
      endByte: Buffer.byteLength(original) + 100,
      bodyHash: hash(Buffer.from(original)),
    });

    expect(result.verified).toBe(false);
    expect(result.bytes).toHaveLength(0);
  });
});
