import { describe, it, expect } from "vitest";
import { getTsParser, parserFor } from "../../src/adapters/typescript/parser.js";

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

describe("TSX grammar routing", () => {
  it("parses a .tsx file without errors", async () => {
    await getTsParser();
    // matches() accepts .tsx, but the TypeScript grammar cannot parse JSX, so
    // every .tsx file failed to parse — 38 of 346 files on the Hono fixture.
    const source = "export const A = () => <div className=\"x\">hi</div>;";
    const tree = parserFor("src/a.tsx").parse(source);
    expect(tree?.rootNode.hasError).toBe(false);
  });

  it("still parses .ts with the TypeScript grammar", async () => {
    await getTsParser();
    const tree = parserFor("src/a.ts").parse("export const a: number = 1;");
    expect(tree?.rootNode.hasError).toBe(false);
  });

  it("routes generics in .ts rather than reading them as JSX", async () => {
    await getTsParser();
    // The two grammars disagree here: TSX reads `<T>` as a JSX element.
    const tree = parserFor("src/a.ts").parse("const f = <T>(x: T): T => x;");
    expect(tree?.rootNode.hasError).toBe(false);
  });
});
