import { beforeAll, describe, expect, it } from "vitest";
import {
  getPythonParser,
  pythonParser,
} from "../../../src/adapters/python/parser.js";
import { extractPythonSymbols } from "../../../src/adapters/python/symbols.js";

const keys = (source: string, path = "a.py"): string[] => {
  const tree = pythonParser().parse(source)!;
  return extractPythonSymbols(path, source, tree).map((s) => s.stableKey);
};

const symbols = (source: string, path = "a.py") => {
  const tree = pythonParser().parse(source)!;
  return extractPythonSymbols(path, source, tree);
};

beforeAll(async () => {
  await getPythonParser();
});

describe("python stable key uniqueness", () => {
  // Registering the Python adapter made real-world indexing fail outright with
  // `UNIQUE constraint failed: symbol.stable_key`. Because a stable key embeds
  // the relative path, a collision can only ever occur within one file, so the
  // extractor can guarantee global uniqueness locally and purely (invariant 4).

  it("emits one symbol for a module-level name assigned twice", () => {
    // One name in one module scope is one variable, however often it is
    // rebound. Emitting a symbol per assignment was simply wrong.
    const found = keys("x = 1\nx = 2\nx = 3\n");
    expect(found.filter((k) => k === "py:a.py#x")).toHaveLength(1);
  });

  it("collapses an @overload family to the implementation", () => {
    // PEP 484 overloads are type declarations for a single runtime function.
    const source = [
      "from typing import overload",
      "",
      "@overload",
      "def f(a: int) -> int: ...",
      "@overload",
      "def f(a: str) -> str: ...",
      "def f(a):",
      "    return a",
    ].join("\n");
    const found = symbols(source).filter((s) => s.shortName === "f");
    expect(found).toHaveLength(1);
    // The surviving symbol must be the implementation, not a stub, so edges
    // land on code that actually runs.
    expect(found[0]?.startLine).toBe(7);
  });

  it("keeps one symbol when every declaration is an overload stub", () => {
    // A .pyi stub file has no implementation to prefer.
    const source = [
      "from typing import overload",
      "@overload",
      "def f(a: int) -> int: ...",
      "@overload",
      "def f(a: str) -> str: ...",
    ].join("\n");
    expect(symbols(source, "a.pyi").filter((s) => s.shortName === "f"))
      .toHaveLength(1);
  });

  it("gives property accessors distinct role-suffixed keys", () => {
    // These are genuinely different code bodies; a call to the setter must not
    // resolve to the getter.
    const source = [
      "class Square:",
      "    @property",
      "    def area(self) -> float:",
      "        return 1.0",
      "    @area.setter",
      "    def area(self, value: float) -> None:",
      "        pass",
      "    @area.deleter",
      "    def area(self) -> None:",
      "        pass",
    ].join("\n");
    const found = keys(source);
    expect(found).toContain("py:a.py#Square.area");
    expect(found).toContain("py:a.py#Square.area@setter");
    expect(found).toContain("py:a.py#Square.area@deleter");
  });

  it("keeps shortName clean so the role suffix does not leak into search", () => {
    const source = [
      "class Square:",
      "    @property",
      "    def area(self) -> float:",
      "        return 1.0",
      "    @area.setter",
      "    def area(self, value: float) -> None:",
      "        pass",
    ].join("\n");
    const setter = symbols(source).find((s) =>
      s.stableKey === "py:a.py#Square.area@setter"
    );
    expect(setter?.shortName).toBe("area");
  });

  it("disambiguates a genuine redefinition with an ordinal, first key unchanged", () => {
    // Two distinct classes with the same scope chain, as test files routinely
    // contain. An ordinal is not line-based: it survives line moves and body
    // edits (invariant 9).
    const source = [
      "def test_it():",
      "    class Model:",
      "        a = 1",
      "    class Model:",
      "        b = 2",
    ].join("\n");
    const found = keys(source);
    expect(found).toContain("py:a.py#test_it.Model");
    expect(found).toContain("py:a.py#test_it.Model$2");
  });

  it("never emits a duplicate stable key, whatever the file contains", () => {
    const source = [
      "from typing import overload",
      "x = 1",
      "x = 2",
      "@overload",
      "def f(a: int) -> int: ...",
      "def f(a):",
      "    return a",
      "class C:",
      "    @property",
      "    def v(self): return 1",
      "    @v.setter",
      "    def v(self, n): pass",
      "def dup(): pass",
      "def dup(): pass",
    ].join("\n");
    const found = keys(source);
    expect(new Set(found).size).toBe(found.length);
  });
});
