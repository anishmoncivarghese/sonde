import { beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import type { Parser, Tree } from "web-tree-sitter";
import { getTsParser } from "../../src/adapters/typescript/parser.js";
import {
  extractSymbols,
  stableKey,
} from "../../src/adapters/typescript/symbols.js";

let parser: Parser;

beforeAll(async () => {
  parser = await getTsParser();
});

function parse(source: string): Tree {
  const tree = parser.parse(source);
  if (!tree) throw new Error("Tree-sitter returned no tree");
  return tree;
}

function run(source: string, path = "src/a.ts") {
  return extractSymbols(path, source, parse(source));
}

describe("stableKey", () => {
  it("uses path and named scope rather than line numbers", () => {
    expect(stableKey("src/a.ts", ["Auth", "refresh"])).toBe(
      "ts:src/a.ts#Auth.refresh",
    );
    const compact = run("function foo() {}")[0]?.stableKey;
    const shifted = run("\n\n\nfunction foo() {}")[0]?.stableKey;
    expect(shifted).toBe(compact);
  });
});

describe("extractSymbols", () => {
  it("extracts an exported function with a stable key", () => {
    const symbols = run("export function foo(a: number): void {}");
    expect(symbols).toHaveLength(1);
    expect(symbols[0]).toMatchObject({
      stableKey: "ts:src/a.ts#foo",
      kind: "function",
      exported: true,
    });
  });

  it("mints arrow functions bound to a name as functions", () => {
    const symbols = run("const foo = () => {};");
    expect(symbols.find((symbol) => symbol.shortName === "foo")?.kind).toBe(
      "function",
    );
  });

  it("does not mint anonymous callbacks as symbols", () => {
    const symbols = run("function outer() { [1].map(x => x + 1); }");
    expect(symbols).toHaveLength(1);
    expect(symbols[0]?.shortName).toBe("outer");
  });

  it("scopes methods and properties under their class", () => {
    const symbols = run(
      "export class Auth { token = 'x'; refresh(): void {} }",
    );
    expect(symbols.map((symbol) => symbol.stableKey)).toEqual([
      "ts:src/a.ts#Auth",
      "ts:src/a.ts#Auth.token",
      "ts:src/a.ts#Auth.refresh",
    ]);
    expect(symbols[1]?.kind).toBe("property");
    expect(symbols[2]?.kind).toBe("method");
  });

  it("keys a default-exported anonymous class as #default", () => {
    const symbols = run("export default class {}");
    expect(symbols[0]?.stableKey).toBe("ts:src/a.ts#default");
    expect(symbols[0]?.exported).toBe(true);
  });

  it("strips type parameters from identity but keeps them in signature", () => {
    const symbols = run("export function map<T>(x: T): T { return x; }");
    expect(symbols[0]?.stableKey).toBe("ts:src/a.ts#map");
    expect(symbols[0]?.signature).toContain("<T>");
  });

  it("suffixes every overload with its normalized signature hash", () => {
    const symbols = run(`
      function parse(value: string): string;
      function parse(value: number): number;
      function parse(value: string | number): string | number { return value; }
    `);
    expect(symbols).toHaveLength(3);
    expect(symbols.every((symbol) => /^ts:src\/a\.ts#parse~[0-9a-f]{8}/.test(symbol.stableKey))).toBe(true);
    expect(new Set(symbols.map((symbol) => symbol.stableKey)).size).toBe(3);
  });

  it("uses a deterministic source-order suffix for residual collisions", () => {
    const symbols = run(`
      function duplicate(value: string): void;
      function duplicate(value: string): void;
    `);
    expect(symbols).toHaveLength(2);
    expect(symbols[1]?.stableKey).toBe(`${symbols[0]?.stableKey}~2`);
  });

  it("keeps same-name symbols distinct when their named scopes differ", () => {
    const symbols = run(`
      function helper(a: number): void {}
      export class K { m() { function helper(b: string): void {} } }
    `);
    const keys = symbols
      .filter((symbol) => symbol.shortName === "helper")
      .map((symbol) => symbol.stableKey);
    expect(keys).toEqual([
      "ts:src/a.ts#helper",
      "ts:src/a.ts#K.m.helper",
    ]);
  });

  it("marks actual named symbols in test files", () => {
    const symbols = run(
      "export function fixture() { describe('x', () => {}); }",
      "src/a.test.ts",
    );
    expect(symbols.length).toBeGreaterThan(0);
    expect(symbols.every((symbol) => symbol.isTest)).toBe(true);
  });

  it("extracts the golden fixture deterministically", () => {
    const source = readFileSync(
      new URL("../fixtures/ts/symbols-basic.ts", import.meta.url),
      "utf8",
    );
    const symbols = run(source, "tests/fixtures/ts/symbols-basic.ts");
    expect(symbols.map(({ qualifiedName, kind }) => ({ qualifiedName, kind }))).toEqual([
      { qualifiedName: "Identified", kind: "interface" },
      { qualifiedName: "Identified.id", kind: "property" },
      { qualifiedName: "AuthService", kind: "class" },
      { qualifiedName: "AuthService.id", kind: "property" },
      { qualifiedName: "AuthService.refresh", kind: "method" },
      { qualifiedName: "createAuth", kind: "function" },
    ]);
  });
});
