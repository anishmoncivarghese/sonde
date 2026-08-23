#!/usr/bin/env node

import { createHash } from "node:crypto";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { existsSync, rmSync } from "node:fs";
import { Command } from "commander";
import { getTsParser } from "../adapters/typescript/parser.js";
import { indexPathFor } from "../index/cache.js";
import { checkDrift } from "../index/drift.js";
import { indexRepo, updateRepo } from "../index/pipeline.js";
import { createServer } from "../mcp/server.js";
import { buildEnvelope } from "../pack/envelope.js";
import { packImpactResponse } from "../pack/impactpack.js";
import { ensureFresh, NoIndexError } from "../pack/refresh.js";
import { estimateJsonTokens } from "../pack/tokens.js";
import { findSymbols } from "../query/find.js";
import { queryGraph, type TraversePattern } from "../query/traverse.js";
import {
  createCompilerContext,
  TSC_VERSION,
} from "../resolve/compilerPass.js";
import { EMBEDDING_MODEL, hashInput, loadEmbedder } from "../enrich/embedder.js";
import { buildSymbolDocument, packVector } from "../enrich/vectors.js";
import { RepoBoundary } from "../repo/boundary.js";
import { gitState } from "../repo/git.js";
import {
  migrate,
  openDb,
  SchemaVersionError,
  Store,
} from "../store/index.js";
import { SCHEMA_VERSION } from "../version.js";

interface CountRow {
  symbols: number;
  edges: number;
  external: number;
  unresolved: number;
}

interface TierRow {
  tier: string;
  count: number;
}

function emit(json: boolean, value: unknown, human: string): void {
  console.log(json ? JSON.stringify(value, null, 2) : human);
}

function compilerIndexSummary(
  requested: boolean,
  upgraded: number | null,
): string {
  if (!requested) return "";
  return upgraded === null
    ? "; compiler tier unavailable (no usable tsconfig); edges remain LEXICAL/HEURISTIC"
    : `; compiler upgraded ${upgraded} edge(s)`;
}

function rootHash(boundary: RepoBoundary): string {
  return createHash("sha256")
    .update(boundary.root)
    .digest("hex")
    .slice(0, 16);
}

function unknownEnvelope(path: string, message: string) {
  const boundary = new RepoBoundary(path);
  return buildEnvelope({
    rootHash: rootHash(boundary),
    gitState: gitState(boundary),
    freshness: { state: "unknown", driftCount: 0, verified: [] },
    summary: message,
    results: [],
    warnings: [message],
    truncated: false,
    omittedCount: 0,
    estimatedTokens: 0,
  });
}

const program = new Command();
program.name("codegraph").version("0.1.0");

program
  .command("index")
  .argument("[path]", "repository root", ".")
  .option(
    "--resolve",
    "resolve edges with the TypeScript compiler (slower, more precise)",
  )
  .option("--json", "structured output")
  .action(async (
    path: string,
    options: { json?: boolean; resolve?: boolean },
  ) => {
    const stats = await indexRepo(path, indexPathFor(path), {
      resolve: options.resolve,
    });
    emit(
      options.json === true,
      stats,
      `indexed ${stats.filesIndexed} files, ${stats.symbols} symbols, ` +
        `${stats.edges} edges (${stats.external} external, ` +
        `${stats.unresolved} unresolved, ${stats.parseFailures} parse failures)` +
        compilerIndexSummary(
          options.resolve === true,
          stats.compilerUpgraded,
        ),
    );
  });

program
  .command("update")
  .argument("[path]", "repository root", ".")
  .option(
    "--resolve",
    "resolve edges with the TypeScript compiler (slower, more precise)",
  )
  .option("--json", "structured output")
  .action(async (
    path: string,
    options: { json?: boolean; resolve?: boolean },
  ) => {
    const stats = await updateRepo(path, indexPathFor(path), {
      resolve: options.resolve,
    });
    emit(
      options.json === true,
      stats,
      `updated ${stats.filesIndexed} files (${stats.filesSkipped} unchanged)` +
        compilerIndexSummary(
          options.resolve === true,
          stats.compilerUpgraded,
        ),
    );
  });

