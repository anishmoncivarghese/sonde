import { describe, expect, it } from "vitest";
import { migrate, openDb, Store } from "../../src/store/index.js";

function populatedStore(): { store: Store; close: () => void } {
  const db = openDb(":memory:");
  migrate(db);
  const store = new Store(db);
  store.upsertFile({
    path: "a.py",
    language: "python",
    contentHash: "hash",
    mtimeMs: 1,
    size: 100,
  });
  store.insertSymbols([
    {
      stableKey: "py:a.py#caller",
      filePath: "a.py",
      qualifiedName: "caller",
      shortName: "caller",
      kind: "function",
      signature: "()",
      startByte: 0,
      endByte: 40,
      startLine: 1,
      endLine: 4,
      bodyHash: null,
      exported: true,
      isTest: false,
    },
    {
      stableKey: "py:a.py#heuristic",
      filePath: "a.py",
      qualifiedName: "heuristic",
      shortName: "helper",
      kind: "function",
      signature: "()",
      startByte: 41,
      endByte: 60,
      startLine: 5,
      endLine: 6,
      bodyHash: null,
      exported: true,
      isTest: false,
    },
    {
      stableKey: "py:a.py#lexical",
      filePath: "a.py",
      qualifiedName: "lexical",
      shortName: "alreadyKnown",
      kind: "function",
      signature: "()",
      startByte: 61,
      endByte: 80,
      startLine: 7,
      endLine: 8,
      bodyHash: null,
      exported: true,
      isTest: false,
    },
  ]);
  store.insertEdges([
    {
      srcKey: "py:a.py#caller",
      dstKey: "py:a.py#heuristic",
      kind: "CALLS",
      tier: "HEURISTIC",
      confidence: 0.5,
      siteLine: 3,
    },
    {
      srcKey: "py:a.py#caller",
      dstKey: "py:a.py#lexical",
      kind: "CALLS",
      tier: "LEXICAL",
      confidence: 1,
      siteLine: 4,
    },
    {
      srcKey: "py:a.py#caller",
      dstKey: "py:a.py#heuristic",
      kind: "TESTS",
      tier: "HEURISTIC",
      confidence: 0.5,
      siteLine: 5,
    },
  ]);
  store.insertUnresolved([
    {
      srcKey: "py:a.py#caller",
      name: "mystery",
      kind: "CALLS",
      siteLine: 3,
      candidateCount: 0,
      reason: "no_candidate",
    },
  ]);
  store.insertExternal([
    {
      srcKey: "py:a.py#caller",
      name: "len",
      packageOrLib: "typeshed",
      siteLine: 2,
    },
  ]);
  return { store, close: () => db.close() };
}

describe("query-site read APIs", () => {
  it("lists unresolved reference sites with names and nullable lines", () => {
    const { store, close } = populatedStore();
    try {
      expect(store.unresolvedRefSites()).toEqual([
        { srcKey: "py:a.py#caller", name: "mystery", siteLine: 3 },
      ]);
    } finally {
      close();
    }
  });

  it("lists heuristic reference sites but excludes lexical and structural edges", () => {
    const { store, close } = populatedStore();
    try {
      expect(store.heuristicEdgeSites()).toEqual([
        { srcKey: "py:a.py#caller", name: "helper", siteLine: 3 },
      ]);
    } finally {
      close();
    }
  });

  it("counts external references", () => {
    const { store, close } = populatedStore();
    try {
      expect(store.countExternal()).toBe(1);
    } finally {
      close();
    }
  });

  it("counts distinct reference sites instead of structural or fan-out edges", () => {
    const { store, close } = populatedStore();
    try {
      expect(store.countReferenceSites("LEXICAL")).toBe(1);
      expect(store.countReferenceSites("HEURISTIC")).toBe(1);
      expect(store.countReferenceSites("COMPILER")).toBe(0);
    } finally {
      close();
    }
  });
});
