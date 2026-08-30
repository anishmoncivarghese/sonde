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
        { filePath: "src/cli/main.ts", symbols: 4 },
        { filePath: "src/store/repos.ts", symbols: 9 },
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
      [{ filePath: "src/cli/main.ts", symbols: 1 }],
    );
    expect(graph.dependencies).toEqual([]);
    expect(graph.tierTotals).toEqual({
      COMPILER: 0,
      LEXICAL: 0,
      HEURISTIC: 0,
    });
  });

  it("derives a sorted, deduplicated cross-module surface", () => {
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
      [{ filePath: "src/store/repos.ts", symbols: 9 }],
    );

    expect(graph.modules.find(({ path }) => path === "src/store")).toEqual({
      path: "src/store",
      files: 1,
      symbols: 9,
      surface: ["countUnresolved", "tierCounts"],
    });
  });

  it("is order-independent for both edge and file rows", () => {
    const rows = [
      edge("src/a/one.ts", "src/b/two.ts", "beta", "LEXICAL"),
      edge("src/b/two.ts", "src/c/three.ts", "gamma", "HEURISTIC"),
      edge("src/a/one.ts", "src/c/three.ts", "alpha", "COMPILER"),
    ];
    const counts = [
      { filePath: "src/a/one.ts", symbols: 1 },
      { filePath: "src/b/two.ts", symbols: 2 },
      { filePath: "src/c/three.ts", symbols: 3 },
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
