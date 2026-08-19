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
      tscVersion: string;
    };
    expect(out.parser).toBe("ok");
    expect(out.database).toBe("ok");
    expect(out.tscVersion).toMatch(/^\d+\.\d+/);
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
});
