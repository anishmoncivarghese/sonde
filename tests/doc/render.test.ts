import { describe, expect, it } from "vitest";
import { buildModuleGraph, type ModuleGraph } from "../../src/doc/modules.js";
import {
  DOC_MARKER,
  structuralBody,
  renderDoc,
  renderModuleDetail,
  type DocStamp,
} from "../../src/doc/render.js";

function graph(): ModuleGraph {
  return buildModuleGraph(
    [
      {
        srcFile: "src/cli/main.ts",
        dstFile: "src/store/repos.ts",
        dstName: "tierCounts",
        kind: "CALLS",
        tier: "COMPILER",
      },
      {
        srcFile: "src/pack/pack.ts",
        dstFile: "src/query/run.ts",
        dstName: "runQuery",
        kind: "CALLS",
        tier: "HEURISTIC",
      },
    ],
    [
      { filePath: "src/cli/main.ts", symbols: 4, testSymbols: 0 },
      { filePath: "src/pack/pack.ts", symbols: 2, testSymbols: 0 },
      { filePath: "src/query/run.ts", symbols: 3, testSymbols: 0 },
      { filePath: "src/store/repos.ts", symbols: 9, testSymbols: 0 },
    ],
  );
}

const clean: DocStamp = {
  revision: "a063ac6",
  dirty: false,
  driftedFiles: 0,
  parseFailures: 0,
  missingTsConfig: false,
};

describe("renderDoc", () => {
  it("is byte-identical across repeated renders", () => {
    expect(renderDoc(graph(), clean)).toBe(renderDoc(graph(), clean));
  });

  it("contains no wall-clock timestamp or absolute path", () => {
    const out = renderDoc(graph(), clean);
    expect(out).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/);
    expect(out).not.toContain("/Users/");
  });

  it("stamps clean, dirty, and unknown git states honestly", () => {
    expect(renderDoc(graph(), clean)).toContain("Describes commit a063ac6");
    expect(renderDoc(graph(), { ...clean, dirty: true })).toContain(
      "plus uncommitted changes",
    );
    expect(renderDoc(graph(), { ...clean, dirty: null })).toContain(
      "git state unknown",
    );

    const unversioned = renderDoc(graph(), {
      ...clean,
      revision: null,
      dirty: null,
    });
    expect(unversioned).toContain("unversioned working tree");
    expect(unversioned).not.toContain("Describes commit null");
  });

  it("carries the generated-file marker", () => {
    expect(renderDoc(graph(), clean)).toContain(DOC_MARKER);
  });

  it("discloses exact tier composition", () => {
    expect(renderDoc(graph(), clean)).toContain(
      "COMPILER 1, LEXICAL 0, HEURISTIC 1",
    );
  });

  it("does not draw a pair with no resolved reference at all", () => {
    // A shared name is a coincidence, not a dependency. Sonde's swift and
    // typescript adapters share filenames and therefore function names, which
    // manufactured 62 heuristic "references" between modules that never import
    // each other -- once the second-heaviest arrow in this document.
    const heuristicOnly = buildModuleGraph(
      Array.from({ length: 30 }, (_, i) => ({
        srcFile: "src/pack/a.ts", dstFile: "src/query/b.ts",
        dstName: `n${i}`, kind: "CALLS", tier: "HEURISTIC",
      })),
      [],
    );
    const out = renderDoc(heuristicOnly, clean);
    // Match mermaid edges specifically: DOC_MARKER is an HTML comment ending
    // in "-->", so a naive arrow filter matches the marker itself.
    const drawn = out.split("\n").filter((line) => /\]\s*-\.?->/.test(line));
    expect(drawn).toHaveLength(0);
    expect(out).toMatch(/share symbol names/);
  });

  it("draws a thinly-resolved dependency dashed and a well-resolved one solid", () => {
    const mixed = buildModuleGraph(
      [
        ...Array.from({ length: 20 }, (_, i) => ({
          srcFile: "src/pack/a.ts", dstFile: "src/query/b.ts",
          dstName: `n${i}`, kind: "CALLS", tier: "HEURISTIC",
        })),
        {
          srcFile: "src/pack/a.ts", dstFile: "src/query/b.ts",
          dstName: "thin", kind: "CALLS", tier: "LEXICAL",
        },
        ...Array.from({ length: 5 }, (_, i) => ({
          srcFile: "src/cli/a.ts", dstFile: "src/store/b.ts",
          dstName: `m${i}`, kind: "CALLS", tier: "COMPILER",
        })),
      ],
      [],
    );
    const lines = renderDoc(mixed, clean).split("\n");
    const solid = lines.find((l) => l.includes("src/cli") && l.includes("src/store"));
    const inferred = lines.find((l) => l.includes("src/pack") && l.includes("src/query"));
    expect(solid).toContain("-->");
    expect(inferred).toContain("-.->");
  });

  it("assigns distinct Mermaid IDs to paths that sanitize identically", () => {
    const collisionGraph = buildModuleGraph(
      [
        {
          srcFile: "src/a-b/one.ts",
          dstFile: "src/a_b/two.ts",
          dstName: "two",
          kind: "CALLS",
          tier: "LEXICAL",
        },
      ],
      [],
    );
    const diagramLine = renderDoc(collisionGraph, clean)
      .split("\n")
      .find((line) => line.includes("src/a-b") && line.includes("src/a_b"));
    const ids = [...(diagramLine ?? "").matchAll(/\b(m\d+)\[/g)].map(
      (match) => match[1],
    );
    expect(new Set(ids).size).toBe(2);
  });

  it("reports drift and parse-failure counts without inventing either", () => {
    const out = renderDoc(graph(), {
      ...clean,
      driftedFiles: 3,
      parseFailures: 2,
    });
    expect(out).toContain("3 file(s) differ from the index");
    expect(out).toContain("2 file(s) did not parse cleanly");
    expect(out).toContain("sonde index");
  });
});

