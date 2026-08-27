import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { pythonAdapter } from "../../../src/adapters/python/index.js";
import { getPythonParser } from "../../../src/adapters/python/parser.js";
import type { ExtractResult } from "../../../src/adapters/types.js";
import { buildExportMap } from "../../../src/link/exportmap.js";
import { bindImports } from "../../../src/link/imports.js";
import { resolveForFile } from "../../../src/link/moduleResolver.js";
import { RepoBoundary } from "../../../src/repo/boundary.js";

const ROOT = join(process.cwd(), "tests/fixtures/repos/python-small");
const FILES = [
  "src/app/__init__.py",
  "src/app/core.py",
  "src/app/util.py",
  "src/app/dynamic.py",
  "src/app/star.py",
  "tests/test_engine.py",
];

let boundary: RepoBoundary;
let extracted: Map<string, ExtractResult>;
// The fixture has no tsconfig; the Python path never reads it.
const cfg = {} as never;

beforeAll(async () => {
  await getPythonParser();
  boundary = new RepoBoundary(ROOT);
  extracted = new Map(
    FILES.map((file) => [
      file,
      pythonAdapter.extract(file, boundary.readFile(file)),
    ]),
  );
});

describe("python end-to-end linking", () => {
  it("binds a relative import to the owning file", () => {
    const exportMap = buildExportMap(
      extracted,
      cfg,
      boundary,
      resolveForFile,
    );
    const bindings = bindImports(
      "src/app/core.py",
      extracted.get("src/app/core.py")!.imports,
      exportMap,
      cfg,
      boundary,
      resolveForFile,
    );
    expect(bindings.get("helper")).toEqual({
      file: "src/app/util.py",
      name: "helper",
    });
  });

  it("follows an __init__.py re-export chain to the defining file", () => {
    const exportMap = buildExportMap(
      extracted,
      cfg,
      boundary,
      resolveForFile,
    );
    expect(exportMap.get("src/app/__init__.py")?.get("Engine")).toBe(
      "src/app/core.py",
    );
  });

  it("classifies stdlib imports as external, never unresolved", () => {
    const exportMap = buildExportMap(
      extracted,
      cfg,
      boundary,
      resolveForFile,
    );
    const bindings = bindImports(
      "src/app/util.py",
      extracted.get("src/app/util.py")!.imports,
      exportMap,
      cfg,
      boundary,
      resolveForFile,
    );
    expect(bindings.get("os")).toEqual({ external: "os", name: "*" });
    expect(bindings.get("json")).toEqual({ external: "json", name: "*" });
  });

  it("propagates a star import through the export map", () => {
    const exportMap = buildExportMap(
      extracted,
      cfg,
      boundary,
      resolveForFile,
    );
    expect(exportMap.get("src/app/star.py")?.get("helper")).toBe(
      "src/app/util.py",
    );
  });

  it("emits self.describe() as a reference the resolver can narrow", () => {
    const refs = extracted.get("src/app/core.py")!.references;
    const ref = refs.find((reference) => reference.name === "describe");
    expect(ref?.receiver).toBe("self");
    expect(ref?.scopeHint?.receiverType).toBe("Engine");
  });

  it("keeps a dynamic getattr call visible rather than dropping it", () => {
    // invariant 1: never silently drop a reference; getattr must not be
    // resolved to a guessed target either.
    const refs = extracted.get("src/app/dynamic.py")!.references;
    expect(refs.some((reference) => reference.name === "getattr")).toBe(true);
  });
});
