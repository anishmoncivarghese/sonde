import { describe, expect, it } from "vitest";
import { buildEnvelope } from "../../src/pack/envelope.js";

describe("buildEnvelope", () => {
  it("assembles the spec section 7.6 response shape", () => {
    const envelope = buildEnvelope({
      rootHash: "abc123",
      gitState: { revision: "deadbeef", dirty: false },
      freshness: { state: "fresh", driftCount: 0, verified: [] },
      summary: "1 result",
      results: [{ ok: true }],
      warnings: ["existing warning"],
      truncated: false,
      omittedCount: 0,
      estimatedTokens: 42,
    });

    expect(envelope).toMatchObject({
      schemaVersion: 1,
      repository: {
        rootHash: "abc123",
        revision: "deadbeef",
        dirty: false,
      },
      freshness: { state: "fresh", driftCount: 0, verified: [] },
      summary: "1 result",
      results: [{ ok: true }],
      diagnostics: {
        truncated: false,
        omittedCount: 0,
        estimatedTokens: 42,
        tscVersion: null,
      },
    });
    expect(envelope.warnings).toContain("existing warning");
    expect(envelope.warnings).toContainEqual(
      expect.stringMatching(/COMPILER/),
    );
  });

  it("preserves unknown git dirtiness and warns instead of claiming clean", () => {
    const envelope = buildEnvelope({
      rootHash: "abc123",
      gitState: { revision: null, dirty: null },
      freshness: { state: "unknown", driftCount: 0, verified: [] },
      summary: "no index",
      results: [],
      warnings: [],
      truncated: false,
      omittedCount: 0,
      estimatedTokens: 0,
    });

    expect(envelope.repository.dirty).toBeNull();
    expect(envelope.warnings).toContainEqual(expect.stringMatching(/git/i));
  });

  it("reports compiler provenance without an unavailable warning", () => {
    const envelope = buildEnvelope({
      rootHash: "abc123",
      gitState: { revision: "deadbeef", dirty: false },
      freshness: { state: "fresh", driftCount: 0, verified: [] },
      summary: "resolved",
      results: [],
      warnings: [],
      truncated: false,
      omittedCount: 0,
      estimatedTokens: 0,
      tscVersion: "5.9.2",
    });

    expect(envelope.diagnostics.tscVersion).toBe("5.9.2");
    expect(envelope.warnings).not.toContainEqual(
      expect.stringMatching(/COMPILER-tier resolution is unavailable/),
    );
  });
});
