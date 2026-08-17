import { beforeAll, describe, expect, it } from "vitest";
import type { Parser, Tree } from "web-tree-sitter";
import { extractModuleTables } from "../../src/adapters/typescript/modules.js";
import { getTsParser } from "../../src/adapters/typescript/parser.js";

let parser: Parser;

beforeAll(async () => {
  parser = await getTsParser();
});

function parse(source: string): Tree {
  const tree = parser.parse(source);
  if (!tree) throw new Error("Tree-sitter returned no tree");
  return tree;
}

function run(source: string) {
  return extractModuleTables(source, parse(source));
}

describe("extractModuleTables", () => {
  it("records named and aliased imports", () => {
    const { imports } = run('import { foo, source as local } from "./a";');
    expect(imports).toEqual([
      {
        localName: "foo",
        importedName: "foo",
        specifier: "./a",
        siteLine: 1,
      },
      {
        localName: "local",
        importedName: "source",
        specifier: "./a",
        siteLine: 1,
      },
    ]);
  });

  it("records combined default and namespace imports", () => {
    const { imports } = run('import Thing, * as ns from "./a";');
    expect(imports).toMatchObject([
      { localName: "Thing", importedName: "default", specifier: "./a" },
      { localName: "ns", importedName: "*", specifier: "./a" },
    ]);
  });

  it("records star re-exports for the fixpoint", () => {
    const { exports } = run('export * from "./a";');
    expect(exports[0]).toMatchObject({
      exportedName: "*",
      localName: null,
      isStar: true,
      reExportFrom: "./a",
    });
  });

  it("preserves the source name of aliased re-exports", () => {
    const { exports } = run('export { foo as bar } from "./a";');
    expect(exports[0]).toMatchObject({
      exportedName: "bar",
      localName: "foo",
      reExportFrom: "./a",
      isStar: false,
    });
  });

  it("records local named export aliases", () => {
    const { exports } = run("const foo = 1; export { foo as bar };");
    expect(exports[0]).toMatchObject({
      exportedName: "bar",
      localName: "foo",
      reExportFrom: null,
    });
  });

  it("records local declarations including multiple variables", () => {
    const { exports } = run("export const one = 1, two = 2;");
    expect(exports.map(({ exportedName }) => exportedName)).toEqual([
      "one",
      "two",
    ]);
  });

  it("records named and anonymous default exports", () => {
    expect(run("export default function foo() {}").exports[0]).toMatchObject({
      exportedName: "default",
      localName: "foo",
    });
    expect(run("export default class {}").exports[0]).toMatchObject({
      exportedName: "default",
      localName: "default",
    });
  });

  it("records namespace re-exports", () => {
    expect(run('export * as ns from "./a";').exports[0]).toMatchObject({
      exportedName: "ns",
      localName: "*",
      reExportFrom: "./a",
      isStar: false,
    });
  });
});
