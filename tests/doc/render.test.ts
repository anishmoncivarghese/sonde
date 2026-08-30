import { describe, expect, it } from "vitest";
import { buildModuleGraph, type ModuleGraph } from "../../src/doc/modules.js";
import {
  DOC_MARKER,
  renderDoc,
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
      { filePath: "src/cli/main.ts", symbols: 4 },
      { filePath: "src/pack/pack.ts", symbols: 2 },
      { filePath: "src/query/run.ts", symbols: 3 },
      { filePath: "src/store/repos.ts", symbols: 9 },
    ],
  );
}

const clean: DocStamp = {
  revision: "a063ac6",
  dirty: false,
  driftedFiles: 0,
  parseFailures: 0,
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

  it("draws heuristic-only dependencies dashed and resolved ones solid", () => {
    const lines = renderDoc(graph(), clean).split("\n");
    const solid = lines.find(
      (line) => line.includes("src/cli") && line.includes("src/store"),
    );
    const inferred = lines.find(
      (line) => line.includes("src/pack") && line.includes("src/query"),
    );
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
