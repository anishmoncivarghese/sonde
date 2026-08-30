import { describe, expect, it } from "vitest";
import { buildModuleGraph, moduleOf } from "../../src/doc/modules.js";

const edge = (
  srcFile: string,
  dstFile: string,
  dstName: string,
  tier: string,
) => ({ srcFile, dstFile, dstName, kind: "CALLS", tier });

describe("moduleOf", () => {
  it("uses the immediate parent directory", () => {
    expect(moduleOf("src/adapters/python/parser.ts")).toBe(
      "src/adapters/python",
    );
  });

  it("names a root-level file explicitly", () => {
    expect(moduleOf("index.ts")).toBe(".");
  });
});

describe("buildModuleGraph", () => {
  it("aggregates cross-module edges and counts their evidence tiers", () => {
    const graph = buildModuleGraph(
      [
        edge(
          "src/cli/main.ts",
          "src/store/repos.ts",
          "insertSymbols",
          "COMPILER",
        ),
        edge(
          "src/cli/main.ts",
          "src/store/repos.ts",
          "tierCounts",
          "COMPILER",
        ),
        edge(
          "src/cli/main.ts",
          "src/store/repos.ts",
          "countUnresolved",
          "LEXICAL",
        ),
      ],
      [
        { filePath: "src/cli/main.ts", symbols: 4, testSymbols: 0 },
        { filePath: "src/store/repos.ts", symbols: 9, testSymbols: 0 },
      ],
    );

    expect(graph.dependencies).toEqual([
      {
        from: "src/cli",
        to: "src/store",
        total: 3,
        byTier: { COMPILER: 2, LEXICAL: 1, HEURISTIC: 0 },
      },
    ]);
  });

  it("ignores intra-module edges and unsupported tiers", () => {
    const graph = buildModuleGraph(
      [
        edge("src/cli/main.ts", "src/cli/prompt.ts", "confirm", "LEXICAL"),
        edge("src/cli/main.ts", "src/store/repos.ts", "Store", "EXTERNAL"),
      ],
      [{ filePath: "src/cli/main.ts", symbols: 1, testSymbols: 0 }],
    );
    expect(graph.dependencies).toEqual([]);
    expect(graph.tierTotals).toEqual({
      COMPILER: 0,
      LEXICAL: 0,
      HEURISTIC: 0,
    });
  });

  it("ranks the cross-module surface by how often it is referenced", () => {
    const graph = buildModuleGraph(
      [
        edge("src/cli/main.ts", "src/store/repos.ts", "tierCounts", "LEXICAL"),
        edge("src/doc/index.ts", "src/store/repos.ts", "tierCounts", "LEXICAL"),
        edge(
          "src/cli/main.ts",
          "src/store/repos.ts",
          "countUnresolved",
          "LEXICAL",
        ),
      ],
      [{ filePath: "src/store/repos.ts", symbols: 9, testSymbols: 0 }],
    );

    expect(graph.modules.find(({ path }) => path === "src/store")).toEqual({
      path: "src/store",
      files: 1,
      symbols: 9,
      // Ranked by reference count, not spelling: a truncated list must show
      // what other modules lean on. `tierCounts` is referenced twice.
      surface: ["tierCounts", "countUnresolved"],
    });
  });

  it("keeps heuristic name matches out of the surface", () => {
    // A heuristic edge is a name match, not a use. Without this filter the
    // surface fills with `add`, `value` and `node` -- coincidences between
    // modules that never reference each other.
    const graph = buildModuleGraph(
      [
        edge("src/cli/main.ts", "src/store/repos.ts", "realExport", "LEXICAL"),
        edge("src/cli/main.ts", "src/store/repos.ts", "add", "HEURISTIC"),
      ],
      [{ filePath: "src/store/repos.ts", symbols: 9, testSymbols: 0 }],
    );
    expect(graph.modules.find(({ path }) => path === "src/store")?.surface)
      .toEqual(["realExport"]);
  });

  it("keeps synthetic file symbols out of the surface", () => {
    // Every file carries a file-level symbol so module-level references have
    // an owner. It is not part of any module's public surface.
    const graph = buildModuleGraph(
      [
        {
          srcFile: "src/cli/main.ts", dstFile: "src/store/repos.ts",
          dstName: "repos.ts", dstKind: "file", kind: "IMPORTS", tier: "LEXICAL",
        },
        {
          srcFile: "src/cli/main.ts", dstFile: "src/store/repos.ts",
          dstName: "Store", dstKind: "class", kind: "CALLS", tier: "LEXICAL",
        },
      ],
      [{ filePath: "src/store/repos.ts", symbols: 9, testSymbols: 0 }],
    );
    expect(graph.modules.find(({ path }) => path === "src/store")?.surface)
      .toEqual(["Store"]);
  });

  it("ranks a thinly-resolved pair below a well-resolved one", () => {
    // Volume of heuristic matches is not evidence: modules with parallel
    // structure produce the most of them. This repository's swift and
    // typescript adapters share filenames and therefore function names, which
    // manufactured 62 "references" between modules that never import each other.
    const graph = buildModuleGraph(
      [
        ...Array.from({ length: 40 }, (_, i) =>
          edge("src/a/x.ts", "src/b/y.ts", `n${i}`, "HEURISTIC")),
        edge("src/a/x.ts", "src/b/y.ts", "thin", "LEXICAL"),
        ...Array.from({ length: 5 }, (_, i) =>
          edge("src/c/x.ts", "src/d/y.ts", `m${i}`, "COMPILER")),
      ],
      [],
    );
    expect(graph.dependencies[0]?.from).toBe("src/c");
  });

  it("is order-independent for both edge and file rows", () => {
    const rows = [
      edge("src/a/one.ts", "src/b/two.ts", "beta", "LEXICAL"),
      edge("src/b/two.ts", "src/c/three.ts", "gamma", "HEURISTIC"),
      edge("src/a/one.ts", "src/c/three.ts", "alpha", "COMPILER"),
    ];
    const counts = [
      { filePath: "src/a/one.ts", symbols: 1, testSymbols: 0 },
      { filePath: "src/b/two.ts", symbols: 2, testSymbols: 0 },
      { filePath: "src/c/three.ts", symbols: 3, testSymbols: 0 },
    ];

    expect(JSON.stringify(buildModuleGraph(rows, counts))).toBe(
      JSON.stringify(
        buildModuleGraph([...rows].reverse(), [...counts].reverse()),
      ),
    );
  });

  it("totals cross-module tiers for the header disclosure", () => {
    const graph = buildModuleGraph(
      [
        edge("src/a/one.ts", "src/b/two.ts", "beta", "HEURISTIC"),
        edge("src/a/one.ts", "src/b/two.ts", "gamma", "COMPILER"),
      ],
      [],
    );
    expect(graph.tierTotals).toEqual({
      COMPILER: 1,
      LEXICAL: 0,
      HEURISTIC: 1,
    });
  });
});

