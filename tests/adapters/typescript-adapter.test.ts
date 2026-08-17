import { beforeAll, describe, expect, it } from "vitest";
import { typescriptAdapter } from "../../src/adapters/typescript/index.js";
import { getTsParser } from "../../src/adapters/typescript/parser.js";

beforeAll(async () => {
  await getTsParser();
});

describe("typescriptAdapter", () => {
  it("matches TypeScript-family source files but not declarations", () => {
    expect(typescriptAdapter.matches("src/a.ts")).toBe(true);
    expect(typescriptAdapter.matches("src/a.tsx")).toBe(true);
    expect(typescriptAdapter.matches("src/a.d.ts")).toBe(false);
    expect(typescriptAdapter.matches("src/a.d.mts")).toBe(false);
    expect(typescriptAdapter.matches("src/a.d.cts")).toBe(false);
    expect(typescriptAdapter.matches("src/a.js")).toBe(false);
  });

  it("assembles symbols, references, imports, and exports", () => {
    const result = typescriptAdapter.extract(
      "src/a.ts",
      Buffer.from('import { helper } from "./b"; export function run() { helper(); }'),
    );
    expect(result.symbols.map(({ shortName }) => shortName)).toContain("run");
    expect(result.references.map(({ name }) => name)).toContain("helper");
    expect(result.imports[0]).toMatchObject({ localName: "helper" });
    expect(result.exports[0]).toMatchObject({ exportedName: "run" });
    expect(result.diagnostics).toEqual([]);
  });

  it("surfaces parse errors as warnings", () => {
    const result = typescriptAdapter.extract(
      "src/broken.ts",
      Buffer.from("export function broken( {"),
    );
    expect(result.diagnostics).toEqual([
      { severity: "warning", message: "parse errors present", line: 1 },
    ]);
  });
});
