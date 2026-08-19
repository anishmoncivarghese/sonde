import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  queryGraph,
  type TraversePattern,
} from "../../src/query/traverse.js";
import {
  migrate,
  openDb,
  Store,
  type Db,
  type EdgeKind,
} from "../../src/store/index.js";

let db: Db;
let store: Store;

function seedSymbol(key: string, file: string, name: string): void {
  store.insertSymbols([
    {
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
    },
  ]);
}

beforeEach(() => {
  db = openDb(":memory:");
  migrate(db);
  store = new Store(db);
  store.upsertFile({
    path: "src/a.ts",
    contentHash: "h",
    mtimeMs: 1,
    size: 1,
  });
  store.upsertFile({
    path: "src/b.ts",
    contentHash: "h",
    mtimeMs: 1,
    size: 1,
  });
  seedSymbol("ts:src/a.ts#caller", "src/a.ts", "caller");
  seedSymbol("ts:src/b.ts#callee", "src/b.ts", "callee");
  store.insertEdges([
    {
      srcKey: "ts:src/a.ts#caller",
      dstKey: "ts:src/b.ts#callee",
      kind: "CALLS",
      tier: "LEXICAL",
      confidence: 1,
      siteLine: 3,
    },
  ]);
  store.insertUnresolved([
    {
      srcKey: "ts:src/a.ts#caller",
      name: "maybeCallee",
      kind: "CALLS",
      siteLine: 4,
      candidateCount: 0,
      reason: "no_candidate",
    },
  ]);
});

afterEach(() => db.close());

