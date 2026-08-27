import { beforeAll, describe, expect, it } from "vitest";
import { getPythonParser } from "../../src/adapters/python/parser.js";
import { pythonSymbolAt } from "../../src/resolve/pythonSymbolAt.js";

const SRC = [
  "def top():", // 1
  "    return 1", // 2
  "", // 3
  "class Runner:", // 4
  "    def run(self):", // 5
  "        return 2", // 6
].join("\n");

beforeAll(async () => {
  await getPythonParser();
});

describe("pythonSymbolAt", () => {
  it("returns the module-level function declared on the target line", () => {
    expect(pythonSymbolAt("a.py", SRC, 1)).toBe("py:a.py#top");
  });

  it("returns the method declared on the target line", () => {
    expect(pythonSymbolAt("a.py", SRC, 5)).toBe("py:a.py#Runner.run");
  });

  it("returns the class declared on the target line", () => {
    expect(pythonSymbolAt("a.py", SRC, 4)).toBe("py:a.py#Runner");
  });

  it("does not attribute a function-body target to its enclosing symbol", () => {
    expect(pythonSymbolAt("a.py", SRC, 6)).toBeNull();
  });

  it("does not fabricate a file-symbol target on a non-declaration line", () => {
    expect(pythonSymbolAt("a.py", SRC, 3)).toBeNull();
  });
});
