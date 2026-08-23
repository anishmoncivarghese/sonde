import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { findSymbols } from "../../src/query/find.js";
import { migrate, openDb, Store, type Db } from "../../src/store/index.js";

let db: Db;

beforeEach(() => {
  db = openDb(":memory:");
  migrate(db);
  const store = new Store(db);
  store.upsertFile({
    path: "src/auth.ts",
    contentHash: "h",
    mtimeMs: 1,
    size: 1,
  });
  store.upsertFile({
    path: "src/session.ts",
    contentHash: "h",
    mtimeMs: 1,
    size: 1,
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
      startLine: 10,
      endLine: 12,
      bodyHash: null,
      exported: true,
      isTest: false,
    },
    {
      stableKey: "ts:src/session.ts#Session.expire",
      filePath: "src/session.ts",
      qualifiedName: "Session.expire",
      shortName: "expire",
      kind: "method",
      signature: "expire(): void",
      startByte: 0,
      endByte: 1,
      startLine: 5,
      endLine: 6,
      bodyHash: null,
      exported: false,
      isTest: false,
    },
  ]);
});

afterEach(() => db.close());

describe("findSymbols", () => {
  it("ranks an exact qualified-name match first", () => {
    const results = findSymbols(db, { query: "Session.expire" });
    expect(results[0]).toMatchObject({
      stableKey: "ts:src/session.ts#Session.expire",
      reason: "exact_qualified",
    });
  });

  it("ranks an exact short-name match before full-text results", () => {
    const results = findSymbols(db, { query: "expire" });
    expect(results[0]).toMatchObject({
      stableKey: "ts:src/session.ts#Session.expire",
      reason: "exact_short",
    });
  });

  it("falls back to full-text search over signatures and names", () => {
    const results = findSymbols(db, { query: "refresh session" });
    expect(results.map((result) => result.stableKey)).toContain(
      "ts:src/auth.ts#refreshSession",
    );
    expect(results[0]?.reason).toBe("fts");
  });

  it("filters by kind", () => {
    const results = findSymbols(db, {
      query: "session",
      kinds: ["method"],
    });
    expect(results.every((result) => result.kind === "method")).toBe(true);
  });

  it("filters by literal path prefix", () => {
    const results = findSymbols(db, {
      query: "session",
      paths: ["src/auth"],
    });
    expect(results.map((result) => result.path)).toEqual(["src/auth.ts"]);
  });

  it("respects the limit", () => {
    const results = findSymbols(db, { query: "session", limit: 1 });
    expect(results).toHaveLength(1);
  });
});
