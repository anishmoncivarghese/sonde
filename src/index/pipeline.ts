import {
  adapterForPath,
  initializeAdapters,
} from "../adapters/registry.js";
import type {
  Diagnostic,
  ExtractResult,
  LanguageAdapter,
} from "../adapters/types.js";
import { buildExportMap } from "../link/exportmap.js";
import { resolveForFile } from "../link/moduleResolver.js";
import { RepoBoundary } from "../repo/boundary.js";
import { discover, type FileRecord } from "../repo/discover.js";
import { resolveAll } from "../resolve/resolver.js";
import { runCompilerPass } from "../resolve/compilerPass.js";
import { runPyrightPass } from "../resolve/pyrightPass.js";
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
  compilerUpgraded: number | null;
  warnings: string[];
}

export interface IndexOptions {
  resolve?: boolean;
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
  options: IndexOptions,
): Promise<IndexStats> {
  const boundary = new RepoBoundary(root);
  const cfg = loadTsConfig(boundary);
  const db = openDb(dbPath);

  try {
    migrate(db);
    const store = new Store(db);
    const adaptersByPath = new Map<string, LanguageAdapter>();
    const onDisk = discover(boundary).filter((file) => {
      const adapter = adapterForPath(file.path);
      if (!adapter) return false;
      adaptersByPath.set(file.path, adapter);
      return true;
    });
    await initializeAdapters(adaptersByPath.values());
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
        const adapter = adaptersByPath.get(file.path);
        if (!adapter) continue;
        const result = adapter.extract(
          file.path,
          boundary.readFile(file.path),
        );
        // Keep whatever tree-sitter recovered, AND record the diagnostic.
        //
        // Discarding the file outright cost far more than it protected: error
        // recovery is local, so a single bad expression corrupts a few hundred
        // bytes rather than a file. On a 376-file Swift corpus, 30 files were
        // flagged while only 0.08% of source bytes sat inside ERROR nodes, and
        // 955 declarations were being thrown away. On Hono it silently emptied
        // eight files — including src/context.ts, src/types.ts and
        // src/utils/body.ts — from every graph we published accuracy figures
        // against.
        //
        // Invariant 8 asks for degradation with a warning, not for discarding
        // good data to avoid admitting a partial parse.
        if (result.diagnostics.length > 0) {
          failed.set(file.path, result.diagnostics);
        }
        extracted.set(file.path, result);
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
    const exportMap = buildExportMap(
      extracted,
      cfg,
      boundary,
      resolveForFile,
    );
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
      compilerUpgraded: null,
      warnings: [],
    };

    store.transaction(() => {
      for (const path of deleted) store.deleteFile(path);
      for (const file of onDisk) {
        store.deleteFile(file.path);
        const diagnostics = failed.get(file.path);
        // 'partial': tree-sitter recovered at least one REAL declaration
        // despite diagnostics. 'failed': nothing was recovered at all --
        // either the catch branch ran, or the file parsed with errors but
        // yielded no usable declarations. The adapter's own file-level
        // symbol (kind: "file") is unconditionally present in every
        // ExtractResult regardless of content quality, so symbols.length
        // alone is always >= 1 and cannot distinguish the two cases; this
        // excludes it explicitly. tree-sitter does not throw on malformed
        // source either, so "the try branch didn't throw" was never the
        // right signal to begin with.
        const recoveredSymbols = (extracted.get(file.path)?.symbols ?? [])
          .some((symbol) => symbol.kind !== "file");
        const parseState = !diagnostics
          ? "ok"
          : recoveredSymbols
            ? "partial"
            : "failed";
        store.upsertFile({ ...file, parseState, diagnostics: diagnostics ?? [] });
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
      // Any deterministic rebuild removes prior compiler promotions. The
      // version is restored below only when this invocation completes a fresh
      // compiler pass; inline refresh therefore discloses its downgrade.
      store.setCompilerVersion(null);
      store.setPyrightVersion(null);
    });

    // The deterministic index is already committed. Compiler resolution is an
    // opt-in promotion pass, so its unavailability can never roll back or
    // invalidate the usable tree-sitter graph (invariant 8).
    if (options.resolve) {
      const compilerResult = runCompilerPass(root, store);
      stats.compilerUpgraded = compilerResult?.upgraded ?? null;
      if (compilerResult) {
        store.setCompilerVersion(compilerResult.tscVersion);
        stats.edges = Object.values(store.tierCounts()).reduce(
          (total, count) => total + count,
          0,
        );
        // The pass clears unresolved records it has placed, so the figure taken
        // during RESOLVE is stale by exactly the number of references the
        // compiler rescued — it understated the benefit of --resolve.
        stats.unresolved = store.countUnresolved();
      }

      // Python remains deliberately unregistered until its measured placement
      // gate passes. The pass still runs here so registration, if earned, does
      // not require another pipeline change (spec §3.2).
      const pyrightResult = await runPyrightPass(root, store);
      if (pyrightResult && "unavailable" in pyrightResult) {
        stats.warnings.push(
          `pyright COMPILER tier unavailable: ${pyrightResult.reason}`,
        );
      } else if (pyrightResult) {
        stats.compilerUpgraded =
          (stats.compilerUpgraded ?? 0) + pyrightResult.upgraded;
        stats.warnings.push(...pyrightResult.warnings);
        store.setPyrightVersion(pyrightResult.pyrightVersion);
        stats.edges = Object.values(store.tierCounts()).reduce(
          (total, count) => total + count,
          0,
        );
        stats.external = store.countExternal();
        stats.unresolved = store.countUnresolved();
      }
    }

    return stats;
  } finally {
    db.close();
  }
}

export function indexRepo(
  root: string,
  dbPath: string,
  options: IndexOptions = {},
): Promise<IndexStats> {
  return run(root, dbPath, false, options);
}

export function updateRepo(
  root: string,
  dbPath: string,
  options: IndexOptions = {},
): Promise<IndexStats> {
  return run(root, dbPath, true, options);
}
