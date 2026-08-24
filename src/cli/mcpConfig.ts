import type { RepoBoundary } from "../repo/boundary.js";

export interface McpServerEntry {
  command: string;
  args: string[];
}

export type McpMergeResult =
  | { action: "create"; content: string }
  | { action: "merge"; content: string }
  | { action: "noop"; reason: "already-configured" }
  | { action: "conflict"; existing: McpServerEntry }
  | { action: "invalid-json"; error: string };

const MCP_CONFIG_PATH = ".mcp.json";

/** The canonical MCP server entry written by `sonde init`. */
export function sondeMcpEntry(): McpServerEntry {
  return { command: "sonde", args: ["mcp", "serve", "."] };
}

function entriesEqual(a: McpServerEntry, b: McpServerEntry): boolean {
  return a.command === b.command && JSON.stringify(a.args) === JSON.stringify(b.args);
}

/**
 * Pure: decides what would happen to `.mcp.json`, without touching disk.
 * `existingContent` is the file's current text, or null if it does not exist.
 */
export function planMcpMerge(existingContent: string | null): McpMergeResult {
  const wanted = sondeMcpEntry();

  if (existingContent === null) {
    return {
      action: "create",
      content: `${JSON.stringify({ mcpServers: { sonde: wanted } }, null, 2)}\n`,
    };
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(existingContent) as Record<string, unknown>;
  } catch (error) {
    return { action: "invalid-json", error: (error as Error).message };
  }

  const servers =
    (parsed.mcpServers as Record<string, McpServerEntry> | undefined) ?? {};
  const current = servers.sonde;

  if (current) {
    if (entriesEqual(current, wanted)) {
      return { action: "noop", reason: "already-configured" };
    }
    return { action: "conflict", existing: current };
  }

  const merged = {
    ...parsed,
    mcpServers: { ...servers, sonde: wanted },
  };
  return { action: "merge", content: `${JSON.stringify(merged, null, 2)}\n` };
}

/** Repository config I/O stays behind RepoBoundary (SEC-001/002/003). */
export function writeMcpConfig(
  boundary: RepoBoundary,
  content: string,
): void {
  boundary.writeFile(MCP_CONFIG_PATH, content);
}

export function readMcpConfigIfPresent(boundary: RepoBoundary): string | null {
  try {
    return boundary.readFile(MCP_CONFIG_PATH).toString("utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}