const testEdge = (
  srcFile: string,
  dstFile: string,
  dstName: string,
  tier = "LEXICAL",
) => ({ srcFile, dstFile, dstName, kind: "CALLS", tier });

describe("test-module exclusion", () => {
  it("drops modules whose symbols are all test symbols", () => {
    const graph = buildModuleGraph(
      [testEdge("tests/doc/a.test.ts", "src/doc/render.ts", "renderDoc")],
      [
        { filePath: "tests/doc/a.test.ts", symbols: 4, testSymbols: 4 },
        { filePath: "src/doc/render.ts", symbols: 3, testSymbols: 0 },
      ],
    );

    expect(graph.modules.map((module) => module.path)).toEqual(["src/doc"]);
    expect(graph.dependencies).toHaveLength(0);
    expect(graph.excludedTestModules).toBe(1);
  });

  it("keeps a module that mixes test and non-test symbols", () => {
    const graph = buildModuleGraph(
      [],
      [{ filePath: "src/doc/render.ts", symbols: 3, testSymbols: 1 }],
    );

    expect(graph.modules.map((module) => module.path)).toEqual(["src/doc"]);
  });

  it("includes test modules when asked", () => {
    const graph = buildModuleGraph(
      [testEdge("tests/doc/a.test.ts", "src/doc/render.ts", "renderDoc")],
      [
        { filePath: "tests/doc/a.test.ts", symbols: 4, testSymbols: 4 },
        { filePath: "src/doc/render.ts", symbols: 3, testSymbols: 0 },
      ],
      { includeTests: true },
    );

    expect(graph.modules.map((module) => module.path)).toEqual([
      "src/doc",
      "tests/doc",
    ]);
    expect(graph.excludedTestModules).toBe(0);
  });

  it("sorts dependencies by weight with deterministic path tiebreaks", () => {
    const rows = [
      testEdge("src/z/a.ts", "src/d/a.ts", "d"),
      testEdge("src/a/a.ts", "src/c/a.ts", "c"),
      testEdge("src/a/b.ts", "src/b/a.ts", "b"),
      testEdge("src/a/c.ts", "src/b/b.ts", "b2"),
    ];

    const expected = [
      ["src/a", "src/b", 2],
      ["src/a", "src/c", 1],
      ["src/z", "src/d", 1],
    ];
    expect(
      buildModuleGraph(rows, []).dependencies.map(({ from, to, total }) => [
        from,
        to,
        total,
      ]),
    ).toEqual(expected);
    expect(
      buildModuleGraph([...rows].reverse(), []).dependencies.map(
        ({ from, to, total }) => [from, to, total],
      ),
    ).toEqual(expected);
  });
});
