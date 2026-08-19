import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type Db,
  migrate,
  openDb,
  SchemaVersionError,
  Store,
} from "../../src/store/index.js";

let store: Store;
let db: Db;

beforeEach(() => {
  db = openDb(":memory:");
  migrate(db);
  store = new Store(db);
});

afterEach(() => db.close());

describe("Store", () => {
  it("round-trips a file record", () => {
    store.upsertFile({
      path: "a.ts",
      contentHash: "h1",
      mtimeMs: 100,
      size: 10,
    });
    expect(store.getFile("a.ts")?.contentHash).toBe("h1");
  });

  it("updates an existing file rather than duplicating", () => {
    store.upsertFile({
      path: "a.ts",
      contentHash: "h1",
      mtimeMs: 100,
      size: 10,
    });
    store.upsertFile({
      path: "a.ts",
      contentHash: "h2",
      mtimeMs: 200,
      size: 20,
    });
    expect(store.allFiles()).toHaveLength(1);
    expect(store.getFile("a.ts")?.contentHash).toBe("h2");
  });

  it("cascades symbol deletion when a file is deleted", () => {
    store.upsertFile({
      path: "a.ts",
      contentHash: "h",
      mtimeMs: 1,
      size: 1,
    });
    store.insertSymbols([
      {
        stableKey: "ts:a.ts#foo",
        filePath: "a.ts",
        qualifiedName: "foo",
        shortName: "foo",
        kind: "function",
        signature: "()=>void",
        startLine: 1,
        endLine: 2,
        startByte: 0,
        endByte: 10,
        bodyHash: "b",
        exported: true,
        isTest: false,
      },
    ]);
    expect(store.symbolsInFile("a.ts")).toHaveLength(1);
    store.deleteFile("a.ts");
    expect(store.symbolsInFile("a.ts")).toHaveLength(0);
  });

  it("rejects a duplicate stable key rather than silently overwriting", () => {
    store.upsertFile({
      path: "a.ts",
      contentHash: "h",
      mtimeMs: 1,
      size: 1,
    });
    const symbol = {
      stableKey: "ts:a.ts#foo",
      filePath: "a.ts",
      qualifiedName: "foo",
      shortName: "foo",
      kind: "function" as const,
      signature: "()",
      startLine: 1,
      endLine: 2,
      startByte: 0,
      endByte: 5,
      bodyHash: "b",
      exported: true,
      isTest: false,
    };
    expect(() => store.insertSymbols([symbol, symbol])).toThrow();
    expect(store.symbolsInFile("a.ts")).toHaveLength(0);
  });

  it("rolls back a failed transaction", () => {
    expect(() =>
      store.transaction(() => {
        store.upsertFile({
          path: "b.ts",
          contentHash: "h",
          mtimeMs: 1,
          size: 1,
        });
        throw new Error("boom");
      }),
    ).toThrow("boom");
    expect(store.getFile("b.ts")).toBeUndefined();
  });

  it("stores edges, external refs, and unresolved refs", () => {
    store.upsertFile({
      path: "a.ts",
      contentHash: "h",
      mtimeMs: 1,
      size: 1,
    });
    store.insertSymbols([
      {
        stableKey: "ts:a.ts#source",
        filePath: "a.ts",
        qualifiedName: "source",
        shortName: "source",
        kind: "function",
        signature: null,
        startByte: 0,
        endByte: 5,
        startLine: 1,
        endLine: 1,
        bodyHash: null,
        exported: false,
        isTest: true,
      },
      {
        stableKey: "ts:a.ts#target",
        filePath: "a.ts",
        qualifiedName: "target",
        shortName: "target",
        kind: "function",
        signature: null,
        startByte: 6,
        endByte: 10,
        startLine: 2,
        endLine: 2,
        bodyHash: null,
        exported: true,
        isTest: false,
      },
    ]);

    store.insertEdges([
      {
        srcKey: "ts:a.ts#source",
        dstKey: "ts:a.ts#target",
        kind: "CALLS",
        tier: "LEXICAL",
        confidence: 1,
        siteLine: 1,
      },
    ]);
    store.insertExternal([
      {
        srcKey: "ts:a.ts#source",
        name: "console.log",
        packageOrLib: "lib.dom",
        siteLine: 1,
      },
    ]);
    store.insertUnresolved([
      {
        srcKey: "ts:a.ts#source",
        name: "mystery",
        kind: "CALLS",
        siteLine: 1,
        candidateCount: 0,
        reason: "not_found",
      },
    ]);

    expect(store.findSymbolsByName("source")).toMatchObject([
      { stableKey: "ts:a.ts#source", exported: false, isTest: true },
    ]);
    expect(db.prepare("SELECT count(*) AS count FROM edge").get()).toEqual({
      count: 1,
    });
    expect(
      db.prepare("SELECT count(*) AS count FROM external_ref").get(),
    ).toEqual({ count: 1 });
    expect(
      db.prepare("SELECT count(*) AS count FROM unresolved_ref").get(),
    ).toEqual({ count: 1 });
  });

  it("refuses to migrate a future schema version", () => {
    const futureDb = openDb(":memory:");
    try {
      futureDb.exec(
        "CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)",
      );
      futureDb
        .prepare("INSERT INTO meta (key, value) VALUES (?, ?)")
        .run("schema_version", "999");
      expect(() => migrate(futureDb)).toThrow(SchemaVersionError);
      const fileTable = futureDb
        .prepare("SELECT name FROM sqlite_master WHERE name = 'file'")
        .get();
      expect(fileTable).toBeUndefined();
    } finally {
      futureDb.close();
    }
  });

  it("configures WAL, busy timeout, and foreign keys", () => {
    const directory = mkdtempSync(join(tmpdir(), "cg-store-"));
    const fileDb = openDb(join(directory, "index.sqlite"));
    try {
      expect(fileDb.pragma("journal_mode", { simple: true })).toBe("wal");
      expect(fileDb.pragma("busy_timeout", { simple: true })).toBe(5_000);
      expect(fileDb.pragma("foreign_keys", { simple: true })).toBe(1);
    } finally {
      fileDb.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("keeps symbol_fts in sync with inserted and deleted symbols", () => {
    store.upsertFile({
      path: "src/auth.ts",
      contentHash: "h1",
      mtimeMs: 1,
      size: 10,
    });
    store.insertSymbols([
      {
        stableKey: "ts:src/auth.ts#refreshSession",
        filePath: "src/auth.ts",
        qualifiedName: "refreshSession",
        shortName: "refreshSession",
        kind: "function",
        signature: "function refreshSession(): void",
        startByte: 0,
        endByte: 1,
        startLine: 1,
        endLine: 1,
        bodyHash: null,
        exported: true,
        isTest: false,
      },
    ]);

    const hit = db
      .prepare(
        `SELECT s.qualified_name AS qualifiedName FROM symbol_fts f
         JOIN symbol s ON s.id = f.rowid
         WHERE symbol_fts MATCH ?`,
      )
      .all("refresh") as Array<{ qualifiedName: string }>;
    expect(hit).toContainEqual({ qualifiedName: "refreshSession" });

    const humanQuery = db
      .prepare(
        `SELECT s.qualified_name AS qualifiedName FROM symbol_fts f
         JOIN symbol s ON s.id = f.rowid
         WHERE symbol_fts MATCH ?`,
      )
      .all("refresh session") as Array<{ qualifiedName: string }>;
    expect(humanQuery).toContainEqual({ qualifiedName: "refreshSession" });

    store.deleteFile("src/auth.ts");
    const afterDelete = db
      .prepare(
        "SELECT COUNT(*) AS count FROM symbol_fts WHERE symbol_fts MATCH ?",
      )
      .get("refresh") as { count: number };
    expect(afterDelete.count).toBe(0);
  });
});
