import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { RepoBoundary } from "../../src/repo/boundary.js";
import { openPyrightSession } from "../../src/resolve/pyrightClient.js";

function fixture(): RepoBoundary {
  const root = mkdtempSync(join(tmpdir(), "sonde-pyright-"));
  mkdirSync(join(root, "pkg"), { recursive: true });
  writeFileSync(join(root, "pkg/__init__.py"), "");
  writeFileSync(join(root, "pkg/util.py"), "def helper():\n    return 1\n");
  writeFileSync(
    join(root, "pkg/main.py"),
    "from pkg.util import helper\n\n\ndef run():\n    return helper()\n",
  );
  writeFileSync(
    join(root, "pkg/ext.py"),
    "def f():\n    return len([])\n",
  );
  return new RepoBoundary(root);
}

const FILES = ["pkg/util.py", "pkg/main.py", "pkg/ext.py"];

async function sessionFor(boundary: RepoBoundary) {
  return openPyrightSession(boundary, FILES, {
    requestTimeoutMs: 30_000,
    sessionTimeoutMs: 60_000,
  });
}

describe("pyright client", () => {
  it("resolves an in-repo call to its definition", async () => {
    const boundary = fixture();
    const session = await sessionFor(boundary);
    try {
      const [result] = await session.definitions([
        { file: "pkg/main.py", line: 4, character: 11 },
      ]);
      expect(session.pyrightVersion).toMatch(/^\d+\.\d+\.\d+/);
      expect(result).toEqual({
        kind: "in-repo",
        file: "pkg/util.py",
        line: 0,
        character: 4,
      });
    } finally {
      session.close();
    }
  }, 60_000);

  it("preserves query order and length", async () => {
    const boundary = fixture();
    const session = await sessionFor(boundary);
    try {
      const queries = Array.from({ length: 5 }, () => ({
        file: "pkg/main.py",
        line: 4,
        character: 11,
      }));
      const results = await session.definitions(queries);
      expect(results).toHaveLength(5);
      expect(
        results.every(
          (result) =>
            result.kind === "in-repo" && result.file === "pkg/util.py",
        ),
      ).toBe(true);
    } finally {
      session.close();
    }
  }, 60_000);

  it("answers none when pyright has no definition", async () => {
    const boundary = fixture();
    const session = await sessionFor(boundary);
    try {
      const [result] = await session.definitions([
        { file: "pkg/util.py", line: 1, character: 11 },
      ]);
      expect(result).toEqual({ kind: "none" });
      expect(session.failureReason).toBeNull();
    } finally {
      session.close();
    }
  }, 60_000);

  it("reports a typeshed definition as external", async () => {
    const boundary = fixture();
    const session = await sessionFor(boundary);
    try {
      const [result] = await session.definitions([
        { file: "pkg/ext.py", line: 1, character: 11 },
      ]);
      expect(result?.kind).toBe("external");
      if (result?.kind === "external") {
        expect(result.uri).toContain("typeshed");
      }
    } finally {
      session.close();
    }
  }, 60_000);

  it("turns a failed query into none, never external", async () => {
    const boundary = fixture();
    const session = await sessionFor(boundary);
    session.close();
    const [result] = await session.definitions([
      { file: "pkg/main.py", line: 4, character: 11 },
    ]);
    expect(result).toEqual({ kind: "none" });
    expect(session.failureReason).toMatch(/closed/i);
  }, 60_000);

  it("close() is safe to call twice", async () => {
    const boundary = fixture();
    const session = await sessionFor(boundary);
    session.close();
    expect(() => session.close()).not.toThrow();
  }, 60_000);
});
