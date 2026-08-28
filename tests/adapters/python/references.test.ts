import { beforeAll, describe, expect, it } from "vitest";
import {
  getPythonParser,
  pythonParser,
} from "../../../src/adapters/python/parser.js";
import { extractPythonReferences } from "../../../src/adapters/python/references.js";
import { extractPythonSymbols } from "../../../src/adapters/python/symbols.js";

const refs = (path: string, src: string) => {
  const tree = pythonParser().parse(src)!;
  return extractPythonReferences(
    path,
    src,
    tree,
    extractPythonSymbols(path, src, tree),
  );
};

beforeAll(async () => {
  await getPythonParser();
});

describe("extractPythonReferences", () => {
  it("records a bare call with no receiver", () => {
    const found = refs("a.py", "def f():\n    helper()\n");
    const ref = found.find((r) => r.name === "helper");
    expect(ref?.receiver).toBeNull();
    expect(ref?.kind).toBe("CALLS");
  });

  it("records the receiver for attribute calls", () => {
    const ref = refs("a.py", "def f():\n    obj.method()\n").find(
      (r) => r.name === "method",
    );
    expect(ref?.receiver).toBe("obj");
  });

  it("records the exact final-identifier column for compiler queries", () => {
    const ref = refs(
      "a.py",
      "def f():\n    self.method_registry.method()\n",
    ).find((reference) => reference.name === "method");
    expect(ref?.siteColumn).toBe(25);
  });

  it("sets receiverType to the enclosing class for self and cls", () => {
    const found = refs(
      "a.py",
      "class Runner:\n    def run(self):\n        self.helper()\n",
    );
    const ref = found.find((r) => r.name === "helper");
    expect(ref?.receiver).toBe("self");
    // spec §5.1: narrows candidates to the class; tier stays HEURISTIC.
    expect(ref?.scopeHint?.receiverType).toBe("Runner");
  });

  it("does not set receiverType for a non-self receiver", () => {
    const ref = refs(
      "a.py",
      "class C:\n    def m(self):\n        other.go()\n",
    ).find((r) => r.name === "go");
    expect(ref?.scopeHint?.receiverType).toBeNull();
  });

  it("records base classes as INHERITS", () => {
    const found = refs("a.py", "class C(Base, Mixin):\n    pass\n");
    expect(
      found
        .filter((r) => r.kind === "INHERITS")
        .map((r) => r.name)
        .sort(),
    ).toEqual(["Base", "Mixin"]);
  });

  it("records annotation types as REFERENCES", () => {
    const found = refs("a.py", "def f() -> Bar:\n    pass\n");
    expect(found.find((r) => r.name === "Bar")?.kind).toBe("REFERENCES");
  });

  it("attributes module-level references to the file symbol", () => {
    const found = refs("a.py", "top_level()\n");
    expect(found.find((r) => r.name === "top_level")?.fromSymbolKey).toBe(
      "py:a.py#",
    );
  });

  it("records a decorator reference", () => {
    const found = refs("a.py", "@app.route\ndef h():\n    pass\n");
    const ref = found.find((r) => r.name === "route");
    expect(ref?.receiver).toBe("app");
  });
});
