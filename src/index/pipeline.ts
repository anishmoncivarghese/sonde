import type { Diagnostic, ExtractResult } from "../adapters/types.js";
import { typescriptAdapter } from "../adapters/typescript/index.js";
import { getTsParser } from "../adapters/typescript/parser.js";
import { buildExportMap } from "../link/exportmap.js";
import { RepoBoundary } from "../repo/boundary.js";
import { discover, type FileRecord } from "../repo/discover.js";
import { resolveAll } from "../resolve/resolver.js";
import { migrate, openDb, Store } from "../store/index.js";
import { loadTsConfig } from "../tsconfig/load.js";

export interface IndexStats {
  filesIndexed: number;
  filesSkipped: number;
  symbols: number;
  edges: number;
  external: number;
  unresolved: number;
  parseFailures: number;
}

function extractionFailure(error: unknown): Diagnostic[] {
  return [{
    severity: "error",
    message: error instanceof Error ? error.message : String(error),
    line: 1,
  }];
}

async function run(
  root: string,
  dbPath: string,
  incremental: boolean,
): Promise<IndexStats> {
  await getTsParser();
  const boundary = new RepoBoundary(root);
  const cfg = loadTsConfig(boundary);
  const db = openDb(dbPath);

  try {
    migrate(db);
    const store = new Store(db);
    const onDisk = discover(boundary).filter((file) =>
      typescriptAdapter.matches(file.path),
    );
    const known = new Map(store.allFiles().map((file) => [file.path, file]));
    const priorSymbols = store.allSymbolLocations();

    const changed: FileRecord[] = [];
    let skipped = 0;
    for (const file of onDisk) {
      const previous = known.get(file.path);
      if (
        incremental &&
        previous &&
        previous.contentHash === file.contentHash
      ) {
        skipped += 1;
      } else {
        changed.push(file);
      }
    }

    const onDiskPaths = new Set(onDisk.map((file) => file.path));
    const deleted = [...known.keys()].filter((path) => !onDiskPaths.has(path));
    const extracted = new Map<string, ExtractResult>();
    const failed = new Map<string, Diagnostic[]>();

    // Resolution is global, so unchanged files are re-extracted to rebuild the
    // link graph even though content-hash accounting marks them as skipped.
    for (const file of onDisk) {
      try {
        const result = typescriptAdapter.extract(
          file.path,
          boundary.readFile(file.path),
        );
        if (result.diagnostics.length > 0) {
          failed.set(file.path, result.diagnostics);
        } else {
          extracted.set(file.path, result);
        }
      } catch (error) {
        failed.set(file.path, extractionFailure(error));
      }
    }

    const previousNames = new Set(priorSymbols.map((symbol) => symbol.shortName));
    const failedPaths = new Set(failed.keys());
    const deletedPaths = new Set(deleted);
    const parseFailedNames = new Set(
      priorSymbols
        .filter((symbol) => failedPaths.has(symbol.filePath))
        .map((symbol) => symbol.shortName),
    );
    const deletedNames = new Set(
      priorSymbols
        .filter((symbol) => deletedPaths.has(symbol.filePath))
        .map((symbol) => symbol.shortName),
    );
    const exportMap = buildExportMap(extracted, cfg, boundary);
    const resolved = resolveAll(
      extracted,
      exportMap,
      cfg,
      boundary,
      incremental
        ? { previousNames, parseFailedNames, deletedNames }
        : undefined,
    );

    const stats: IndexStats = {
      filesIndexed: changed.length,
      filesSkipped: skipped,
      symbols: 0,
      edges: resolved.edges.length,
      external: resolved.external.length,
      unresolved: resolved.unresolved.length,
      parseFailures: failed.size,
    };

    store.transaction(() => {
      for (const path of deleted) store.deleteFile(path);
      for (const file of onDisk) {
        store.deleteFile(file.path);
        const diagnostics = failed.get(file.path);
        store.upsertFile({
          ...file,
          parseState: diagnostics ? "failed" : "ok",
          diagnostics: diagnostics ?? [],
        });
      }

      for (const [path, result] of extracted) {
        store.insertSymbols(result.symbols.map((symbol) => ({
          ...symbol,
          filePath: path,
        })));
        stats.symbols += result.symbols.length;
      }
      store.insertEdges(resolved.edges);
      store.insertExternal(resolved.external);
      store.insertUnresolved(resolved.unresolved);
    });

    return stats;
  } finally {
    db.close();
  }
}

export function indexRepo(root: string, dbPath: string): Promise<IndexStats> {
  return run(root, dbPath, false);
}

export function updateRepo(root: string, dbPath: string): Promise<IndexStats> {
  return run(root, dbPath, true);
}
