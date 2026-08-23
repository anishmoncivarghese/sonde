import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  ExtractResult,
  ImportRecord,
  ReferenceRecord,
  SymbolRecord,
} from "../../src/adapters/types.js";
import type { ExportMap } from "../../src/link/exportmap.js";
import { RepoBoundary } from "../../src/repo/boundary.js";
import { resolveAll } from "../../src/resolve/resolver.js";
import type { TsConfig } from "../../src/tsconfig/load.js";

let root: string;
let boundary: RepoBoundary;

const cfg: TsConfig = {
  baseUrl: null,
  paths: {},
  moduleResolution: "bundler",
};

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "cg-resolve-"));
  mkdirSync(join(root, "src"));
  for (const file of ["caller.ts", "lib.ts", "other.ts"]) {
    writeFileSync(join(root, "src", file), "");
  }
  boundary = new RepoBoundary(root);
});

afterAll(() => rmSync(root, { recursive: true, force: true }));

function symbol(
  file: string,
  qualifiedName: string,
  overrides: Partial<SymbolRecord> = {},
): SymbolRecord {
  const shortName = qualifiedName.split(".").at(-1) ?? qualifiedName;
  return {
    stableKey: `ts:${file}#${qualifiedName}`,
    qualifiedName,
    shortName,
    kind: qualifiedName.includes(".") ? "method" : "function",
    signature: null,
    startByte: 0,
    endByte: 1,
    startLine: 1,
    endLine: 1,
    bodyHash: null,
    exported: true,
    isTest: false,
    ...overrides,
  };
}

function fileSymbol(file: string): SymbolRecord {
  return {
    stableKey: `ts:${file}#`,
    qualifiedName: file,
    shortName: file.split("/").at(-1) ?? file,
    kind: "file",
    signature: null,
    startByte: 0,
    endByte: 1,
    startLine: 1,
    endLine: 1,
    bodyHash: null,
    exported: false,
    isTest: false,
  };
}

function reference(
  name: string,
  overrides: Partial<ReferenceRecord> = {},
): ReferenceRecord {
  return {
    fromSymbolKey: "ts:src/caller.ts#caller",
    name,
    receiver: null,
    kind: "CALLS",
    siteLine: 2,
    ...overrides,
  };
}

function extracted(
  symbols: SymbolRecord[],
  references: ReferenceRecord[] = [],
  imports: ImportRecord[] = [],
): ExtractResult {
  return { symbols, references, imports, exports: [], diagnostics: [] };
}

function exportsFor(entries: Array<[string, Array<[string, string]>]>): ExportMap {
  return new Map(entries.map(([file, names]) => [file, new Map(names)]));
}

