import { beforeAll, describe, expect, it } from "vitest";
import { getSwiftParser, swiftParser } from "../../../src/adapters/swift/parser.js";

beforeAll(async () => { await getSwiftParser(); });

describe("swift parser", () => {
  it("parses a class with a method", () => {
    const tree = swiftParser().parse("class A { func f() -> Int { return 1 } }");
    expect(tree?.rootNode.hasError).toBe(false);
  });

  it("parses Swift 5.9 macros, which the previously vendored grammar could not", () => {
    // tree-sitter-wasms 0.1.12 failed on #Preview/#Predicate/#expect and drove a
    // 39.1% file error rate on a real application.
    const tree = swiftParser().parse("#Preview { Text(\"hi\") }");
    expect(tree?.rootNode.hasError).toBe(false);
  });

  it("loads without V8 WASM compiler flags", () => {
    // The old grammar could only be loaded under --liftoff-only.
    expect(swiftParser()).toBeDefined();
  });

  it("recovers declarations either side of a known-bad expression", () => {
    // `as? T ?? default` is an upstream 0.7.3 bug. Error recovery is local, so
    // the surrounding declarations must survive.
    const source = [
      "func healthy() -> Int { return 1 }",
      "func damaged() { let x = d.get() as? Bool ?? true }",
      "func alsoHealthy() -> Int { return 2 }",
    ].join("\n");
    const tree = swiftParser().parse(source);
    const names: string[] = [];
    const visit = (n: any): void => {
      if (n.type === "function_declaration") {
        const nm = n.childForFieldName("name");
        if (nm) names.push(nm.text);
      }
      for (let i = 0; i < n.childCount; i += 1) visit(n.child(i));
    };
    visit(tree!.rootNode);
    expect(names).toContain("healthy");
    expect(names).toContain("alsoHealthy");
  });
});
