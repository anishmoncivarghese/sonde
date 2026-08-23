import { describe, expect, it } from "vitest";

import {
  buildSymbolDocument,
  cosineSimilarity,
  fuseRankings,
  packVector,
  unpackVector,
} from "../../src/enrich/vectors.js";

describe("packVector / unpackVector", () => {
  it("round-trips a vector through the blob encoding", () => {
    const vector = [0.5, -0.25, 0.125];
    const restored = unpackVector(packVector(vector));
    expect(Array.from(restored)).toEqual(vector);
  });

  it("stores four bytes per dimension", () => {
    expect(packVector([1, 2, 3, 4]).byteLength).toBe(16);
  });
});

describe("cosineSimilarity", () => {
  it("scores identical direction as 1", () => {
    expect(cosineSimilarity(new Float32Array([1, 0]), new Float32Array([2, 0])))
      .toBeCloseTo(1);
  });

  it("scores orthogonal vectors as 0", () => {
    expect(cosineSimilarity(new Float32Array([1, 0]), new Float32Array([0, 1])))
      .toBeCloseTo(0);
  });

  it("returns 0 for a zero vector rather than NaN", () => {
    expect(cosineSimilarity(new Float32Array([0, 0]), new Float32Array([1, 1])))
      .toBe(0);
  });

  it("refuses to compare mismatched dimensions", () => {
    expect(() =>
      cosineSimilarity(new Float32Array([1, 0]), new Float32Array([1, 0, 0])),
    ).toThrow(/dimension/i);
  });
});

describe("buildSymbolDocument", () => {
  it("includes the identifier split into words so naming carries meaning", () => {
    // The failing benchmark task asks "which routing strategy is used at
    // runtime" and the answer is SmartRouter — no shared vocabulary unless the
    // identifier itself is split.
    const doc = buildSymbolDocument({
      qualifiedName: "SmartRouter",
      kind: "class",
      signature: "class SmartRouter<T> implements Router<T>",
      documentation: null,
      path: "src/router/smart-router/router.ts",
    });
    expect(doc).toMatch(/smart router/i);
  });

  it("includes the path words, which often carry the domain term", () => {
    const doc = buildSymbolDocument({
      qualifiedName: "handle",
      kind: "method",
      signature: "handle(): void",
      documentation: null,
      path: "src/middleware/basic-auth/index.ts",
    });
    expect(doc).toMatch(/basic auth/i);
  });

  it("includes documentation when present", () => {
    const doc = buildSymbolDocument({
      qualifiedName: "compose",
      kind: "function",
      signature: "compose(middleware)",
      documentation: "Compose middleware functions into a single handler.",
      path: "src/compose.ts",
    });
    expect(doc).toContain("Compose middleware functions");
  });
});

describe("fuseRankings", () => {
  it("ranks a result found by both retrievers above either alone", () => {
    // Spec §14.4: fuse scores, never let an embedding score override source
    // evidence. Reciprocal rank fusion is order-based, so a strong semantic
    // score cannot swamp an exact lexical match.
    const fused = fuseRankings([["a", "b"], ["b", "c"]]);
    expect(fused[0]).toBe("b");
  });

  it("keeps results unique", () => {
    const fused = fuseRankings([["a", "b"], ["a", "b"]]);
    expect(fused).toEqual(["a", "b"]);
  });

  it("preserves a single ranking unchanged", () => {
    expect(fuseRankings([["x", "y", "z"]])).toEqual(["x", "y", "z"]);
  });

  it("returns empty for no rankings", () => {
    expect(fuseRankings([])).toEqual([]);
  });
});
