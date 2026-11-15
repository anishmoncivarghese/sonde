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

  it("restricts both site lists to the given file extensions", () => {
    // The pyright pass asked for every unresolved and heuristic site in the
    // index and then reported the ones it could not match. On a repository
    // mixing Python with TypeScript that was every TypeScript site: 4858
    // "unmatched" sites for six Python files.
    const { store, close } = populatedStore();
    try {
      // No `language` here or on a.py's twin below: the index pipeline never
      // sets it, so a filter that trusted that column would pass against
      // hand-built fixtures and match nothing in a real index.
      store.upsertFile({
        path: "b.ts",
        contentHash: "hash",
        mtimeMs: 1,
        size: 100,
      });
      store.insertSymbols(
        ["tsCaller", "tsTarget"].map((name, index) => ({
          stableKey: `ts:b.ts#${name}`,
          filePath: "b.ts",
          qualifiedName: name,
          shortName: name,
          kind: "function" as const,
          signature: "()",
          startByte: index * 20,
          endByte: index * 20 + 10,
          startLine: index + 1,
          endLine: index + 1,
          bodyHash: null,
          exported: true,
          isTest: false,
        })),
      );
      store.insertEdges([
        {
          srcKey: "ts:b.ts#tsCaller",
          dstKey: "ts:b.ts#tsTarget",
          kind: "CALLS",
          tier: "HEURISTIC",
          confidence: 0.5,
          siteLine: 1,
        },
      ]);
      store.insertUnresolved([
        {
          srcKey: "ts:b.ts#tsCaller",
          name: "tsMystery",
          kind: "CALLS",
          siteLine: 1,
          candidateCount: 0,
          reason: "no_candidate",
        },
      ]);

      expect(store.unresolvedRefSites()).toHaveLength(2);
      expect(store.heuristicEdgeSites()).toHaveLength(2);
      expect(store.unresolvedRefSites([".py", ".pyi"])).toEqual([
        { srcKey: "py:a.py#caller", name: "mystery", siteLine: 3 },
      ]);
      expect(store.heuristicEdgeSites([".py", ".pyi"])).toEqual([
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
