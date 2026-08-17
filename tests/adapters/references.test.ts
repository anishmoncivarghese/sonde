import { beforeAll, describe, expect, it } from "vitest";
import type { Parser, Tree } from "web-tree-sitter";
import { getTsParser } from "../../src/adapters/typescript/parser.js";
import { extractReferences } from "../../src/adapters/typescript/references.js";
import { extractSymbols } from "../../src/adapters/typescript/symbols.js";

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
  const tree = parse(source);
  return extractReferences(
    path,
    source,
    tree,
    extractSymbols(path, source, tree),
  );
}

describe("extractReferences", () => {
  it("records a bare call with a null receiver", () => {
    const call = run("function a() { helper(); }").find(
      (reference) => reference.name === "helper",
    );
    expect(call).toMatchObject({
      kind: "CALLS",
      receiver: null,
      fromSymbolKey: "ts:src/a.ts#a",
    });
  });

  it("records a member call with its receiver", () => {
    const call = run("function a() { svc.refresh(); }").find(
      (reference) => reference.name === "refresh",
    );
    expect(call?.receiver).toBe("svc");
  });

  it("attributes anonymous-callback references to the nearest named symbol", () => {
    const reference = run(
      "function outer() { [1].map(x => helper(x)); }",
    ).find((candidate) => candidate.name === "helper");
    expect(reference?.fromSymbolKey).toBe("ts:src/a.ts#outer");
  });

  it("records a callback passed by reference as REFERENCES, not CALLS", () => {
    const reference = run("function a() { [1].map(handler); }").find(
      (candidate) => candidate.name === "handler",
    );
    expect(reference?.kind).toBe("REFERENCES");
  });

  it("records class inheritance and interface implementation", () => {
    const references = run(
      "class A extends B<T> implements C, Generic<T>, ns.Nested {}",
    );
    expect(references.find(({ name }) => name === "B")?.kind).toBe("INHERITS");
    expect(references.find(({ name }) => name === "C")?.kind).toBe(
      "IMPLEMENTS",
    );
    expect(references.find(({ name }) => name === "Generic")).toMatchObject({
      kind: "IMPLEMENTS",
      receiver: null,
    });
    expect(references.find(({ name }) => name === "Nested")).toMatchObject({
      kind: "IMPLEMENTS",
      receiver: "ns",
    });
  });

  it("records constructor invocations as calls", () => {
    const call = run("function make() { return new Service(); }").find(
      ({ name }) => name === "Service",
    );
    expect(call).toMatchObject({ kind: "CALLS", receiver: null });
  });

  it("does not fabricate a source for top-level calls", () => {
    expect(run("boot();")).toEqual([]);
  });
});
