import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { pythonAdapter } from "../../src/adapters/python/index.js";
import { getPythonParser } from "../../src/adapters/python/parser.js";
import type { ExtractResult, ReferenceRecord } from "../../src/adapters/types.js";
import { buildExportMap } from "../../src/link/exportmap.js";
import { resolveForFile } from "../../src/link/moduleResolver.js";
import { RepoBoundary } from "../../src/repo/boundary.js";
import { discover } from "../../src/repo/discover.js";
import { resolveAll } from "../../src/resolve/resolver.js";
import { runPyrightPass } from "../../src/resolve/pyrightPass.js";
import { migrate, openDb, Store, type Db } from "../../src/store/index.js";
import { loadTsConfig } from "../../src/tsconfig/load.js";

const SOURCE = [
  "class Registry:",
  "    def method(self):",
  "        return 1",
  "",
  "class Holder:",
  "    method_registry: Registry",
  "",
  "def use(holder: Holder):",
  "    return holder.method_registry.method()",
  "",
  "def builtin():",
  "    return len([])",
  "",
  "class Base:",
  "    pass",
  "",
  "class Child(Base):",
  "    pass",
  "",
].join("\n");

function pythonRepo(): string {
  const root = mkdtempSync(join(tmpdir(), "sonde-pypass-"));
  writeFileSync(join(root, "main.py"), SOURCE);
  return root;
}

function emptyStore(): { db: Db; store: Store } {
  const db = openDb(":memory:");
  migrate(db);
  return { db, store: new Store(db) };
}

async function populatedStore(root: string): Promise<{
  db: Db;
  store: Store;
  references: ReferenceRecord[];
}> {
  await getPythonParser();
  const boundary = new RepoBoundary(root);
  const files = discover(boundary, {
    extensions: new Set([".py", ".pyi"]),
  });
  const extracted = new Map<string, ExtractResult>(
    files.map((file) => [
      file.path,
      pythonAdapter.extract(file.path, boundary.readFile(file.path)),
    ]),
  );
  const cfg = loadTsConfig(boundary);
  const exportMap = buildExportMap(extracted, cfg, boundary, resolveForFile);
  const resolved = resolveAll(extracted, exportMap, cfg, boundary);
  const { db, store } = emptyStore();

  for (const file of files) {
    store.upsertFile({ ...file, language: "python" });
  }
  for (const [file, result] of extracted) {
    store.insertSymbols(
      result.symbols.map((symbol) => ({ ...symbol, filePath: file })),
    );
  }
  store.insertEdges(resolved.edges);
  store.insertExternal(resolved.external);
  store.insertUnresolved(resolved.unresolved);

  const references = [...extracted.values()].flatMap(
    (result) => result.references,
  );
  const forced = ["method", "Base"].map((name) => {
    const ref = references.find((candidate) => candidate.name === name);
    if (!ref) throw new Error(`fixture reference missing: ${name}`);
    return {
      srcKey: ref.fromSymbolKey,
      name: ref.name,
      kind: ref.kind,
      siteLine: ref.siteLine,
      candidateCount: 1,
      reason: "forced_for_pyright_test",
    };
  });
  store.insertUnresolved(forced);
  return { db, store, references };
}

describe("runPyrightPass", () => {
  it("returns null for a repository with no Python files", async () => {
    const root = mkdtempSync(join(tmpdir(), "sonde-nopy-"));
    writeFileSync(join(root, "a.ts"), "export const a = 1;\n");
    const { db, store } = emptyStore();
    try {
      await expect(runPyrightPass(root, store)).resolves.toBeNull();
    } finally {
      db.close();
    }
  }, 60_000);

  it("returns null when there are no unresolved or heuristic sites", async () => {
    const { db, store } = emptyStore();
    try {
      await expect(runPyrightPass(pythonRepo(), store)).resolves.toBeNull();
    } finally {
      db.close();
    }
  }, 60_000);

  it("returns an unavailable reason instead of rejecting on setup failure", async () => {
    const { db, store } = emptyStore();
    try {
      await expect(runPyrightPass("/nonexistent-repo-path", store)).resolves
        .toMatchObject({ unavailable: true, reason: expect.any(String) });
    } finally {
      db.close();
    }
  }, 60_000);

  it("reports NULL query lines instead of silently skipping them", async () => {
    const root = pythonRepo();
    const { db, store } = emptyStore();
    try {
      const boundary = new RepoBoundary(root);
      const [file] = discover(boundary, { extensions: new Set([".py"]) });
      if (!file) throw new Error("fixture file missing");
      store.upsertFile({ ...file, language: "python" });
      store.insertSymbols([
        {
          stableKey: "py:main.py#",
          filePath: "main.py",
          qualifiedName: "main.py",
          shortName: "main.py",
          kind: "file",
          signature: null,
          startByte: 0,
          endByte: SOURCE.length,
          startLine: 1,
          endLine: 19,
          bodyHash: null,
          exported: false,
          isTest: false,
        },
      ]);
      store.insertUnresolved([
        {
          srcKey: "py:main.py#",
          name: "missing",
          kind: "CALLS",
          siteLine: null,
          candidateCount: 0,
          reason: "missing_line",
        },
      ]);
      await expect(runPyrightPass(root, store)).resolves.toMatchObject({
        unavailable: true,
        reason: expect.stringMatching(/NULL site_line/),
      });
    } finally {
      db.close();
    }
  }, 60_000);

  it("promotes exact targets, preserves kinds, and externalizes typeshed", async () => {
    const root = pythonRepo();
    const { db, store } = await populatedStore(root);
    try {
      const result = await runPyrightPass(root, store);
      expect(result).toMatchObject({
        upgraded: 2,
        externalized: 1,
        unresolvedCleared: 3,
        extraUnresolvedCleared: 0,
        queries: 3,
        answered: 3,
        skippedNullSites: 0,
        unmatchedSites: 0,
        warnings: [],
      });
      expect(store.countUnresolved()).toBe(0);
      expect(store.countExternal()).toBe(1);
      expect(store.countReferenceSites("COMPILER")).toBe(2);
      expect(store.countReferenceSites("HEURISTIC")).toBe(0);
    } finally {
      db.close();
    }
  }, 60_000);
});
