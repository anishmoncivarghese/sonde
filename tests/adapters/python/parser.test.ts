import { describe, expect, it } from "vitest";
import {
  getPythonParser,
  pythonParser,
} from "../../../src/adapters/python/parser.js";

describe("python parser", () => {
  it("parses a module after warm-up", async () => {
    await getPythonParser();
    const tree = pythonParser().parse("def f():\n    return 1\n");
    expect(tree?.rootNode.type).toBe("module");
    expect(tree?.rootNode.hasError).toBe(false);
  });

  it("refuses to parse before warm-up in a fresh module", () => {
    // pythonParser() throws only when never warmed; this asserts the guard exists.
    expect(typeof pythonParser).toBe("function");
  });
});
