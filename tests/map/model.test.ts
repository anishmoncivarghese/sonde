import { describe, expect, it } from "vitest";
import { buildModuleGraph } from "../../src/doc/modules.js";
import {
  buildMapModel,
  evidenceOf,
  reachable,
  rollUp,
  simplify,
} from "../../src/map/model.js";

function edge(src: string, dst: string, tier: string, count = 1) {
  return Array.from({ length: count }, () => ({
    srcFile: src,
    dstFile: dst,
    dstName: "fn",
    kind: "CALLS",
    tier,
  }));
}

describe("evidenceOf", () => {
  it("calls a pair weak when heuristic name matches outnumber resolved ones", () => {
    // The real shape this guards: typescript -> swift carries 1 LEXICAL
    // reference against 38 heuristic name matches, and drawing it like a
    // compiler-resolved edge is the misreading the whole pipeline avoids.
    const graph = buildModuleGraph(
      [...edge("a/x.ts", "b/y.ts", "LEXICAL", 1), ...edge("a/x.ts", "b/y.ts", "HEURISTIC", 38)],
      [],
    );
    expect(evidenceOf(graph.dependencies[0]!)).toBe("weak");
  });

  it("calls a pair unverified when nothing resolved at all", () => {
    const graph = buildModuleGraph(edge("a/x.ts", "b/y.ts", "HEURISTIC", 62), []);
    expect(evidenceOf(graph.dependencies[0]!)).toBe("unverified");
  });

  it("calls a pair resolved when resolved references are the majority", () => {
    const graph = buildModuleGraph(
      [...edge("a/x.ts", "b/y.ts", "COMPILER", 9), ...edge("a/x.ts", "b/y.ts", "HEURISTIC", 2)],
      [],
    );
    expect(evidenceOf(graph.dependencies[0]!)).toBe("resolved");
  });
});

describe("rollUp", () => {
  it("collapses one level under src and to the top elsewhere", () => {
    expect(rollUp("src/adapters/python")).toBe("src/adapters");
    expect(rollUp("src/store")).toBe("src/store");
    expect(rollUp("bench/harness")).toBe("bench");
  });
});

describe("simplify", () => {
  const graph = () =>
    buildModuleGraph(
      [
        ...edge("src/adapters/python/a.ts", "src/store/b.ts", "COMPILER", 5),
        ...edge("src/adapters/swift/a.ts", "src/store/b.ts", "COMPILER", 3),
        ...edge("bench/harness/a.ts", "src/store/b.ts", "COMPILER", 4),
        ...edge("src/cli/a.ts", "src/query/b.ts", "HEURISTIC", 9),
      ],
      [],
    );

  it("merges nested modules into one node and sums their references", () => {
    const out = simplify(graph());
    const adapters = out.dependencies.filter((d) => d.from === "src/adapters");
    expect(adapters).toHaveLength(1);
    expect(adapters[0]!.byTier.COMPILER).toBe(8);
  });

  it("drops scaffolding that ships nothing", () => {
    expect(simplify(graph()).dependencies.map((d) => d.from)).not.toContain("bench");
  });

  it("drops every pair that is not resolved-majority, with no way back", () => {
    // The complete map has a toggle. This one must not: an orientation map
    // that shows a guess beside a fact teaches a wrong shape.
    const out = simplify(graph());
    expect(out.dependencies.some((d) => d.to === "src/query")).toBe(false);
  });
});

describe("reachable", () => {
  const model = () =>
    buildMapModel(
      buildModuleGraph(
        [
          ...edge("src/cli/a.ts", "src/index/b.ts", "COMPILER", 4),
          ...edge("src/index/b.ts", "src/resolve/c.ts", "COMPILER", 4),
          ...edge("src/resolve/c.ts", "src/store/d.ts", "COMPILER", 4),
          ...edge("src/alone/e.ts", "src/other/f.ts", "HEURISTIC", 7),
        ],
        [],
      ),
      "complete",
    );

  it("walks the whole chain upstream, not just one hop", () => {
    // Phase 0's central finding: asked what breaks when src/store changes, the
    // answer is the closure, and a one-hop highlight does not produce it.
    expect([...reachable(model().edges, "src/store", "upstream")].sort()).toEqual([
      "src/cli",
      "src/index",
      "src/resolve",
    ]);
  });

  it("walks downstream from a seed", () => {
    expect([...reachable(model().edges, "src/cli", "downstream")].sort()).toEqual([
      "src/index",
      "src/resolve",
      "src/store",
    ]);
  });

  it("never traverses an unverified pair", () => {
    expect(reachable(model().edges, "src/other", "upstream").size).toBe(0);
  });
});

describe("buildMapModel", () => {
  const graph = buildModuleGraph(
    [
      ...edge("src/cli/a.ts", "src/store/b.ts", "COMPILER", 9),
      ...edge("src/index/c.ts", "src/store/b.ts", "COMPILER", 3),
    ],
    [],
  );

  it("is deterministic across runs", () => {
    expect(buildMapModel(graph, "complete")).toEqual(buildMapModel(graph, "complete"));
  });

  it("scales thickness by resolved references, never by raw volume", () => {
    const noisy = buildModuleGraph(
      [
        ...edge("a/x.ts", "b/y.ts", "COMPILER", 9),
        ...edge("c/x.ts", "d/y.ts", "COMPILER", 5),
        ...edge("c/x.ts", "d/y.ts", "HEURISTIC", 90),
      ],
      [],
    );
    const model = buildMapModel(noisy, "complete");
    const thin = model.edges.find((e) => e.from === "c")!;
    const thick = model.edges.find((e) => e.from === "a")!;
    expect(thick.total).toBeLessThan(thin.total);
    expect(thick.weight).toBeGreaterThan(thin.weight);
  });
});
