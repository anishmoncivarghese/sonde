import { beforeAll, describe, expect, it } from "vitest";
import {
  getPythonParser,
  pythonParser,
} from "../../../src/adapters/python/parser.js";
import {
  extractPythonSymbols,
} from "../../../src/adapters/python/symbols.js";

const parse = (src: string) => pythonParser().parse(src)!;

beforeAll(async () => {
  await getPythonParser();
});

describe("extractPythonSymbols", () => {
  it("builds line-independent stable keys from the scope chain", () => {
    const src = "class Runner:\n    def run(self):\n        pass\n";
    const symbols = extractPythonSymbols("src/app.py", src, parse(src));
    const keys = symbols.map((s) => s.stableKey);
    expect(keys).toContain("py:src/app.py#Runner");
    expect(keys).toContain("py:src/app.py#Runner.run");
  });

  it("assigns kinds for classes, methods, functions and module variables", () => {
    const src =
      "CONST = 1\n\ndef top():\n    pass\n\nclass C:\n    def m(self):\n        pass\n";
    const symbols = extractPythonSymbols("a.py", src, parse(src));
    const byName = new Map(symbols.map((s) => [s.shortName, s]));
    expect(byName.get("C")?.kind).toBe("class");
    expect(byName.get("m")?.kind).toBe("method");
    expect(byName.get("top")?.kind).toBe("function");
    expect(byName.get("CONST")?.kind).toBe("variable");
  });

  it("marks test files so structural TESTS edges can find them", () => {
    const src = "def test_x():\n    pass\n";
    const symbols = extractPythonSymbols("tests/test_x.py", src, parse(src));
    expect(symbols[0]?.isTest).toBe(true);
  });

  it("treats a leading underscore as module-private, not exported", () => {
    const src = "def _helper():\n    pass\n\ndef public():\n    pass\n";
    const symbols = extractPythonSymbols("a.py", src, parse(src));
    const byName = new Map(symbols.map((s) => [s.shortName, s]));
    expect(byName.get("_helper")?.exported).toBe(false);
    expect(byName.get("public")?.exported).toBe(true);
  });

  it("keeps nested function scope chains distinct", () => {
    const src = "def outer():\n    def inner():\n        pass\n";
    const keys = extractPythonSymbols("a.py", src, parse(src)).map(
      (s) => s.stableKey,
    );
    expect(keys).toContain("py:a.py#outer.inner");
  });

});
