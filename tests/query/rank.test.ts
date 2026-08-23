import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fanInP95, score } from "../../src/query/rank.js";
import { migrate, openDb, Store, type Db } from "../../src/store/index.js";

describe("score", () => {
  it("weights a closer, exported, path-focused result higher", () => {
    const near = score(
      { distance: 0, fanIn: 10, exported: true, pathFocusMatch: true },
      20,
    );
    const far = score(
      { distance: 5, fanIn: 10, exported: false, pathFocusMatch: false },
      20,
    );
    expect(near).toBeGreaterThan(far);
  });

  it("never exceeds 1 and never goes negative", () => {
    const result = score(
      { distance: 0, fanIn: 1_000, exported: true, pathFocusMatch: true },
      20,
    );
    expect(result).toBeLessThanOrEqual(1);
    expect(result).toBeGreaterThanOrEqual(0);
  });

  it("does not divide by zero when FAN_IN_P95 is zero", () => {
    const result = score(
      { distance: 1, fanIn: 3, exported: false, pathFocusMatch: false },
      0,
    );
    expect(Number.isFinite(result)).toBe(true);
  });
});

describe("fanInP95", () => {
  let db: Db;
  let store: Store;

  beforeEach(() => {
    db = openDb(":memory:");
    migrate(db);
    store = new Store(db);
  });

  afterEach(() => db.close());

  function seedSymbols(): void {
    store.upsertFile({
      path: "src/a.ts",
      contentHash: "h",
      mtimeMs: 1,
      size: 1,
    });
    store.insertSymbols(
      ["a", "b"].map((name) => ({
        stableKey: `ts:src/a.ts#${name}`,
        filePath: "src/a.ts",
        qualifiedName: name,
        shortName: name,
        kind: "function" as const,
        signature: null,
        startByte: 0,
        endByte: 1,
        startLine: 1,
        endLine: 1,
        bodyHash: null,
        exported: true,
        isTest: false,
      })),
    );
  }

  it("returns 0 for a repository with no edges", () => {
    expect(fanInP95(db)).toBe(0);
  });

  it("computes inbound usage-edge counts", () => {
    seedSymbols();
    store.insertEdges([
      {
        srcKey: "ts:src/a.ts#b",
        dstKey: "ts:src/a.ts#a",
        kind: "CALLS",
        tier: "LEXICAL",
        confidence: 1,
        siteLine: 1,
      },
    ]);
    expect(fanInP95(db)).toBe(1);
  });

  it("excludes structural edges from fan-in", () => {
    seedSymbols();
    store.insertEdges([
      {
        srcKey: "ts:src/a.ts#b",
        dstKey: "ts:src/a.ts#a",
        kind: "CONTAINS",
        tier: "LEXICAL",
        confidence: 1,
        siteLine: 1,
      },
      {
        srcKey: "ts:src/a.ts#a",
        dstKey: "ts:src/a.ts#b",
        kind: "IMPORTS",
        tier: "LEXICAL",
        confidence: 1,
        siteLine: 1,
      },
    ]);
    expect(fanInP95(db)).toBe(0);
  });
});
