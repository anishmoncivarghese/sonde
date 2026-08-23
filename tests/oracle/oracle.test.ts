import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { buildOracle, type OracleEdge } from "../../bench/oracle/extract.js";
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

describe("REFERENCES is the union of all edge kinds (spec §6.1)", () => {
  const edge = (
    srcSymbol: string,
    dstSymbol: string,
    kind: OracleEdge["kind"],
  ): OracleEdge => ({
    srcFile: "a.ts",
    srcSymbol,
    dstFile: "b.ts",
    dstSymbol,
    kind,
  });

  it("credits a stored CALLS edge against an oracle REFERENCES edge", () => {
    // Spec §6.1: CALLS is a subset of REFERENCES, stored once and unioned at
    // query time. tsc's findReferences includes call sites, so the oracle
    // records both; scoring Sonde's REFERENCES rows alone reported 0.000
    // recall for a query that would in fact return the call site.
    const actual = [edge("caller", "target", "CALLS")];
    const expected = [
      edge("caller", "target", "CALLS"),
      edge("caller", "target", "REFERENCES"),
    ];
    expect(compare(actual, expected).byKind.REFERENCES!.recall).toBe(1);
  });

  it("credits INHERITS and IMPLEMENTS against oracle references too", () => {
    const actual = [
      edge("Sub", "Base", "INHERITS"),
      edge("Impl", "Iface", "IMPLEMENTS"),
    ];
    const expected = [
      edge("Sub", "Base", "REFERENCES"),
      edge("Impl", "Iface", "REFERENCES"),
    ];
    expect(compare(actual, expected).byKind.REFERENCES!.recall).toBe(1);
  });

  it("still misses a reference Sonde never saw in any form", () => {
    const actual: OracleEdge[] = [];
    const expected = [edge("reader", "unseen", "REFERENCES")];
    expect(compare(actual, expected).byKind.REFERENCES!.recall).toBe(0);
  });

  it("leaves the specific kinds scored strictly", () => {
    // A REFERENCES edge must NOT be credited as a CALLS edge — the subset
    // relation runs one way only.
    const actual = [edge("caller", "target", "REFERENCES")];
    const expected = [edge("caller", "target", "CALLS")];
    expect(compare(actual, expected).byKind.CALLS!.recall).toBe(0);
  });
});

describe("overall score aggregates the per-kind results", () => {
  it("does not contradict the rows it summarises", () => {
    // Before this, `overall` used strict kind matching while the REFERENCES row
    // used the subset relation, so a report could show REFERENCES recall 0.800
    // above an overall recall of 0.444 computed on a different rule.
    const e = (
      srcSymbol: string,
      dstSymbol: string,
      kind: OracleEdge["kind"],
    ): OracleEdge => ({ srcFile: "a.ts", srcSymbol, dstFile: "b.ts", dstSymbol, kind });

    const actual = [e("caller", "target", "CALLS")];
    const expected = [
      e("caller", "target", "CALLS"),
      e("caller", "target", "REFERENCES"),
    ];
    const report = compare(actual, expected);

    const tp = Object.values(report.byKind).reduce((sum, k) => sum + k.tp, 0);
    const fn = Object.values(report.byKind).reduce((sum, k) => sum + k.fn, 0);
    expect(report.overall.tp).toBe(tp);
    expect(report.overall.fn).toBe(fn);
    expect(report.overall.recall).toBe(tp / (tp + fn));
  });
});
