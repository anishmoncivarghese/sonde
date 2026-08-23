import { describe, expect, it, beforeEach } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { semanticSearch } from "../../src/enrich/semantic.js";
import { EMBEDDING_MODEL, type Embedder } from "../../src/enrich/embedder.js";
import { packVector } from "../../src/enrich/vectors.js";
import { migrate, openDb, Store } from "../../src/store/index.js";

const stubEmbedder = (vector: number[]): Embedder => ({
  embed: async () => [Float32Array.from(vector)],
});

let store: Store;

beforeEach(() => {
  const dbPath = join(mkdtempSync(join(tmpdir(), "cg-sem-")), "index.sqlite");
  const db = openDb(dbPath);
  migrate(db);
  store = new Store(db);
});

function seedSymbol(path: string, qualifiedName: string, vector: number[]): void {
  store.upsertFile({ path, contentHash: "h", mtimeMs: 1, size: 1 });
  store.insertSymbols([{
    stableKey: `ts:${path}#${qualifiedName}`,
    filePath: path,
    qualifiedName,
    shortName: qualifiedName,
    kind: "class",
    signature: null,
    startByte: 0, endByte: 1, startLine: 1, endLine: 1,
    bodyHash: null, exported: true, isTest: false,
  }]);
  const id = store.symbolsNeedingEmbedding(EMBEDDING_MODEL)
    .find((s) => s.qualifiedName === qualifiedName)!.id;
  store.upsertEmbedding({
    symbolId: id,
    model: EMBEDDING_MODEL,
    dim: vector.length,
    vector: packVector(vector),
    inputHash: "x",
  });
}

describe("semanticSearch", () => {
  it("returns nothing when no embeddings are stored", async () => {
    // Enrichment is optional: with the table empty every caller must fall back
    // to deterministic retrieval unchanged (spec §13). The embedder must not
    // even be consulted.
    let called = false;
    const spy: Embedder = { embed: async () => { called = true; return []; } };
    expect(await semanticSearch(store, spy, "anything")).toEqual([]);
    expect(called).toBe(false);
  });

  it("ranks the nearest vector first", async () => {
    seedSymbol("a.ts", "Near", [1, 0]);
    seedSymbol("b.ts", "Far", [0, 1]);
    const hits = await semanticSearch(store, stubEmbedder([1, 0]), "q");
    expect(hits[0]!.stableKey).toBe("ts:a.ts#Near");
    expect(hits[0]!.score).toBeCloseTo(1);
  });

  it("honours the result limit", async () => {
    seedSymbol("a.ts", "One", [1, 0]);
    seedSymbol("b.ts", "Two", [0.9, 0.1]);
    expect(await semanticSearch(store, stubEmbedder([1, 0]), "q", 1))
      .toHaveLength(1);
  });

  it("drops embeddings when their symbol is deleted", async () => {
    seedSymbol("a.ts", "Gone", [1, 0]);
    store.deleteFile("a.ts");
    expect(await semanticSearch(store, stubEmbedder([1, 0]), "q")).toEqual([]);
  });
});
