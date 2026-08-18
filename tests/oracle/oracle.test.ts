import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { buildOracle } from "../../bench/oracle/extract.js";
import { compare } from "../../bench/oracle/compare.js";

const FIXTURE = join(process.cwd(), "tests/fixtures/repos/small");

describe("tsc oracle", () => {
  const edges = buildOracle(FIXTURE);

  it("finds the cross-file call from refresh to validate", () => {
    expect(edges).toContainEqual(expect.objectContaining({
      srcSymbol: "SessionManager.refresh", dstSymbol: "validate", kind: "CALLS",
    }));
  });

  it("finds the inheritance edge", () => {
    expect(edges).toContainEqual(expect.objectContaining({
      srcSymbol: "SessionManager", dstSymbol: "Base", kind: "INHERITS",
    }));
  });

  it("excludes targets outside the repo", () => {
    // `describe`/`it` come from ambient test typings, never from repo source.
    expect(edges.every(e => !e.dstFile.includes("node_modules"))).toBe(true);
    expect(edges.some(e => e.dstSymbol === "describe")).toBe(false);
  });

  it("resolves a barrel-mediated import to the owning file, not the barrel", () => {
    const e = edges.find(x => x.dstSymbol === "SessionManager" && x.srcFile.endsWith(".test.ts"));
    expect(e?.dstFile).toContain("auth/session.ts");
  });

  it("computes precision and recall per kind", () => {
    const r = compare(edges.slice(0, 2), edges);
    const calls = r.byKind.CALLS;
    expect(calls).toBeDefined();
    expect(calls?.recall).toBeLessThanOrEqual(1);
    expect(calls?.precision).toBe(1);
  });
});
