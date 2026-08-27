import { describe, expect, it } from "vitest";
import type { ReferenceRecord } from "../../src/adapters/types.js";
import { assignTier } from "../../src/resolve/tiers.js";

const ref = (fromSymbolKey: string, name: string): ReferenceRecord => ({
  fromSymbolKey,
  name,
  receiver: "self",
  scopeHint: {
    module: null,
    file: "a",
    visibility: null,
    receiver: null,
    receiverType: null,
  },
  kind: "CALLS",
  siteLine: 1,
});

describe("Swift SDK fallback scoping", () => {
  it("still classifies a Swift SDK name as EXTERNAL for Swift references", () => {
    expect(assignTier(ref("swift:A.swift#f", "append"), [], null).tier).toBe(
      "EXTERNAL",
    );
  });

  it("does not attribute a Python name to the Swift SDK", () => {
    // `append`, `Task`, `String`, `Int` are all in SWIFT_SDK_SYMBOLS and all
    // common Python names. Misclassifying them as EXTERNAL would remove them
    // from the gate denominator and bias the measurement toward PASS.
    expect(assignTier(ref("py:a.py#f", "append"), [], null).tier).toBe(
      "UNRESOLVED",
    );
  });

  it("does not attribute a TypeScript name to the Swift SDK", () => {
    expect(assignTier(ref("ts:a.ts#f", "filter"), [], null).tier).toBe(
      "UNRESOLVED",
    );
  });
});
