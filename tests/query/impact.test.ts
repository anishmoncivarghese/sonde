import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getImpactRadius,
  MAX_DEPTH,
  MAX_NODES,
  MAX_WALL_CLOCK_MS,
} from "../../src/query/impact.js";
import { RepoBoundary } from "../../src/repo/boundary.js";
import {
  migrate,
  openDb,
  Store,
  type Db,
  type EdgeRow,
  type SymbolRow,
} from "../../src/store/index.js";

let db: Db;
let root: string;
let boundary: RepoBoundary;
let store: Store;

function symbol(key: string, file: string, name: string): SymbolRow {
  return {
    stableKey: key,
    filePath: file,
    qualifiedName: name,
    shortName: name.split(".").at(-1) ?? name,
    kind: "function",
    signature: null,
    startByte: 0,
    endByte: 1,
    startLine: 1,
    endLine: 1,
    bodyHash: null,
    exported: true,
    isTest: false,
  };
}

function edge(
  srcKey: string,
  dstKey: string,
  kind: EdgeRow["kind"] = "CALLS",
): EdgeRow {
  return {
    srcKey,
    dstKey,
    kind,
    tier: "LEXICAL",
    confidence: 1,
    siteLine: 1,
  };
}

beforeEach(() => {
  db = openDb(":memory:");
  migrate(db);
  store = new Store(db);
  for (const path of ["src/base.ts", "src/mid.ts", "src/top.ts"]) {
    store.upsertFile({ path, contentHash: "h", mtimeMs: 1, size: 1 });
  }
  store.insertSymbols([
    symbol("ts:src/base.ts#Base", "src/base.ts", "Base"),
    symbol("ts:src/mid.ts#Mid", "src/mid.ts", "Mid"),
    symbol("ts:src/top.ts#useMid", "src/top.ts", "useMid"),
  ]);
  store.insertEdges([
    edge("ts:src/mid.ts#Mid", "ts:src/base.ts#Base", "INHERITS"),
    edge("ts:src/top.ts#useMid", "ts:src/mid.ts#Mid"),
  ]);

  root = mkdtempSync(join(tmpdir(), "cg-impact-"));
  mkdirSync(join(root, "src"));
  execFileSync("git", ["init", "-q"], { cwd: root });
  execFileSync("git", ["config", "user.email", "t@example.com"], {
    cwd: root,
  });
  execFileSync("git", ["config", "user.name", "t"], { cwd: root });
  writeFileSync(join(root, "src", "base.ts"), "export class Base {}\n");
  execFileSync("git", ["add", "."], { cwd: root });
  execFileSync("git", ["commit", "-q", "-m", "init"], { cwd: root });
  boundary = new RepoBoundary(root);
});

afterEach(() => {
  vi.restoreAllMocks();
  db.close();
  rmSync(root, { recursive: true, force: true });
});

