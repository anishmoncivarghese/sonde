import { describe, expect, it } from "vitest";
import type { ReferenceRecord } from "../../src/adapters/types.js";
import type { Binding } from "../../src/link/imports.js";
import { assignTier, AMBIGUITY_CAP, type Candidate } from "../../src/resolve/tiers.js";

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
    expect(assignTier(ref(), [], { external: "react", name: "foo" }).tier).toBe("EXTERNAL");
  });

  it("assigns UNRESOLVED when there are no candidates and no binding", () => {
    expect(assignTier(ref(), [], null).tier).toBe("UNRESOLVED");
  });

  it("assigns EXTERNAL to a known zero-candidate Swift SDK reference", () => {
    expect(assignTier(ref({
      fromSymbolKey: "swift:App.swift#caller",
      name: "View",
      scopeHint: {
        module: null,
        file: "App.swift",
        visibility: null,
        receiver: null,
        receiverType: null,
      },
    }), [], null).tier).toBe("EXTERNAL");
  });

  it("does not classify TypeScript references from the Swift SDK table", () => {
    expect(assignTier(ref({ name: "View" }), [], null).tier).toBe("UNRESOLVED");
  });

  it("prefers a local Swift declaration over the SDK table", () => {
    const swiftView = ref({
      name: "View",
      scopeHint: {
        module: null,
        file: "View.swift",
        visibility: null,
        receiver: null,
        receiverType: null,
      },
    });
    expect(assignTier(swiftView, candidates(1), null).tier).toBe("LEXICAL");
  });

  it("keeps an unverified internal import unresolved despite global candidates", () => {
    const binding = { unresolved: "unexported_import" } as Binding;
    expect(assignTier(ref(), candidates(1), binding).tier).toBe("UNRESOLVED");
  });
});

describe("ambiguity cap (spec §4.3)", () => {
  const memberRef = { ...ref(), receiver: "svc" };
  const candidates = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ stableKey: `ts:b.ts#foo${i}` }));

  it("still resolves a member call with few candidates", () => {
    expect(assignTier(memberRef, candidates(AMBIGUITY_CAP), null).tier)
      .toBe("HEURISTIC");
  });

  it("refuses to guess once candidates exceed the cap", () => {
    // On the Hono fixture the symbol `get` drew 1212 inbound heuristic edges —
    // every `.get()` call in the repo linked to every symbol named `get`. An
    // edge with confidence 1/1212 is not evidence, and asserting 1212
    // relationships violates the spirit of invariant 1.
    const result = assignTier(memberRef, candidates(AMBIGUITY_CAP + 1), null);
    expect(result.tier).toBe("UNRESOLVED");
    expect(result.confidence).toBe(0);
  });

  it("does not cap a bare identifier bound through an import", () => {
    // Lexical resolution is real evidence regardless of how many symbols
    // elsewhere happen to share the name.
    const bare = { ...ref(), receiver: null };
    expect(assignTier(bare, candidates(500), { file: "b.ts", name: "foo" }).tier)
      .toBe("LEXICAL");
  });

  it("does not cap EXTERNAL targets", () => {
    expect(assignTier(memberRef, candidates(500), { external: "react", name: "foo" }).tier)
      .toBe("EXTERNAL");
  });
});

describe("the ambiguity cap is about evidence, not syntax", () => {
  const candidates = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ stableKey: `ts:b.ts#foo${i}` }));

  it("caps a bare identifier with no binding too", () => {
    // Type-position references carry no receiver. Capping only member access
    // left them uncapped, and they grew to 304,545 heuristic edges on Hono.
    const bare = { ...ref(), receiver: null };
    expect(assignTier(bare, candidates(AMBIGUITY_CAP + 1), null).tier)
      .toBe("UNRESOLVED");
  });

  it("still resolves a bare identifier at the cap", () => {
    const bare = { ...ref(), receiver: null };
    expect(assignTier(bare, candidates(AMBIGUITY_CAP), null).tier)
      .toBe("HEURISTIC");
  });
});