program
  .command("status")
  .argument("[path]", "repository root", ".")
  .option("--json", "structured output")
  .action((path: string, options: { json?: boolean }) => {
    const dbPath = indexPathFor(path);
    if (!existsSync(dbPath)) {
      emit(
        options.json === true,
        { freshness: { state: "unknown" } },
        "no index; run `codegraph index`",
      );
      return;
    }

    const db = openDb(dbPath);
    try {
      try {
        migrate(db);
      } catch (error) {
        if (!(error instanceof SchemaVersionError)) throw error;
        emit(
          options.json === true,
          { freshness: { state: "unknown" }, warning: error.message },
          error.message,
        );
        return;
      }

      const drift = checkDrift(new RepoBoundary(path), new Store(db));
      const counts = db
        .prepare(
          `SELECT
             (SELECT COUNT(*) FROM symbol) AS symbols,
             (SELECT COUNT(*) FROM edge) AS edges,
             (SELECT COUNT(*) FROM external_ref) AS external,
             (SELECT COUNT(*) FROM unresolved_ref) AS unresolved`,
        )
        .get() as CountRow;
      const edgeTiers = db
        .prepare(
          "SELECT tier, COUNT(*) AS count FROM edge GROUP BY tier ORDER BY tier",
        )
        .all() as TierRow[];
      const tiers: TierRow[] = [
        ...edgeTiers,
        { tier: "EXTERNAL", count: counts.external },
        { tier: "UNRESOLVED", count: counts.unresolved },
      ];
      const tierSummary = tiers
        .map(({ tier, count }) => `${tier}=${count}`)
        .join(", ");

      emit(
        options.json === true,
        { freshness: drift, counts, tiers, schemaVersion: SCHEMA_VERSION },
        `${drift.state} — drift ${drift.driftCount}; ${counts.symbols} symbols, ` +
          `${counts.edges} edges; tiers ${tierSummary}`,
      );
    } finally {
      db.close();
    }
  });

program
  .command("doctor")
  .argument("[path]", "repository root", ".")
  .option("--json", "structured output")
  .action(async (path: string, options: { json?: boolean }) => {
    let parser = "ok";
    try {
      await getTsParser();
    } catch (error) {
      parser = `failed: ${error instanceof Error ? error.message : String(error)}`;
    }

    let database = "ok";
    try {
      const db = openDb(":memory:");
      try {
        migrate(db);
      } finally {
        db.close();
      }
    } catch (error) {
      database = `failed: ${error instanceof Error ? error.message : String(error)}`;
    }

    const report = {
      parser,
      database,
      compilerAvailable: createCompilerContext(path) !== null,
      tscVersion: TSC_VERSION,
      tscSource: "bundled (repository TypeScript is never loaded — SEC-008)",
      schemaVersion: SCHEMA_VERSION,
      indexPath: indexPathFor(path),
      node: process.version,
    };
    emit(
      options.json === true,
      report,
      Object.entries(report)
        .map(([key, value]) => `${key}: ${value}`)
        .join("\n"),
    );
  });

program
  .command("embed")
  .argument("[path]", "repository root", ".")
  .option("--json", "structured output")
  .description("compute local embeddings for semantic search (optional)")
  .action(async (path: string, options: { json?: boolean }) => {
    const dbPath = indexPathFor(path);
    if (!existsSync(dbPath)) {
      emit(options.json === true, { error: "no index" },
        "no index; run `codegraph index` first");
      process.exitCode = 1;
      return;
    }
    const db = openDb(dbPath);
    migrate(db);
    const store = new Store(db);

    let embedder;
    try {
      embedder = await loadEmbedder();
    } catch (error) {
      // Invariant 8: degrade with a warning that says exactly how to fix it.
      const message = (error as Error).message;
      emit(options.json === true, { error: message }, message);
      process.exitCode = 1;
      db.close();
      return;
    }

    const pending = store.symbolsNeedingEmbedding(EMBEDDING_MODEL);
    const BATCH = 64;
    let embedded = 0;
    for (let start = 0; start < pending.length; start += BATCH) {
      const batch = pending.slice(start, start + BATCH);
      const documents = batch.map((symbol) =>
        buildSymbolDocument({
          qualifiedName: symbol.qualifiedName,
          kind: symbol.kind,
          signature: symbol.signature,
          documentation: null,
          path: symbol.path,
        }),
      );
      const vectors = await embedder.embed(documents);
      for (const [offset, vector] of vectors.entries()) {
        const symbol = batch[offset];
        if (!symbol) continue;
        store.upsertEmbedding({
          symbolId: symbol.id,
          model: EMBEDDING_MODEL,
          dim: vector.length,
          vector: packVector(vector),
          inputHash: hashInput(documents[offset] ?? ""),
        });
        embedded += 1;
      }
    }
    const total = store.countEmbeddings(EMBEDDING_MODEL);
    db.close();
    emit(options.json === true, { embedded, total, model: EMBEDDING_MODEL },
      `embedded ${embedded} symbol(s); ${total} total for ${EMBEDDING_MODEL}`);
  });

program
  .command("clean")
  .argument("[path]", "repository root", ".")
  .option("--json", "structured output")
  .action((path: string, options: { json?: boolean }) => {
    const dbPath = indexPathFor(path);
    const removed = existsSync(dbPath);
    for (const suffix of ["", "-shm", "-wal"]) {
      rmSync(`${dbPath}${suffix}`, { force: true });
    }
    emit(
      options.json === true,
      { removed, indexPath: dbPath },
      removed ? `removed ${dbPath}` : `no index at ${dbPath}`,
    );
  });

