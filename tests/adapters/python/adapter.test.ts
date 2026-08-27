import { beforeAll, describe, expect, it } from "vitest";
import { pythonAdapter } from "../../../src/adapters/python/index.js";
import { getPythonParser } from "../../../src/adapters/python/parser.js";

const extract = (path: string, src: string) =>
  pythonAdapter.extract(path, new TextEncoder().encode(src));

beforeAll(async () => {
  await getPythonParser();
});

describe("pythonAdapter", () => {
  it("matches .py and .pyi but not other files", () => {
    expect(pythonAdapter.matches("a/b.py")).toBe(true);
    expect(pythonAdapter.matches("a/b.pyi")).toBe(true);
    expect(pythonAdapter.matches("a/b.ts")).toBe(false);
  });

  it("always emits a file symbol so module-level refs have an owner", () => {
    const result = extract("a.py", "x = 1\n");
    expect(result.symbols[0]?.stableKey).toBe("py:a.py#");
    expect(result.symbols[0]?.kind).toBe("file");
  });

  it("reports parse errors as a warning rather than failing silently", () => {
    const result = extract("a.py", "def (:\n");
    expect(
      result.diagnostics.some((diagnostic) => diagnostic.severity === "warning"),
    ).toBe(true);
  });

  it("produces symbols, references, imports and exports together", () => {
    const result = extract(
      "a.py",
      "from .m import Bar\n\ndef f() -> Bar:\n    helper()\n",
    );
    expect(result.symbols.some((symbol) => symbol.shortName === "f")).toBe(true);
    expect(
      result.references.some((reference) => reference.name === "helper"),
    ).toBe(true);
    expect(result.imports.some((binding) => binding.localName === "Bar")).toBe(
      true,
    );
    expect(result.exports.some((entry) => entry.exportedName === "f")).toBe(
      true,
    );
  });
});
