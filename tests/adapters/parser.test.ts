import { describe, it, expect } from "vitest";
import { getTsParser } from "../../src/adapters/typescript/parser.js";

describe("tree-sitter parser", () => {
  it("parses a TypeScript function", async () => {
    const p = await getTsParser();
    const tree = p.parse("export function foo(a: number): number { return a; }");
    expect(tree).not.toBeNull();
    expect(tree!.rootNode.type).toBe("program");
    expect(tree!.rootNode.hasError).toBe(false);
  });

  it("returns a tree with an error flag for broken source rather than throwing", async () => {
    const p = await getTsParser();
    const tree = p.parse("export function foo( {");
    expect(tree).not.toBeNull();
    expect(tree!.rootNode.hasError).toBe(true);
  });
});
