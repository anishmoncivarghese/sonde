import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { migrate, openDb, Store, type Db } from "../../src/store/index.js";

let db: Db;
let store: Store;

const symbol = (
  stableKey: string,
  filePath: string,
  shortName: string,
) => ({
  stableKey,
  filePath,
  qualifiedName: shortName,
  shortName,
  kind: "function" as const,
  signature: null,
  startByte: 0,
  endByte: 1,
  startLine: 1,
  endLine: 1,
  bodyHash: null,
  exported: true,
  isTest: false,
});

beforeEach(() => {
  db = openDb(":memory:");
  migrate(db);
  store = new Store(db);

  store.upsertFile({
    path: "src/a/main.ts",
    contentHash: "a",
    mtimeMs: 1,
    size: 1,
  });
  store.upsertFile({
    path: "src/b/util.ts",
    contentHash: "b",
    mtimeMs: 1,
    size: 1,
    parseState: "partial",
  });
  store.upsertFile({
    path: "src/c/broken.ts",
    contentHash: "c",
    mtimeMs: 1,
    size: 1,
    parseState: "failed",
  });
  store.insertSymbols([
    symbol("ts:src/a/main.ts#run", "src/a/main.ts", "run"),
    symbol("ts:src/b/util.ts#helper", "src/b/util.ts", "helper"),
    symbol("ts:src/b/util.ts#other", "src/b/util.ts", "other"),
  ]);
  store.insertEdges([
    {
      srcKey: "ts:src/a/main.ts#run",
      dstKey: "ts:src/b/util.ts#helper",
      kind: "CALLS",
      tier: "LEXICAL",
      confidence: 1,
      siteLine: 1,
    },
    {
      srcKey: "ts:src/b/util.ts#helper",
      dstKey: "ts:src/b/util.ts#other",
      kind: "CONTAINS",
      tier: "LEXICAL",
      confidence: 1,
      siteLine: null,
    },
    {
      srcKey: "ts:src/a/main.ts#run",
      dstKey: "ts:src/b/util.ts#other",
      kind: "TESTS",
      tier: "HEURISTIC",
      confidence: 0.5,
      siteLine: 1,
    },
  ]);
});

afterEach(() => db.close());

describe("doc store queries", () => {
  it("returns only dependency edge rows with their evidence", () => {
    expect(store.docEdgeRows()).toEqual([
      {
        srcFile: "src/a/main.ts",
        dstFile: "src/b/util.ts",
        dstName: "helper",
        kind: "CALLS",
        tier: "LEXICAL",
      },
    ]);
  });

  it("counts symbols per file, including indexed files with none", () => {
    expect(store.docSymbolCounts()).toEqual([
      { filePath: "src/a/main.ts", symbols: 1 },
      { filePath: "src/b/util.ts", symbols: 2 },
      { filePath: "src/c/broken.ts", symbols: 0 },
    ]);
  });

  it("counts every partial or failed file rather than rendering a boolean", () => {
    expect(store.countParseFailures()).toBe(2);
  });
});
