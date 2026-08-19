import { existsSync } from "node:fs";
import { AUTO_REFRESH_LIMIT, checkDrift } from "../index/drift.js";
import { updateRepo } from "../index/pipeline.js";
import { RepoBoundary } from "../repo/boundary.js";
import {
  migrate,
  openDb,
  Store,
  type Db,
} from "../store/index.js";

export class NoIndexError extends Error {
  constructor(dbPath: string) {
    super(`no index at ${dbPath}; run "codegraph index" first`);
    this.name = "NoIndexError";
  }
}

export interface ReadState {
  db: Db;
  freshness: {
    state: "fresh" | "refreshed" | "partial";
    driftCount: number;
    verified: string[];
  };
  warnings: string[];
}

const INLINE_REFRESH_WARNING =
  "index was refreshed inline; refreshed edges stay LEXICAL/HEURISTIC " +
  "because the compiler upgrade pass does not run on the inline refresh " +
  "path (spec §8.4)";

function partialWarning(driftCount: number): string {
  if (driftCount > AUTO_REFRESH_LIMIT) {
    return `index is partial: ${driftCount} drifted file(s) exceed the ` +
      `${AUTO_REFRESH_LIMIT}-file auto-refresh limit; run ` +
      '"codegraph update" to refresh';
  }
  return `index is partial because a prior parse failure is still recorded ` +
    `(drift count: ${driftCount}); fix the source and run ` +
    '"codegraph update" to refresh';
}

function openCompatibleDb(dbPath: string): Db {
  const db = openDb(dbPath);
  try {
    migrate(db);
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}

/** Guarantee B: detect repository-wide structural drift before every read. */
export async function ensureFresh(
  root: string,
  dbPath: string,
): Promise<ReadState> {
  if (!existsSync(dbPath)) throw new NoIndexError(dbPath);

  const boundary = new RepoBoundary(root);
  let db = openCompatibleDb(dbPath);
  let drift;
  try {
    drift = checkDrift(boundary, new Store(db), AUTO_REFRESH_LIMIT);
  } catch (error) {
    db.close();
    throw error;
  }

  if (drift.state === "fresh") {
    return {
      db,
      freshness: { state: "fresh", driftCount: 0, verified: [] },
      warnings: [],
    };
  }

  if (drift.state === "partial") {
    return {
      db,
      freshness: {
        state: "partial",
        driftCount: drift.driftCount,
        verified: [],
      },
      warnings: [partialWarning(drift.driftCount)],
    };
  }

  db.close();
  await updateRepo(root, dbPath);
  db = openCompatibleDb(dbPath);
  let afterRefresh;
  try {
    afterRefresh = checkDrift(
      boundary,
      new Store(db),
      AUTO_REFRESH_LIMIT,
    );
  } catch (error) {
    db.close();
    throw error;
  }

  if (afterRefresh.state !== "fresh") {
    const warning = afterRefresh.state === "partial"
      ? partialWarning(afterRefresh.driftCount)
      : `repository changed during inline refresh; ` +
        `${afterRefresh.driftCount} file(s) still drifted; run ` +
        '"codegraph update" to refresh';
    return {
      db,
      freshness: {
        state: "partial",
        driftCount: afterRefresh.driftCount,
        verified: [],
      },
      warnings: [INLINE_REFRESH_WARNING, warning],
    };
  }

  return {
    db,
    freshness: {
      state: "refreshed",
      driftCount: drift.driftCount,
      verified: drift.driftedPaths,
    },
    warnings: [INLINE_REFRESH_WARNING],
  };
}