describe("queryGraph", () => {
  it("finds callers_of by reverse CALLS traversal", () => {
    const result = queryGraph(db, {
      pattern: "callers_of",
      symbol: "ts:src/b.ts#callee",
    });
    expect(result.lexical).toContainEqual(
      expect.objectContaining({ stableKey: "ts:src/a.ts#caller" }),
    );
    expect(result.external.count).toBe(0);
  });

  it("finds callees_of by forward CALLS traversal", () => {
    const result = queryGraph(db, {
      pattern: "callees_of",
      symbol: "ts:src/a.ts#caller",
    });
    expect(result.lexical).toContainEqual(
      expect.objectContaining({ stableKey: "ts:src/b.ts#callee" }),
    );
  });

  it("reports a forward symbol's external and unresolved outcomes", () => {
    store.insertExternal([
      {
        srcKey: "ts:src/a.ts#caller",
        name: "fetch",
        packageOrLib: "lib.dom",
        siteLine: 5,
      },
    ]);

    const result = queryGraph(db, {
      pattern: "callees_of",
      symbol: "ts:src/a.ts#caller",
    });
    expect(result.external.count).toBe(1);
    expect(result.unresolved).toEqual({
      count: 1,
      names: ["maybeCallee"],
    });
  });

  it("does not leak outgoing unresolved names into a reverse query", () => {
    const result = queryGraph(db, {
      pattern: "callers_of",
      symbol: "ts:src/a.ts#caller",
    });
    expect(result.unresolved.names).not.toContain("maybeCallee");
  });

  it("counts same-name unresolved references on a reverse query", () => {
    store.insertUnresolved([
      {
        srcKey: "ts:src/a.ts#caller",
        name: "callee",
        kind: "CALLS",
        siteLine: 6,
        candidateCount: 0,
        reason: "no_candidate",
      },
      {
        srcKey: "ts:src/a.ts#caller",
        name: "callee",
        kind: "CALLS",
        siteLine: 7,
        candidateCount: 0,
        reason: "no_candidate",
      },
    ]);

    const result = queryGraph(db, {
      pattern: "callers_of",
      symbol: "ts:src/b.ts#callee",
    });
    expect(result.unresolved).toEqual({ count: 2, names: ["callee"] });
  });

  it("returns empty buckets for tests_for until TESTS edges are produced", () => {
    const result = queryGraph(db, {
      pattern: "tests_for",
      symbol: "ts:src/b.ts#callee",
    });
    expect(result.compiler).toEqual([]);
    expect(result.lexical).toEqual([]);
    expect(result.heuristic).toEqual([]);
  });

  it("resolves an unambiguous exact qualified name", () => {
    const result = queryGraph(db, {
      pattern: "callees_of",
      symbol: "caller",
    });
    expect(result.lexical).toContainEqual(
      expect.objectContaining({ stableKey: "ts:src/b.ts#callee" }),
    );
  });

  it("does not choose arbitrarily when a name is ambiguous", () => {
    seedSymbol("ts:src/b.ts#otherCaller", "src/b.ts", "caller");
    const result = queryGraph(db, {
      pattern: "callees_of",
      symbol: "caller",
    });
    expect(result.lexical).toEqual([]);
  });

  it("deduplicates the CALLS and REFERENCES union", () => {
    store.insertEdges([
      {
        srcKey: "ts:src/a.ts#caller",
        dstKey: "ts:src/b.ts#callee",
        kind: "REFERENCES",
        tier: "LEXICAL",
        confidence: 1,
        siteLine: 3,
      },
    ]);
    const result = queryGraph(db, {
      pattern: "references_to",
      symbol: "ts:src/b.ts#callee",
    });
    expect(result.lexical).toHaveLength(1);
  });

  it("applies the global limit in compiler, lexical, heuristic order", () => {
    seedSymbol("ts:src/a.ts#compiler", "src/a.ts", "compilerCaller");
    seedSymbol("ts:src/a.ts#heuristic", "src/a.ts", "heuristicCaller");
    store.insertEdges([
      {
        srcKey: "ts:src/a.ts#compiler",
        dstKey: "ts:src/b.ts#callee",
        kind: "CALLS",
        tier: "COMPILER",
        confidence: 1,
        siteLine: 1,
      },
      {
        srcKey: "ts:src/a.ts#heuristic",
        dstKey: "ts:src/b.ts#callee",
        kind: "CALLS",
        tier: "HEURISTIC",
        confidence: 0.5,
        siteLine: 2,
      },
    ]);

    const result = queryGraph(db, {
      pattern: "callers_of",
      symbol: "ts:src/b.ts#callee",
      limit: 2,
    });
    expect(result.compiler).toHaveLength(1);
    expect(result.lexical).toHaveLength(1);
    expect(result.heuristic).toEqual([]);
    expect(result.truncated).toBe(true);
  });

  const structuralCases: Array<{
    pattern: TraversePattern;
    edgeKind: EdgeKind;
    symbol: string;
    expected: string;
  }> = [
    {
      pattern: "imports_of",
      edgeKind: "IMPORTS",
      symbol: "ts:src/a.ts#caller",
      expected: "ts:src/b.ts#callee",
    },
    {
      pattern: "imported_by",
      edgeKind: "IMPORTS",
      symbol: "ts:src/b.ts#callee",
      expected: "ts:src/a.ts#caller",
    },
    {
      pattern: "implementations_of",
      edgeKind: "IMPLEMENTS",
      symbol: "ts:src/b.ts#callee",
      expected: "ts:src/a.ts#caller",
    },
    {
      pattern: "inheritors_of",
      edgeKind: "INHERITS",
      symbol: "ts:src/b.ts#callee",
      expected: "ts:src/a.ts#caller",
    },
    {
      pattern: "inherits_from",
      edgeKind: "INHERITS",
      symbol: "ts:src/a.ts#caller",
      expected: "ts:src/b.ts#callee",
    },
    {
      pattern: "contained_by",
      edgeKind: "CONTAINS",
      symbol: "ts:src/b.ts#callee",
      expected: "ts:src/a.ts#caller",
    },
    {
      pattern: "contains",
      edgeKind: "CONTAINS",
      symbol: "ts:src/a.ts#caller",
      expected: "ts:src/b.ts#callee",
    },
  ];

  it.each(structuralCases)(
    "maps $pattern to the correct edge kind and direction",
    ({ pattern, edgeKind, symbol, expected }) => {
      store.insertEdges([
        {
          srcKey: "ts:src/a.ts#caller",
          dstKey: "ts:src/b.ts#callee",
          kind: edgeKind,
          tier: "LEXICAL",
          confidence: 1,
          siteLine: 8,
        },
      ]);
      const result = queryGraph(db, { pattern, symbol });
      expect(result.lexical).toContainEqual(
        expect.objectContaining({ stableKey: expected }),
      );
    },
  );
});