describe("resolveAll", () => {
  it("resolves an aliased bare import to the exported declaration", () => {
    const caller = symbol("src/caller.ts", "caller");
    const original = symbol("src/lib.ts", "original");
    const files = new Map<string, ExtractResult>([
      ["src/caller.ts", extracted([caller], [reference("alias")], [{
        localName: "alias",
        importedName: "original",
        specifier: "./lib",
        siteLine: 1,
      }])],
      ["src/lib.ts", extracted([original])],
    ]);

    const result = resolveAll(
      files,
      exportsFor([["src/lib.ts", [["original", "src/lib.ts"]]]]),
      cfg,
      boundary,
    );

    expect(result.edges).toContainEqual(expect.objectContaining({
      srcKey: caller.stableKey,
      dstKey: original.stableKey,
      tier: "LEXICAL",
    }));
  });

  it("does not fabricate an edge for a name missing from an internal module", () => {
    const caller = symbol("src/caller.ts", "caller");
    const unrelated = symbol("src/other.ts", "missing");
    const files = new Map<string, ExtractResult>([
      ["src/caller.ts", extracted([caller], [reference("missing")], [{
        localName: "missing",
        importedName: "missing",
        specifier: "./lib",
        siteLine: 1,
      }])],
      ["src/lib.ts", extracted([])],
      ["src/other.ts", extracted([unrelated])],
    ]);

    const result = resolveAll(
      files,
      exportsFor([["src/lib.ts", []]]),
      cfg,
      boundary,
    );

    expect(result.edges.some((edge) => edge.dstKey === unrelated.stableKey)).toBe(false);
    expect(result.unresolved).toContainEqual(expect.objectContaining({
      name: "missing",
      candidateCount: 1,
      reason: "unexported_import",
    }));
  });

  it("classifies a member reference on an external namespace separately", () => {
    const files = new Map<string, ExtractResult>([[
      "src/caller.ts",
      extracted(
        [symbol("src/caller.ts", "caller")],
        [reference("useState", { receiver: "React" })],
        [{ localName: "React", importedName: "*", specifier: "react", siteLine: 1 }],
      ),
    ]]);

    const result = resolveAll(files, new Map(), cfg, boundary);

    expect(result.external).toContainEqual(expect.objectContaining({
      name: "useState",
      packageOrLib: "react",
    }));
    expect(result.unresolved).toEqual([]);
  });

  it("keeps member calls heuristic and emits one edge per candidate", () => {
    const first = symbol("src/lib.ts", "First.foo");
    const second = symbol("src/other.ts", "Second.foo");
    const files = new Map<string, ExtractResult>([
      ["src/caller.ts", extracted(
        [symbol("src/caller.ts", "caller")],
        [reference("foo", { receiver: "service" })],
      )],
      ["src/lib.ts", extracted([first])],
      ["src/other.ts", extracted([second])],
    ]);

    const result = resolveAll(files, new Map(), cfg, boundary);

    expect(result.edges.filter((edge) => edge.kind === "CALLS")).toEqual([
      expect.objectContaining({ dstKey: first.stableKey, tier: "HEURISTIC", confidence: 0.5 }),
      expect.objectContaining({ dstKey: second.stableKey, tier: "HEURISTIC", confidence: 0.5 }),
    ]);
  });

  it("creates lexical containment edges from qualified ancestry", () => {
    const service = symbol("src/lib.ts", "Service", { kind: "class" });
    const method = symbol("src/lib.ts", "Service.foo");
    const files = new Map<string, ExtractResult>([[
      "src/lib.ts",
      extracted([service, method]),
    ]]);

    const result = resolveAll(files, new Map(), cfg, boundary);

    expect(result.edges).toContainEqual({
      srcKey: service.stableKey,
      dstKey: method.stableKey,
      kind: "CONTAINS",
      tier: "LEXICAL",
      confidence: 1,
      siteLine: 1,
    });
  });

  it("attaches a top-level symbol to its file via CONTAINS", () => {
    const file = fileSymbol("src/lib.ts");
    const top = symbol("src/lib.ts", "run");
    const files = new Map<string, ExtractResult>([
      ["src/lib.ts", extracted([file, top])],
    ]);

    const result = resolveAll(files, new Map(), cfg, boundary);

    expect(result.edges).toContainEqual({
      srcKey: file.stableKey,
      dstKey: top.stableKey,
      kind: "CONTAINS",
      tier: "LEXICAL",
      confidence: 1,
      siteLine: top.startLine,
    });
  });

  it("emits IMPORTS for an internal module and external_ref for a package", () => {
    const caller = fileSymbol("src/caller.ts");
    const lib = fileSymbol("src/lib.ts");
    const files = new Map<string, ExtractResult>([
      [
        "src/caller.ts",
        extracted(
          [caller, symbol("src/caller.ts", "run")],
          [],
          [
            {
              localName: "helper",
              importedName: "helper",
              specifier: "./lib",
              siteLine: 1,
            },
            {
              localName: "React",
              importedName: "*",
              specifier: "react",
              siteLine: 2,
            },
          ],
        ),
      ],
      ["src/lib.ts", extracted([lib, symbol("src/lib.ts", "helper")])],
    ]);

    const result = resolveAll(
      files,
      exportsFor([["src/lib.ts", [["helper", "src/lib.ts"]]]]),
      cfg,
      boundary,
    );

    expect(result.edges).toContainEqual(
      expect.objectContaining({
        srcKey: caller.stableKey,
        dstKey: lib.stableKey,
        kind: "IMPORTS",
        tier: "LEXICAL",
      }),
    );
    expect(result.external).toContainEqual(
      expect.objectContaining({
        srcKey: caller.stableKey,
        name: "react",
        packageOrLib: "react",
      }),
    );
  });
});
