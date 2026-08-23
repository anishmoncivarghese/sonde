import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let root: string;
let cacheHome: string;

const cli = (...args: string[]): string =>
  execFileSync(
    process.execPath,
    ["--import", "tsx", "src/cli/main.ts", ...args],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      env: { ...process.env, HOME: cacheHome },
    },
  );

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "cg-cli-repo-"));
  cacheHome = mkdtempSync(join(tmpdir(), "cg-cli-home-"));
  mkdirSync(join(root, "src"));
  writeFileSync(join(root, "tsconfig.json"), "{}");
  writeFileSync(join(root, "src", "a.ts"), "export function a() {}");
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
  rmSync(cacheHome, { recursive: true, force: true });
});

describe("cli", () => {
  it("indexes and prints JSON stats", () => {
    const out = JSON.parse(cli("index", root, "--json")) as {
      filesIndexed: number;
    };
    expect(out.filesIndexed).toBe(1);
  });

  it("reports fresh status after indexing", () => {
    cli("index", root, "--json");
    const out = JSON.parse(cli("status", root, "--json")) as {
      freshness: { state: string };
    };
    expect(out.freshness.state).toBe("fresh");
  });

  it("reports drift after a source change", () => {
    cli("index", root, "--json");
    writeFileSync(
      join(root, "src", "a.ts"),
      "export function a() { return 1; }",
    );
    const out = JSON.parse(cli("status", root, "--json")) as {
      freshness: { driftCount: number };
    };
    expect(out.freshness.driftCount).toBe(1);
  });

  it("doctor reports parser and database health", () => {
    const out = JSON.parse(cli("doctor", root, "--json")) as {
      parser: string;
      database: string;
      compilerAvailable: boolean;
      tscVersion: string;
    };
    expect(out.parser).toBe("ok");
    expect(out.database).toBe("ok");
    expect(out.compilerAvailable).toBe(true);
    expect(out.tscVersion).toMatch(/^\d+\.\d+/);
  });

  it("passes --resolve through to indexing", () => {
    const out = JSON.parse(cli("index", root, "--resolve", "--json")) as {
      compilerUpgraded: number | null;
    };
    expect(out.compilerUpgraded).toBe(0);
  });

  it("warns visibly when --resolve has no usable tsconfig", () => {
    rmSync(join(root, "tsconfig.json"));
    const out = cli("index", root, "--resolve");
    expect(out).toContain(
      "compiler tier unavailable (no usable tsconfig); edges remain LEXICAL/HEURISTIC",
    );
  });

  it("updates an index and cleans it from the cache", () => {
    cli("index", root, "--json");
    writeFileSync(
      join(root, "src", "a.ts"),
      "export function a() { return 1; }",
    );

    const update = JSON.parse(cli("update", root, "--json")) as {
      filesIndexed: number;
    };
    expect(update.filesIndexed).toBe(1);

    const clean = JSON.parse(cli("clean", root, "--json")) as {
      removed: boolean;
    };
    expect(clean.removed).toBe(true);

    const status = JSON.parse(cli("status", root, "--json")) as {
      freshness: { state: string };
    };
    expect(status.freshness.state).toBe("unknown");
  });

  it("search finds a symbol by name", () => {
    cli("index", root, "--json");

    const out = JSON.parse(cli("search", "a", root, "--json")) as {
      freshness: { state: string };
      results: Array<{ stableKey: string }>;
    };

    expect(out.freshness.state).toBe("fresh");
    expect(out.results.some(({ stableKey }) => stableKey.endsWith("#a")))
      .toBe(true);
  });

  it("search refreshes a small source change before answering", () => {
    cli("index", root, "--json");
    writeFileSync(
      join(root, "src", "a.ts"),
      "export function a() {}\nexport function added() {}\n",
    );

    const out = JSON.parse(cli("search", "added", root, "--json")) as {
      freshness: { state: string };
      results: Array<{ stableKey: string }>;
    };

    expect(out.freshness.state).toBe("refreshed");
    expect(out.results.some(({ stableKey }) => stableKey.endsWith("#added")))
      .toBe(true);
  });

  it("query answers callees_of", () => {
    writeFileSync(
      join(root, "src", "a.ts"),
      "export function a() { b(); }\nexport function b() {}\n",
    );
    cli("index", root, "--json");

    const out = JSON.parse(
      cli("query", "callees_of", "a", root, "--json"),
    ) as {
      freshness: { state: string };
      lexical: Array<{ qualifiedName: string }>;
    };

    expect(out.freshness.state).toBe("fresh");
    expect(out.lexical.some(({ qualifiedName }) => qualifiedName === "b"))
      .toBe(true);
  });

  it("impact reports affected symbols for a seed", () => {
    writeFileSync(
      join(root, "src", "a.ts"),
      "export function a() {}\nexport function caller() { a(); }\n",
    );
    cli("index", root, "--json");

    const out = JSON.parse(
      cli("impact", root, "--symbol", "a", "--json"),
    ) as {
      freshness: { state: string };
      results: Array<{ qualifiedName: string }>;
    };

    expect(out.freshness.state).toBe("fresh");
    expect(out.results.some(({ qualifiedName }) => qualifiedName === "caller"))
      .toBe(true);
  });

  it("registers the long-lived mcp serve command", () => {
    const help = cli("mcp", "serve", "--help");
    expect(help).toContain("Usage: sonde mcp serve");
  });
});