describe("getImpactRadius", () => {
  it("reverse-traverses INHERITS then CALLS transitively", () => {
    const result = getImpactRadius(db, boundary, {
      symbols: ["ts:src/base.ts#Base"],
    });

    expect(result.seeds).toEqual(["ts:src/base.ts#Base"]);
    expect(result.affected).toEqual([
      expect.objectContaining({
        stableKey: "ts:src/mid.ts#Mid",
        depth: 1,
        viaKind: "INHERITS",
      }),
      expect.objectContaining({
        stableKey: "ts:src/top.ts#useMid",
        depth: 2,
        viaKind: "CALLS",
      }),
    ]);
    expect(result.tests).toEqual([]);
    expect(result.truncated).toBe(false);
  });

  it("traverses every impact kind and ignores structural edges", () => {
    const rows = [
      symbol("ts:src/top.ts#ref", "src/top.ts", "ref"),
      symbol("ts:src/top.ts#impl", "src/top.ts", "impl"),
      symbol("ts:src/top.ts#importer", "src/top.ts", "importer"),
    ];
    store.insertSymbols(rows);
    store.insertEdges([
      edge(rows[0]!.stableKey, "ts:src/base.ts#Base", "REFERENCES"),
      edge(rows[1]!.stableKey, "ts:src/base.ts#Base", "IMPLEMENTS"),
      edge(rows[2]!.stableKey, "ts:src/base.ts#Base", "IMPORTS"),
    ]);

    const result = getImpactRadius(db, boundary, {
      symbols: ["ts:src/base.ts#Base"],
    });

    expect(result.affected).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          stableKey: rows[0]!.stableKey,
          viaKind: "REFERENCES",
        }),
        expect.objectContaining({
          stableKey: rows[1]!.stableKey,
          viaKind: "IMPLEMENTS",
        }),
      ]),
    );
    expect(result.affected).not.toContainEqual(
      expect.objectContaining({ stableKey: rows[2]!.stableKey }),
    );
  });

  it("resolves every symbol in a file changed in the working-tree diff", () => {
    writeFileSync(
      join(root, "src", "base.ts"),
      "export class Base { changed = true; }\n",
    );

    const result = getImpactRadius(db, boundary, { fromGitDiff: true });

    expect(result.seeds).toContain("ts:src/base.ts#Base");
  });

  it("warns when git cannot determine changed files", () => {
    const nonGitRoot = mkdtempSync(join(tmpdir(), "cg-impact-nogit-"));
    try {
      const result = getImpactRadius(db, new RepoBoundary(nonGitRoot), {
        fromGitDiff: true,
      });
      expect(result.seeds).toEqual([]);
      expect(result.warnings).toContainEqual(expect.stringMatching(/git/i));
    } finally {
      rmSync(nonGitRoot, { recursive: true, force: true });
    }
  });

  it("never revisits a node in a cycle", () => {
    store.insertEdges([
      edge("ts:src/base.ts#Base", "ts:src/top.ts#useMid"),
    ]);

    const result = getImpactRadius(db, boundary, {
      symbols: ["ts:src/base.ts#Base"],
    });

    expect(
      result.affected.filter((row) => row.stableKey === "ts:src/mid.ts#Mid"),
    ).toHaveLength(1);
    expect(result.affected).toHaveLength(2);
  });

  it("does not choose arbitrarily when a seed name is ambiguous", () => {
    store.insertSymbols([
      symbol("ts:src/top.ts#Base", "src/top.ts", "Base"),
    ]);

    const result = getImpactRadius(db, boundary, { symbols: ["Base"] });

    expect(result.seeds).toEqual([]);
    expect(result.warnings).toContainEqual(expect.stringMatching(/ambiguous/i));
  });

  it("does not report truncation when the deepest result exactly fits", () => {
    const rootKey = "ts:src/top.ts#depthRoot";
    const symbols: SymbolRow[] = [
      symbol(rootKey, "src/top.ts", "depthRoot"),
    ];
    const edges: EdgeRow[] = [];
    let previous = rootKey;
    for (let depth = 1; depth <= MAX_DEPTH; depth += 1) {
      const key = `ts:src/top.ts#depth${depth}`;
      symbols.push(symbol(key, "src/top.ts", `depth${depth}`));
      edges.push(edge(key, previous));
      previous = key;
    }
    store.insertSymbols(symbols);
    store.insertEdges(edges);

    const result = getImpactRadius(db, boundary, {
      symbols: [rootKey],
    });

    expect(result.affected).toHaveLength(MAX_DEPTH);
    expect(result.truncated).toBe(false);
  });

  it("marks the depth bound when another affected node exists", () => {
    const rootKey = "ts:src/top.ts#deepRoot";
    const symbols: SymbolRow[] = [
      symbol(rootKey, "src/top.ts", "deepRoot"),
    ];
    const edges: EdgeRow[] = [];
    let previous = rootKey;
    for (let depth = 1; depth <= MAX_DEPTH + 1; depth += 1) {
      const key = `ts:src/top.ts#deep${depth}`;
      symbols.push(symbol(key, "src/top.ts", `deep${depth}`));
      edges.push(edge(key, previous));
      previous = key;
    }
    store.insertSymbols(symbols);
    store.insertEdges(edges);

    const result = getImpactRadius(db, boundary, {
      symbols: [rootKey],
    });

    expect(result.affected).toHaveLength(MAX_DEPTH);
    expect(result.truncated).toBe(true);
    expect(result.warnings).toContainEqual(expect.stringMatching(/depth/i));
  });

  it("marks the node bound only when an additional node is omitted", () => {
    const symbols: SymbolRow[] = [];
    const edges: EdgeRow[] = [];
    for (let index = 0; index <= MAX_NODES; index += 1) {
      const key = `ts:src/top.ts#caller${index}`;
      symbols.push(symbol(key, "src/top.ts", `caller${index}`));
      edges.push(edge(key, "ts:src/base.ts#Base"));
    }
    store.insertSymbols(symbols);
    store.insertEdges(edges);

    const result = getImpactRadius(db, boundary, {
      symbols: ["ts:src/base.ts#Base"],
    });

    expect(result.affected).toHaveLength(MAX_NODES);
    expect(result.truncated).toBe(true);
    expect(result.warnings).toContainEqual(expect.stringMatching(/node/i));
  });

  it("keeps the higher fan-in candidate when a same-tier node is truncated away", () => {
    const symbols: SymbolRow[] = [
      symbol("ts:src/top.ts#high", "src/top.ts", "high"),
      symbol("ts:src/top.ts#zzzLow", "src/top.ts", "zzzLow"),
    ];
    const edges: EdgeRow[] = [
      edge("ts:src/top.ts#high", "ts:src/base.ts#Base"),
      edge("ts:src/top.ts#zzzLow", "ts:src/base.ts#Base"),
    ];
    // Give "high" extra inbound usage edges so its fan-in — and therefore its
    // score() within the tied LEXICAL tier — strictly exceeds every filler
    // and "zzzLow", which all keep fan-in 0.
    for (let index = 0; index < 50; index += 1) {
      const key = `ts:src/top.ts#booster${index}`;
      symbols.push(symbol(key, "src/top.ts", `booster${index}`));
      edges.push(edge(key, "ts:src/top.ts#high"));
    }
    // Fill every remaining slot with fan-in-0 callers of Base that sort
    // alphabetically ahead of "zzzLow", so it is the one node omitted.
    for (let index = 0; index < MAX_NODES - 1; index += 1) {
      const key = `ts:src/top.ts#caller${index}`;
      symbols.push(symbol(key, "src/top.ts", `caller${index}`));
      edges.push(edge(key, "ts:src/base.ts#Base"));
    }
    store.insertSymbols(symbols);
    store.insertEdges(edges);

    const result = getImpactRadius(db, boundary, {
      symbols: ["ts:src/base.ts#Base"],
    });

    const affectedKeys = result.affected.map((row) => row.stableKey);
    expect(affectedKeys).toContain("ts:src/top.ts#high");
    expect(affectedKeys).not.toContain("ts:src/top.ts#zzzLow");
    expect(result.truncated).toBe(true);
  });

  it("marks the wall-clock bound before traversing over budget", () => {
    vi.spyOn(Date, "now")
      .mockReturnValueOnce(0)
      .mockReturnValue(MAX_WALL_CLOCK_MS + 1);

    const result = getImpactRadius(db, boundary, {
      symbols: ["ts:src/base.ts#Base"],
    });

    expect(result.affected).toEqual([]);
    expect(result.truncated).toBe(true);
    expect(result.warnings).toContainEqual(expect.stringMatching(/wall-clock/i));
  });
});
