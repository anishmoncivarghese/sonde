import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { indexRepo } from "../../src/index/pipeline.js";
import { packImpactResponse } from "../../src/pack/impactpack.js";
import { estimateTokens } from "../../src/pack/tokens.js";
import { migrate, openDb } from "../../src/store/index.js";

let root: string;
let dbPath: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "cg-impactpack-"));
  mkdirSync(join(root, "src"));
  writeFileSync(join(root, "tsconfig.json"), "{}");
  writeFileSync(
    join(root, "src", "a.ts"),
    "export function base() {}\n" +
      "export function topA() { base(); }\n" +
      "export function topB() { base(); }\n",
  );
  dbPath = join(root, "index.sqlite");
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

describe("packImpactResponse", () => {
  it("returns a fresh envelope containing the seed's callers", async () => {
    await indexRepo(root, dbPath);

    const envelope = await packImpactResponse(
      root,
      dbPath,
      { symbols: ["base"] },
      4000,
    );

    expect(envelope.freshness.state).toBe("fresh");
    expect(envelope.results.map((row) => row.qualifiedName))
      .toEqual(expect.arrayContaining(["topA", "topB"]));
    expect(envelope.summary).toContain("2 affected symbol(s)");
    expect(envelope.diagnostics.truncated).toBe(false);
    expect(envelope.warnings).toContainEqual(
      expect.stringMatching(/do not prove coverage/i),
    );
    expect(envelope.warnings).toContainEqual(
      expect.stringMatching(/unresolved reference/i),
    );
  });

  it("returns an unknown envelope instead of throwing when no index exists", async () => {
    const envelope = await packImpactResponse(
      root,
      dbPath,
      { symbols: ["base"] },
      4000,
    );

    expect(envelope.freshness.state).toBe("unknown");
    expect(envelope.results).toEqual([]);
    expect(envelope.warnings).toContainEqual(
      expect.stringMatching(/sonde index/),
    );
  });

  it("returns an unknown envelope for an incompatible index schema", async () => {
    await indexRepo(root, dbPath);
    const db = openDb(dbPath);
    try {
      migrate(db);
      db.prepare("UPDATE meta SET value = '999' WHERE key = 'schema_version'")
        .run();
    } finally {
      db.close();
    }

    const envelope = await packImpactResponse(
      root,
      dbPath,
      { symbols: ["base"] },
      4000,
    );

    expect(envelope.freshness.state).toBe("unknown");
    expect(envelope.results).toEqual([]);
    expect(envelope.warnings).toContainEqual(
      expect.stringMatching(/schema version/i),
    );
  });

  it("estimates tokens from the indent:2 payload actually transmitted", async () => {
    await indexRepo(root, dbPath);

    const envelope = await packImpactResponse(
      root,
      dbPath,
      { symbols: ["base"] },
      4000,
    );

    // A compact-JSON estimate would understate what jsonContent/emit
    // actually send (JSON.stringify(..., null, 2)) — the bug this guards.
    const compactEstimate = estimateTokens(JSON.stringify(envelope.results));
    expect(envelope.diagnostics.estimatedTokens).toBeGreaterThan(
      compactEstimate,
    );
  });

  it("reports budget omissions while retaining the reserved first result", async () => {
    await indexRepo(root, dbPath);

    const envelope = await packImpactResponse(
      root,
      dbPath,
      { symbols: ["base"] },
      0,
    );

    expect(envelope.results).toHaveLength(1);
    expect(envelope.diagnostics.truncated).toBe(true);
    expect(envelope.diagnostics.omittedCount).toBe(1);
  });
});