describe("the diagram is a summary, not the whole graph", () => {
  const denseGraph = (): ModuleGraph => {
    const edges = [];
    for (let index = 0; index < 60; index += 1) {
      edges.push({
        srcFile: `src/m${index}/a.ts`,
        dstFile: "src/target/b.ts",
        dstName: "fn",
        kind: "CALLS",
        tier: "LEXICAL",
      });
    }
    return buildModuleGraph(edges, []);
  };

  it("draws at most 25 arrows and says how many it omitted", () => {
    const out = renderDoc(denseGraph(), {
      revision: "abc1234",
      dirty: false,
      driftedFiles: 0,
      parseFailures: 0,
      missingTsConfig: false,
    });
    const arrows = out
      .split("\n")
      .filter((line) => /^  m\d+\[/.test(line));

    expect(arrows.length).toBeLessThanOrEqual(25);
    expect(out).toMatch(/omitted|not shown/i);
  });

  it("keeps every dependency in the table when the diagram omits some", () => {
    const out = renderDoc(denseGraph(), {
      revision: "abc1234",
      dirty: false,
      driftedFiles: 0,
      parseFailures: 0,
      missingTsConfig: false,
    });

    for (let index = 0; index < 60; index += 1) {
      expect(out).toContain(`src/m${index}`);
    }
  });

  it("says when test modules were excluded", () => {
    const graphWithExcludedTests = {
      ...buildModuleGraph([], []),
      excludedTestModules: 29,
    };
    const out = renderDoc(graphWithExcludedTests, {
      revision: "abc1234",
      dirty: false,
      driftedFiles: 0,
      parseFailures: 0,
      missingTsConfig: false,
    });

    expect(out).toContain("29");
    expect(out).toContain("--include-tests");
  });
});

describe("missing tsconfig disclosure", () => {
  it("says so when a TypeScript repository has no tsconfig.json", () => {
    // Without one, module resolution has nothing to resolve against and the
    // document shows modules with no dependencies between them. That is an
    // honest answer -- it found no resolved references -- but a reader would
    // reasonably think Sonde had failed, so it is disclosed (invariant 8).
    const out = renderDoc(graph(), { ...clean, missingTsConfig: true });
    expect(out).toMatch(/tsconfig\.json/);
  });

  it("stays silent when a tsconfig is present", () => {
    expect(renderDoc(graph(), clean)).not.toMatch(/tsconfig\.json/);
  });
});

describe("structuralBody", () => {
  it("ignores the stamp, so committing the document does not make it stale", () => {
    // The stamp names the commit the document describes, so committing the
    // document itself moves HEAD and changes the stamp. Comparing raw content
    // would leave `--check` permanently failing on a file nobody touched.
    const doc = renderDoc(graph(), clean);
    const moved = renderDoc(graph(), { ...clean, revision: "9999999" });
    expect(doc).not.toBe(moved);
    expect(structuralBody(doc)).toBe(structuralBody(moved));
  });

  it("ignores the drift warning, which reflects the index rather than the code", () => {
    const doc = renderDoc(graph(), clean);
    const drifted = renderDoc(graph(), { ...clean, driftedFiles: 7 });
    expect(structuralBody(doc)).toBe(structuralBody(drifted));
  });

  it("still sees a real structural change", () => {
    const other = buildModuleGraph(
      [{
        srcFile: "src/new/a.ts", dstFile: "src/store/b.ts",
        dstName: "Store", dstKind: "class", kind: "CALLS", tier: "COMPILER",
      }],
      [],
    );
    expect(structuralBody(renderDoc(graph(), clean)))
      .not.toBe(structuralBody(renderDoc(other, clean)));
  });
});

describe("renderModuleDetail duplicate collapsing", () => {
  const sym = (qualifiedName: string, shortName: string, kind = "property") => ({
    filePath: "src/doc/index.ts",
    qualifiedName,
    shortName,
    kind,
  });

  it("collapses rows that would render identically, and says how many", () => {
    // A discriminated union declares the same property once per variant, so
    // four real symbols share a qualified name, kind and file. Four identical
    // rows read as a bug; dropping three silently hides real structure.
    const out = renderModuleDetail(
      "src/doc",
      [
        sym("WriteOutcome.action", "action"),
        sym("WriteOutcome.action", "action"),
        sym("WriteOutcome.action", "action"),
        sym("WriteOutcome.action", "action"),
      ],
      [],
    );
    const rows = out.split("\n").filter((l) => l.includes("WriteOutcome.action"));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatch(/4/);
  });

  it("does not annotate a symbol declared once", () => {
    const out = renderModuleDetail("src/doc", [sym("DOC_PATH", "DOC_PATH", "variable")], []);
    const row = out.split("\n").find((l) => l.includes("DOC_PATH"));
    expect(row).not.toMatch(/×|declarations/);
  });

  it("keeps distinct symbols separate even when they share a short name", () => {
    // Two different qualified names are two different symbols.
    const out = renderModuleDetail(
      "src/doc",
      [sym("A.action", "action"), sym("B.action", "action")],
      [],
    );
    expect(out).toContain("A.action");
    expect(out).toContain("B.action");
  });
});

describe("renderModuleDetail honours the test filter", () => {
  const symbol = {
    filePath: "src/doc/render.ts",
    qualifiedName: "renderDoc",
    shortName: "renderDoc",
    kind: "function",
  };
  const edges = [
    { srcFile: "src/cli/main.ts", dstFile: "src/doc/render.ts", dstName: "renderDoc", kind: "CALLS", tier: "LEXICAL" },
    { srcFile: "tests/doc/render.test.ts", dstFile: "src/doc/render.ts", dstName: "renderDoc", kind: "CALLS", tier: "LEXICAL" },
  ];

  it("hides test modules by default and says so", () => {
    // --include-tests must mean the same thing here as it does for the
    // committed document; a flag that filters one view and not the other is
    // surprising. The disclosure prevents "where did my tests go".
    const out = renderModuleDetail("src/doc", [symbol], edges, {
      testModules: new Set(["tests/doc"]),
    });
    expect(out).toContain("src/cli");
    expect(out).not.toContain("tests/doc`");
    expect(out).toMatch(/--include-tests/);
  });

  it("shows test modules when asked, without the notice", () => {
    const out = renderModuleDetail("src/doc", [symbol], edges, {
      testModules: new Set(["tests/doc"]),
      includeTests: true,
    });
    expect(out).toContain("tests/doc");
    expect(out).not.toMatch(/--include-tests/);
  });
});
