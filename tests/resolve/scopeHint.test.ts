import { describe, expect, it } from "vitest";
import type { ReferenceRecord, SymbolVisibility } from "../../src/adapters/types.js";
import {
  assignTier,
  narrowCandidates,
  type Candidate,
} from "../../src/resolve/tiers.js";

function candidate(
  file: string,
  qualifiedName: string,
  visibility: SymbolVisibility = "internal",
): Candidate {
  return {
    stableKey: `swift:${file}#${qualifiedName}`,
    qualifiedName,
    visibility,
  };
}

function reference(
  overrides: Partial<ReferenceRecord> = {},
): ReferenceRecord {
  return {
    fromSymbolKey: "swift:Sources/App/A.swift#run",
    name: "save",
    receiver: "gateway",
    scopeHint: {
      module: "App",
      file: "Sources/App/A.swift",
      visibility: "internal",
      receiver: "gateway",
      receiverType: null,
    },
    kind: "CALLS",
    siteLine: 1,
    ...overrides,
  };
}

describe("Swift scope-hint narrowing", () => {
  it("returns the original candidates unchanged when no scope hint exists", () => {
    const candidates = Array.from({ length: 9 }, (_, index) => ({
      stableKey: `ts:src/${index}.ts#save`,
    }));
    const ref = reference({ scopeHint: undefined });
    expect(narrowCandidates(ref, candidates)).toBe(candidates);
    expect(assignTier(ref, candidates, null).tier).toBe("UNRESOLVED");
  });

  it("removes private and fileprivate declarations from another file", () => {
    const candidates = [
      candidate("Sources/App/A.swift", "A.save", "private"),
      candidate("Sources/App/B.swift", "B.save", "private"),
      candidate("Sources/App/C.swift", "C.save", "fileprivate"),
      candidate("Sources/App/D.swift", "D.save"),
    ];
    expect(
      narrowCandidates(reference(), candidates).map((item) => item.stableKey),
    )
      .toEqual([
        "swift:Sources/App/A.swift#A.save",
        "swift:Sources/App/D.swift#D.save",
      ]);
  });

  it("removes an unimported candidate from another SwiftPM target", () => {
    const candidates = [
      candidate("Sources/App/A.swift", "AppHelper.save"),
      candidate("Sources/Kit/B.swift", "KitHelper.save"),
    ];
    expect(narrowCandidates(reference({ receiver: null }), candidates))
      .toEqual([candidates[0]]);
  });

  it("keeps a candidate from an explicitly imported SwiftPM target", () => {
    const candidates = [candidate("Sources/Kit/B.swift", "KitHelper.save")];
    expect(
      narrowCandidates(
        reference({ receiver: null }),
        candidates,
        new Set(["Kit"]),
      ),
    ).toEqual(candidates);
  });

  it("uses only an explicit receiver annotation to narrow members", () => {
    const candidates = [
      candidate("Sources/App/A.swift", "Gateway.save"),
      candidate("Sources/App/B.swift", "Other.save"),
    ];
    const ref = reference({
      scopeHint: {
        module: "App",
        file: "Sources/App/A.swift",
        visibility: "internal",
        receiver: "gateway",
        receiverType: "Gateway",
      },
    });
    expect(narrowCandidates(ref, candidates)).toEqual([candidates[0]]);
  });

  it("does not guess a receiver type when no annotation was written", () => {
    const candidates = [
      candidate("Sources/App/A.swift", "Gateway.save"),
      candidate("Sources/App/B.swift", "Other.save"),
    ];
    expect(narrowCandidates(reference(), candidates)).toEqual(candidates);
  });

  it("applies the ambiguity cap after evidence-based narrowing", () => {
    const candidates = Array.from({ length: 10 }, (_, index) =>
      candidate(
        `Sources/App/${index}.swift`,
        `${index < 2 ? "Gateway" : `Other${index}`}.save`,
      ),
    );
    const ref = reference({
      scopeHint: {
        module: "App",
        file: "Sources/App/Caller.swift",
        visibility: "internal",
        receiver: "gateway",
        receiverType: "Gateway",
      },
    });
    const narrowed = narrowCandidates(ref, candidates);
    expect(narrowed).toHaveLength(2);
    expect(assignTier(ref, narrowed, null)).toEqual({
      tier: "HEURISTIC",
      confidence: 0.5,
    });
  });
});
