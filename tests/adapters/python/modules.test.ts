import { beforeAll, describe, expect, it } from "vitest";
import {
  getPythonParser,
  pythonParser,
} from "../../../src/adapters/python/parser.js";
import { extractPythonModuleTables } from "../../../src/adapters/python/modules.js";

const tables = (src: string) =>
  extractPythonModuleTables(pythonParser().parse(src)!);

beforeAll(async () => {
  await getPythonParser();
});

describe("extractPythonModuleTables", () => {
  it("binds a plain import to its top-level module", () => {
    const { imports } = tables("import os\n");
    expect(imports[0]).toMatchObject({
      localName: "os",
      importedName: "*",
      specifier: "os",
    });
  });

  it("binds a dotted import to its top-level name", () => {
    const { imports } = tables("import os.path\n");
    expect(imports[0]).toMatchObject({ localName: "os", specifier: "os.path" });
  });

  it("binds an aliased import to the alias", () => {
    const { imports } = tables("import numpy as np\n");
    expect(imports[0]).toMatchObject({ localName: "np", specifier: "numpy" });
  });

  it("preserves relative import depth in the specifier", () => {
    expect(tables("from .foo import Bar\n").imports[0]).toMatchObject({
      localName: "Bar",
      importedName: "Bar",
      specifier: ".foo",
    });
    expect(tables("from ..pkg.mod import Baz as Q\n").imports[0]).toMatchObject(
      {
        localName: "Q",
        importedName: "Baz",
        specifier: "..pkg.mod",
      },
    );
  });

  it("marks a wildcard import as a star re-export", () => {
    const { imports, exports } = tables("from x import *\n");
    expect(imports[0]).toMatchObject({ importedName: "*", specifier: "x" });
    expect(exports.find((entry) => entry.isStar)).toMatchObject({
      reExportFrom: "x",
    });
  });

  it("exports module-level definitions from their own file", () => {
    const { exports } = tables(
      "def top():\n    pass\n\nclass C:\n    pass\n",
    );
    expect(exports.map((entry) => entry.exportedName).sort()).toEqual([
      "C",
      "top",
    ]);
    expect(exports.every((entry) => entry.reExportFrom === null)).toBe(true);
  });

  it("treats a from-import as a re-export of this module", () => {
    const { exports } = tables("from .foo import Bar\n");
    expect(exports.find((entry) => entry.exportedName === "Bar")).toMatchObject(
      {
        reExportFrom: ".foo",
        localName: "Bar",
        isStar: false,
      },
    );
  });
});
