import { createHash } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { indexPathFor } from "../index/cache.js";
import { buildEnvelope } from "../pack/envelope.js";
import { packImpactResponse } from "../pack/impactpack.js";
import { ensureFresh, NoIndexError } from "../pack/refresh.js";
import { estimateJsonTokens } from "../pack/tokens.js";
import { findSymbols } from "../query/find.js";
import { queryGraph, type TraverseResult } from "../query/traverse.js";
import { RepoBoundary } from "../repo/boundary.js";
import { gitState, type GitState } from "../repo/git.js";
import { SchemaVersionError } from "../store/index.js";
import { PACKAGE_VERSION } from "../version.js";
import {
  findSymbolsSchema,
  getImpactRadiusSchema,
  queryGraphSchema,
} from "./schemas.js";

const DEFAULT_TOKEN_BUDGET = 8000;
const TEST_CAVEAT =
  "structural TESTS edges indicate relatedness only and do not prove coverage";

function jsonContent(value: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
  };
}

function hashRoot(boundary: RepoBoundary): string {
  return createHash("sha256")
    .update(boundary.root)
    .digest("hex")
    .slice(0, 16);
}

function unknownEnvelope(
  rootHash: string,
  repositoryState: GitState,
  message: string,
) {
  return buildEnvelope({
    rootHash,
    gitState: repositoryState,
    freshness: { state: "unknown", driftCount: 0, verified: [] },
    summary: message,
    results: [],
    warnings: [message],
    truncated: false,
    omittedCount: 0,
    estimatedTokens: 0,
  });
}

function graphResponse(
  result: TraverseResult,
  rootHash: string,
  repositoryState: GitState,
  freshness: { state: string; driftCount: number; verified: string[] },
  warnings: string[],
  compilerVersion: string | null,
) {
  const envelope = buildEnvelope({
    rootHash,
    gitState: repositoryState,
    freshness,
    summary: `${result.compiler.length + result.lexical.length + result.heuristic.length} ` +
      "graph result(s)",
    results: [],
    warnings,
    truncated: result.truncated,
    omittedCount: 0,
    estimatedTokens: estimateJsonTokens(result),
    tscVersion: compilerVersion,
  });
  const { results: _results, ...metadata } = envelope;
  return { ...metadata, ...result };
}

export function createServer(root: string): McpServer {
  const boundary = new RepoBoundary(root);
  const rootHash = hashRoot(boundary);
  const server = new McpServer({ name: "sonde", version: PACKAGE_VERSION });

  server.registerTool(
    "find_symbols",
    {
      title: "Find symbols",
      description:
        "Seed retrieval over the indexed symbol graph: exact qualified name, " +
        "then exact short name, then full-text search. Returns signatures " +
        "only, never source bodies.",
      inputSchema: findSymbolsSchema,
    },
    async (params) => {
      try {
        const state = await ensureFresh(root, indexPathFor(root));
        try {
          const results = findSymbols(state.db, params);
          return jsonContent(buildEnvelope({
            rootHash,
            gitState: gitState(boundary),
            freshness: state.freshness,
            summary: `${results.length} match(es)`,
            results,
            warnings: state.warnings,
            truncated: false,
            omittedCount: 0,
            estimatedTokens: estimateJsonTokens(results),
            tscVersion: state.compilerVersion,
          }));
        } finally {
          state.db.close();
        }
      } catch (error) {
        if (error instanceof NoIndexError || error instanceof SchemaVersionError) {
          return jsonContent(
            unknownEnvelope(rootHash, gitState(boundary), error.message),
          );
        }
        throw error;
      }
    },
  );

  server.registerTool(
    "query_graph",
    {
      title: "Query graph",
      description:
        "Structural traversal for callers, callees, imports, inheritance, " +
        "tests, and containment, bucketed by evidence tier. Structural test " +
        "edges indicate relatedness, never proof of coverage.",
      inputSchema: queryGraphSchema,
    },
    async (params) => {
      try {
        const state = await ensureFresh(root, indexPathFor(root));
        try {
          const result = queryGraph(state.db, params);
          const warnings = params.pattern === "tests_for"
            ? [...state.warnings, TEST_CAVEAT]
            : state.warnings;
          return jsonContent(graphResponse(
            result,
            rootHash,
            gitState(boundary),
            state.freshness,
            warnings,
            state.compilerVersion,
          ));
        } finally {
          state.db.close();
        }
      } catch (error) {
        if (error instanceof NoIndexError || error instanceof SchemaVersionError) {
          return jsonContent(
            unknownEnvelope(rootHash, gitState(boundary), error.message),
          );
        }
        throw error;
      }
    },
  );

  server.registerTool(
    "get_impact_radius",
    {
      title: "Get impact radius",
      description:
        "Reverse-traverse calls, references, implementations, and inheritance " +
        "from symbols or the current git diff to a token budget. Structural " +
        "test edges indicate relatedness, never proof of coverage.",
      inputSchema: getImpactRadiusSchema,
    },
    async (params) => jsonContent(await packImpactResponse(
      root,
      indexPathFor(root),
      {
        symbols: params.symbols,
        fromGitDiff: params.from_git_diff,
      },
      params.token_budget ?? DEFAULT_TOKEN_BUDGET,
    )),
  );

  return server;
}
