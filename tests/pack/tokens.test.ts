import { describe, expect, it } from "vitest";
import {
  estimateJsonTokens,
  estimateTokens,
  packToBudget,
} from "../../src/pack/tokens.js";

describe("estimateTokens", () => {
  it("returns a positive estimated count for non-empty text", () => {
    expect(estimateTokens("function refreshSession() {}"))
      .toBeGreaterThan(0);
  });

  it("returns zero for empty text", () => {
    expect(estimateTokens("")).toBe(0);
  });
});

describe("estimateJsonTokens", () => {
  it("matches the indent:2 wire format every MCP/CLI surface actually sends", () => {
    const value = { stableKey: "ts:src/a.ts#run", path: "src/a.ts" };
    expect(estimateJsonTokens(value)).toBe(
      estimateTokens(JSON.stringify(value, null, 2)),
    );
  });

  it("is not understated by a compact-JSON estimate for a representative payload", () => {
    const rows = Array.from({ length: 20 }, (_, index) => ({
      stableKey: `ts:src/a.ts#fn${index}`,
      path: "src/a.ts",
      qualifiedName: `fn${index}`,
      kind: "function",
      depth: 1,
      viaKind: "CALLS",
    }));

    expect(estimateJsonTokens(rows))
      .toBeGreaterThan(estimateTokens(JSON.stringify(rows)));
  });
});

describe("packToBudget", () => {
  it("packs every section in priority order when the budget is generous", () => {
    const result = packToBudget(
      [
        { id: "later", priority: 2, text: "later" },
        { id: "reserved", priority: 0, text: "reserved" },
        { id: "middle", priority: 1, text: "middle" },
      ],
      1000,
    );

    expect(result.included).toEqual(["reserved", "middle", "later"]);
    expect(result.text).toBe("reserved\n\nmiddle\n\nlater");
    expect(result.truncated).toBe(false);
  });

  it("always includes reserved sections and drops lower priorities first", () => {
    const result = packToBudget(
      [
        { id: "large", priority: 1, text: "word ".repeat(500) },
        { id: "reserved", priority: 0, text: "required provenance" },
      ],
      0,
    );

    expect(result.included).toEqual(["reserved"]);
    expect(result.truncated).toBe(true);
  });

  it("reports the token count of the rendered text including separators", () => {
    const result = packToBudget(
      [
        { id: "a", priority: 0, text: "alpha" },
        { id: "b", priority: 0, text: "beta" },
      ],
      0,
    );

    expect(result.estimatedTokens).toBe(estimateTokens(result.text));
  });

  it("can skip an oversized section and still pack a later peer", () => {
    const small = "small";
    const result = packToBudget(
      [
        { id: "large", priority: 1, text: "word ".repeat(500) },
        { id: "small", priority: 1, text: small },
      ],
      estimateTokens(small),
    );

    expect(result.included).toEqual(["small"]);
    expect(result.truncated).toBe(true);
  });
});
