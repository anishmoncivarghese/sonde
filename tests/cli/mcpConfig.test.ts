import { describe, expect, it } from "vitest";
import { planMcpMerge, sondeMcpEntry } from "../../src/cli/mcpConfig.js";

describe("planMcpMerge", () => {
  it("creates a fresh file when none exists", () => {
    const result = planMcpMerge(null);
    expect(result.action).toBe("create");
    if (result.action !== "create") throw new Error("unreachable");
    const parsed = JSON.parse(result.content);
    expect(parsed).toEqual({ mcpServers: { sonde: sondeMcpEntry() } });
  });

  it("merges into an existing file that has other servers, untouched", () => {
    const existing = JSON.stringify({
      mcpServers: { other: { command: "other-tool", args: ["serve"] } },
    });
    const result = planMcpMerge(existing);
    expect(result.action).toBe("merge");
    if (result.action !== "merge") throw new Error("unreachable");
    const parsed = JSON.parse(result.content);
    expect(parsed.mcpServers.other).toEqual({
      command: "other-tool",
      args: ["serve"],
    });
    expect(parsed.mcpServers.sonde).toEqual(sondeMcpEntry());
  });

  it("merges into an existing file with top-level keys other than mcpServers, untouched", () => {
    const existing = JSON.stringify({
      someOtherTopLevelSetting: true,
      mcpServers: {},
    });
    const result = planMcpMerge(existing);
    if (result.action !== "merge") throw new Error("unreachable");
    const parsed = JSON.parse(result.content);
    expect(parsed.someOtherTopLevelSetting).toBe(true);
  });

  it("is a no-op when the sonde entry already matches exactly", () => {
    const existing = JSON.stringify({
      mcpServers: { sonde: sondeMcpEntry() },
    });
    const result = planMcpMerge(existing);
    expect(result).toEqual({ action: "noop", reason: "already-configured" });
  });

  it("reports a conflict rather than overwriting a different sonde entry", () => {
    const existing = JSON.stringify({
      mcpServers: {
        sonde: { command: "/some/custom/path", args: ["mcp", "serve"] },
      },
    });
    const result = planMcpMerge(existing);
    expect(result.action).toBe("conflict");
    if (result.action !== "conflict") throw new Error("unreachable");
    expect(result.existing.command).toBe("/some/custom/path");
  });

  it("refuses to guess at malformed JSON rather than overwriting it", () => {
    const result = planMcpMerge("{ this is not json");
    expect(result.action).toBe("invalid-json");
  });

  it("handles a file that is valid JSON but has no mcpServers key at all", () => {
    const result = planMcpMerge(JSON.stringify({ unrelated: "config" }));
    if (result.action !== "merge") throw new Error("unreachable");
    const parsed = JSON.parse(result.content);
    expect(parsed.unrelated).toBe("config");
    expect(parsed.mcpServers.sonde).toEqual(sondeMcpEntry());
  });
});