program
  .command("search")
  .argument("<query>", "search text")
  .argument("[path]", "repository root", ".")
  .option("--json", "structured output")
  .action(async (
    query: string,
    path: string,
    options: { json?: boolean },
  ) => {
    const boundary = new RepoBoundary(path);
    try {
      const state = await ensureFresh(path, indexPathFor(path));
      try {
        const results = findSymbols(state.db, { query });
        const envelope = buildEnvelope({
          rootHash: rootHash(boundary),
          gitState: gitState(boundary),
          freshness: state.freshness,
          summary: `${results.length} match(es)`,
          results,
          warnings: state.warnings,
          truncated: false,
          omittedCount: 0,
          estimatedTokens: estimateJsonTokens(results),
          tscVersion: state.compilerVersion,
        });
        emit(
          options.json === true,
          envelope,
          results.map((result) =>
            `${result.stableKey}  (${result.reason})`
          ).join("\n") || "no matches",
        );
      } finally {
        state.db.close();
      }
    } catch (error) {
      if (!(error instanceof NoIndexError || error instanceof SchemaVersionError)) {
        throw error;
      }
      const envelope = unknownEnvelope(path, error.message);
      emit(options.json === true, envelope, error.message);
    }
  });

program
  .command("query")
  .argument(
    "<pattern>",
    "callers_of|callees_of|references_to|imports_of|imported_by|" +
      "implementations_of|inheritors_of|inherits_from|tests_for|" +
      "contained_by|contains",
  )
  .argument("<symbol>", "stable_key, qualified name, or short name")
  .argument("[path]", "repository root", ".")
  .option("--json", "structured output")
  .action(async (
    pattern: string,
    symbol: string,
    path: string,
    options: { json?: boolean },
  ) => {
    const boundary = new RepoBoundary(path);
    try {
      const state = await ensureFresh(path, indexPathFor(path));
      try {
        const result = queryGraph(state.db, {
          pattern: pattern as TraversePattern,
          symbol,
        });
        const metadata = buildEnvelope({
          rootHash: rootHash(boundary),
          gitState: gitState(boundary),
          freshness: state.freshness,
          summary: `${result.compiler.length + result.lexical.length + result.heuristic.length} ` +
            "graph result(s)",
          results: [],
          warnings: pattern === "tests_for"
            ? [
                ...state.warnings,
                "structural TESTS edges indicate relatedness only and do not " +
                  "prove coverage",
              ]
            : state.warnings,
          truncated: result.truncated,
          omittedCount: 0,
          estimatedTokens: estimateJsonTokens(result),
          tscVersion: state.compilerVersion,
        });
        const { results: _results, ...envelopeMetadata } = metadata;
        const response = { ...envelopeMetadata, ...result };
        emit(
          options.json === true,
          response,
          `compiler=${result.compiler.length} lexical=${result.lexical.length} ` +
            `heuristic=${result.heuristic.length} ` +
            `external=${result.external.count} ` +
            `unresolved=${result.unresolved.count}`,
        );
      } finally {
        state.db.close();
      }
    } catch (error) {
      if (!(error instanceof NoIndexError || error instanceof SchemaVersionError)) {
        throw error;
      }
      const envelope = unknownEnvelope(path, error.message);
      emit(options.json === true, envelope, error.message);
    }
  });

program
  .command("impact")
  .argument("[path]", "repository root", ".")
  .option(
    "--symbol <name>",
    "seed symbol (repeatable)",
    (value: string, previous: string[]) => [...previous, value],
    [] as string[],
  )
  .option("--from-git-diff", "seed from the current working-tree diff")
  .option("--token-budget <n>", "token budget", (value: string) => Number(value))
  .option("--json", "structured output")
  .action(async (
    path: string,
    options: {
      symbol: string[];
      fromGitDiff?: boolean;
      tokenBudget?: number;
      json?: boolean;
    },
  ) => {
    const envelope = await packImpactResponse(
      path,
      indexPathFor(path),
      {
        symbols: options.symbol.length > 0 ? options.symbol : undefined,
        fromGitDiff: options.fromGitDiff,
      },
      options.tokenBudget ?? 8000,
    );
    emit(
      options.json === true,
      envelope,
      `${envelope.summary} (${envelope.freshness.state})`,
    );
  });

const mcp = program.command("mcp");
mcp
  .command("serve")
  .argument("[path]", "repository root", ".")
  .action(async (path: string) => {
    const server = createServer(path);
    await server.connect(new StdioServerTransport());
  });

await program.parseAsync(process.argv);
