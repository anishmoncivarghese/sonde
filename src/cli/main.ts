#!/usr/bin/env node

import { existsSync, rmSync } from "node:fs";
import { Command } from "commander";
import ts from "typescript";
import { getTsParser } from "../adapters/typescript/parser.js";
import { indexPathFor } from "../index/cache.js";
import { checkDrift } from "../index/drift.js";
import { indexRepo, updateRepo } from "../index/pipeline.js";
import { RepoBoundary } from "../repo/boundary.js";
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

const program = new Command();
program.name("codegraph").version("0.1.0");

program
  .command("index")
  .argument("[path]", "repository root", ".")
  .option("--json", "structured output")
  .action(async (path: string, options: { json?: boolean }) => {
    const stats = await indexRepo(path, indexPathFor(path));
    emit(
      options.json === true,
      stats,
      `indexed ${stats.filesIndexed} files, ${stats.symbols} symbols, ` +
        `${stats.edges} edges (${stats.external} external, ` +
        `${stats.unresolved} unresolved, ${stats.parseFailures} parse failures)`,
    );
  });

program
  .command("update")
  .argument("[path]", "repository root", ".")
  .option("--json", "structured output")
  .action(async (path: string, options: { json?: boolean }) => {
    const stats = await updateRepo(path, indexPathFor(path));
    emit(
      options.json === true,
      stats,
      `updated ${stats.filesIndexed} files (${stats.filesSkipped} unchanged)`,
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
      tscVersion: ts.version,
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

await program.parseAsync(process.argv);
