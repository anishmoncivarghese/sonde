import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { indexPathFor } from "../../src/index/cache.js";
import { indexRepo } from "../../src/index/pipeline.js";
import { createServer } from "../../src/mcp/server.js";

let root: string;
let dbPath: string;
let client: Client;
let server: McpServer;
let originalHome: string | undefined;

function jsonResult(result: unknown): Record<string, unknown> {
  if (typeof result !== "object" || result === null || !("content" in result)) {
    throw new Error("tool call did not return content");
  }
  const content = result.content as Array<{ type: string; text?: string }>;
  return JSON.parse(content[0]?.text ?? "{}") as Record<string, unknown>;
}

beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), "cg-mcp-"));
  originalHome = process.env.HOME;
  process.env.HOME = root;
  mkdirSync(join(root, "src"));
  writeFileSync(join(root, "tsconfig.json"), "{}");
  writeFileSync(
    join(root, "src", "a.ts"),
    "export function refreshSession() {}\n" +
      "export function caller() { refreshSession(); }\n",
  );
  dbPath = indexPathFor(root);
  await indexRepo(root, dbPath);

  server = createServer(root);
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  client = new Client({ name: "test-client", version: "0.0.0" });
  await Promise.all([
    client.connect(clientTransport),
    server.connect(serverTransport),
  ]);
});

afterEach(async () => {
  await client.close();
  await server.close();
  if (originalHome === undefined) delete process.env.HOME;
  else process.env.HOME = originalHome;
  rmSync(root, { recursive: true, force: true });
});

describe("createServer", () => {
  it("lists exactly the three spec tools", async () => {
    const { tools } = await client.listTools();
    expect(tools.map((tool) => tool.name).sort()).toEqual([
      "find_symbols",
      "get_impact_radius",
      "query_graph",
    ]);
  });

  it("answers find_symbols with a fresh envelope", async () => {
    const result = await client.callTool({
      name: "find_symbols",
      arguments: { query: "refreshSession" },
    });
    const envelope = jsonResult(result);
    const results = envelope.results as Array<{ stableKey: string }>;

    expect((envelope.freshness as { state: string }).state).toBe("fresh");
    expect(results.some(({ stableKey }) =>
      stableKey.includes("refreshSession")
    )).toBe(true);
    expect(envelope.warnings).toEqual(
      expect.arrayContaining([expect.stringMatching(/COMPILER/)]),
    );
  });

  it("answers query_graph callers_of with evidence buckets", async () => {
    const result = await client.callTool({
      name: "query_graph",
      arguments: { pattern: "callers_of", symbol: "refreshSession" },
    });
    const response = jsonResult(result);
    const lexical = response.lexical as Array<{ qualifiedName: string }>;

    expect(lexical.some(({ qualifiedName }) => qualifiedName === "caller"))
      .toBe(true);
    expect((response.freshness as { state: string }).state).toBe("fresh");
  });

  it("answers get_impact_radius through the shared packer", async () => {
    const result = await client.callTool({
      name: "get_impact_radius",
      arguments: { symbols: ["refreshSession"], token_budget: 4000 },
    });
    const envelope = jsonResult(result);
    const results = envelope.results as Array<{ qualifiedName: string }>;

    expect(results.some(({ qualifiedName }) => qualifiedName === "caller"))
      .toBe(true);
    expect((envelope.freshness as { state: string }).state).toBe("fresh");
  });

  it("returns unknown rather than throwing when the index is absent", async () => {
    for (const suffix of ["", "-shm", "-wal"]) {
      rmSync(`${dbPath}${suffix}`, { force: true });
    }

    const result = await client.callTool({
      name: "find_symbols",
      arguments: { query: "refreshSession" },
    });
    const envelope = jsonResult(result);

    expect((envelope.freshness as { state: string }).state).toBe("unknown");
    expect(envelope.results).toEqual([]);
  });
});
