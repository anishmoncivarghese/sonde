import { createHash } from "node:crypto";
import {
  getImpactRadius,
  type ImpactParams,
  type ImpactRow,
} from "../query/impact.js";
import { RepoBoundary } from "../repo/boundary.js";
import { gitState } from "../repo/git.js";
import { SchemaVersionError, type Db } from "../store/index.js";
import { buildEnvelope, type Envelope } from "./envelope.js";
import { ensureFresh, NoIndexError } from "./refresh.js";
import { packToBudget } from "./tokens.js";

export interface ImpactResultRow extends ImpactRow {
  partialBody?: boolean;
}

const TEST_CAVEAT =
  "structural TESTS edges indicate relatedness only and do not prove coverage";

function repositoryHash(boundary: RepoBoundary): string {
  return createHash("sha256")
    .update(boundary.root)
    .digest("hex")
    .slice(0, 16);
}

function unresolvedCount(db: Db): number {
  const row = db
    .prepare("SELECT COUNT(*) AS count FROM unresolved_ref")
    .get() as { count: number };
  return row.count;
}

export async function packImpactResponse(
  root: string,
  dbPath: string,
  params: ImpactParams,
  budgetTokens: number,
): Promise<Envelope<ImpactResultRow>> {
  const boundary = new RepoBoundary(root);
  const rootHash = repositoryHash(boundary);

  let state;
  try {
    state = await ensureFresh(root, dbPath);
  } catch (error) {
    if (error instanceof NoIndexError || error instanceof SchemaVersionError) {
      return buildEnvelope({
        rootHash,
        gitState: gitState(boundary),
        freshness: { state: "unknown", driftCount: 0, verified: [] },
        summary: error.message,
        results: [],
        warnings: [error.message, TEST_CAVEAT],
        truncated: false,
        omittedCount: 0,
        estimatedTokens: 0,
      });
    }
    throw error;
  }

  try {
    const impact = getImpactRadius(state.db, boundary, params);
    const unresolved = unresolvedCount(state.db);
    const sections = impact.affected.map((row, index) => ({
      id: row.stableKey,
      // The first ranked impact row is the result-level reservation. Source
      // bodies are not fetched yet because ImpactRow has no byte ranges; when
      // that contract expands, verifySymbolBody is the required read seam.
      priority: index === 0 ? 0 : 1,
      // The client receives this row pretty-printed at indent:2 inside the
      // full envelope (mcp/server.ts's jsonContent, cli/main.ts's emit), not
      // as compact JSON — a compact estimate here would understate what the
      // token_budget this packing enforces actually has to cover.
      text: JSON.stringify(row, null, 2),
    }));
    const packed = packToBudget(sections, budgetTokens);
    const included = new Set(packed.included);
    const results = impact.affected.filter((row) =>
      included.has(row.stableKey)
    );

    return buildEnvelope({
      rootHash,
      gitState: gitState(boundary),
      freshness: state.freshness,
      summary: `${results.length} affected symbol(s) from ` +
        `${impact.seeds.length} seed(s)`,
      results,
      warnings: [
        ...state.warnings,
        ...impact.warnings,
        TEST_CAVEAT,
        `impact completeness caveat: ${unresolved} unresolved reference(s) ` +
          "remain in the index",
      ],
      truncated: impact.truncated || packed.truncated,
      omittedCount: impact.affected.length - results.length,
      estimatedTokens: packed.estimatedTokens,
      tscVersion: state.compilerVersion,
    });
  } finally {
    state.db.close();
  }
}
