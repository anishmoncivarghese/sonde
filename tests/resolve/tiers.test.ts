import { describe, expect, it } from "vitest";
import type { ReferenceRecord } from "../../src/adapters/types.js";
import type { Binding } from "../../src/link/imports.js";
import { assignTier, type Candidate } from "../../src/resolve/tiers.js";

const ref = (overrides: Partial<ReferenceRecord> = {}): ReferenceRecord => ({
  fromSymbolKey: "ts:a.ts#caller",
  name: "foo",
  receiver: null,
  kind: "CALLS",
  siteLine: 1,
  ...overrides,
});

const candidates = (count: number): Candidate[] =>
  Array.from({ length: count }, (_, index) => ({
    stableKey: `ts:b.ts#foo${index}`,
  }));

describe("assignTier", () => {
  it("assigns LEXICAL to a bare call bound through an import", () => {
    const binding: Binding = { file: "b.ts", name: "foo" };
    expect(assignTier(ref(), candidates(1), binding)).toEqual({
      tier: "LEXICAL",
      confidence: 1,
    });
  });

  it("assigns LEXICAL to a bare call with exactly one repo-wide candidate", () => {
    expect(assignTier(ref(), candidates(1), null).tier).toBe("LEXICAL");
  });

  it("never assigns LEXICAL to a member call, even with one candidate", () => {
    const result = assignTier(ref({ receiver: "svc" }), candidates(1), null);
    expect(result.tier).toBe("HEURISTIC");
    expect(result.confidence).toBe(1);
  });

  it("assigns HEURISTIC with 1/n confidence when ambiguous", () => {
    const result = assignTier(ref(), candidates(4), null);
    expect(result.tier).toBe("HEURISTIC");
    expect(result.confidence).toBeCloseTo(0.25);
  });

  it("assigns EXTERNAL when the binding points outside the repo", () => {
    expect(assignTier(ref(), [], { external: "react" }).tier).toBe("EXTERNAL");
  });

  it("assigns UNRESOLVED when there are no candidates and no binding", () => {
    expect(assignTier(ref(), [], null).tier).toBe("UNRESOLVED");
  });

  it("keeps an unverified internal import unresolved despite global candidates", () => {
    const binding = { unresolved: "unexported_import" } as Binding;
    expect(assignTier(ref(), candidates(1), binding).tier).toBe("UNRESOLVED");
  });
});
