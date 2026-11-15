import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const CLI = join(process.cwd(), "src/cli/main.ts");

let cacheHome: string;
let roots: string[];

function run(args: string[], expectFailure = false): string {
  try {
    return execFileSync(process.execPath, ["--import", "tsx", CLI, ...args], {
      cwd: process.cwd(),
      encoding: "utf8",
      env: { ...process.env, HOME: cacheHome },
      stdio: "pipe",
    });
  } catch (error) {
    if (!expectFailure) throw error;
    const failure = error as { stdout?: string; stderr?: string };
    return `${failure.stdout ?? ""}${failure.stderr ?? ""}`;
  }
}

function project(): string {
  const root = mkdtempSync(join(tmpdir(), "sonde-mapcli-"));
  roots.push(root);
  mkdirSync(join(root, "src/a"), { recursive: true });
  mkdirSync(join(root, "src/b"), { recursive: true });
  writeFileSync(
    join(root, "tsconfig.json"),
    JSON.stringify({ compilerOptions: { moduleResolution: "bundler" } }),
  );
  writeFileSync(join(root, "src/b/util.ts"), "export function helper() { return 1; }\n");
  writeFileSync(
    join(root, "src/a/main.ts"),
    "import { helper } from '../b/util.js';\n" +
      "export function run() { return helper(); }\n",
  );
  return root;
}

beforeEach(() => {
  cacheHome = mkdtempSync(join(tmpdir(), "sonde-map-home-"));
  roots = [];
});

afterEach(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
  rmSync(cacheHome, { recursive: true, force: true });
});

describe("sonde map", () => {
  it("refuses without an index rather than writing an empty map", () => {
    const root = project();
    expect(run(["map", root], true)).toMatch(/sonde index/);
    expect(existsSync(join(root, "ARCHITECTURE.html"))).toBe(false);
  }, 120_000);

  it("writes a self-contained ARCHITECTURE.html after indexing", () => {
    const root = project();
    run(["index", root]);
    run(["map", root]);
    const html = readFileSync(join(root, "ARCHITECTURE.html"), "utf8");
    expect(html).toContain("<!doctype html>");
    expect(html).toContain("src/a");
    // Self-contained is the product claim: a map that fetches a layout engine
    // is useless in the places a committed artifact gets opened.
    expect(html).not.toMatch(/<script[^>]+src=/i);
    expect(html).not.toMatch(/https?:\/\/(?!www\.w3\.org)/);
  }, 120_000);

  it("regenerates byte-identically when nothing changed", () => {
    const root = project();
    run(["index", root]);
    run(["map", root]);
    const first = readFileSync(join(root, "ARCHITECTURE.html"), "utf8");
    run(["map", root]);
    expect(readFileSync(join(root, "ARCHITECTURE.html"), "utf8")).toBe(first);
  }, 120_000);

  it("--check passes on a current map and fails on a stale one", () => {
    const root = project();
    run(["index", root]);
    run(["map", root]);
    expect(run(["map", root, "--check"])).toMatch(/up to date/);

    writeFileSync(
      join(root, "src/b/extra.ts"),
      "export function second() { return 2; }\n",
    );
    run(["index", root]);
    expect(run(["map", root, "--check"], true)).toMatch(/out of date/);
  }, 120_000);

  it("--stdout prints and writes nothing", () => {
    const root = project();
    run(["index", root]);
    expect(run(["map", root, "--stdout"])).toContain("<!doctype html>");
    expect(existsSync(join(root, "ARCHITECTURE.html"))).toBe(false);
  }, 120_000);

  it("refuses to overwrite a file sonde did not write", () => {
    const root = project();
    run(["index", root]);
    writeFileSync(join(root, "ARCHITECTURE.html"), "<h1>mine</h1>\n");
    expect(run(["map", root], true)).toMatch(/refusing to overwrite/);
    expect(readFileSync(join(root, "ARCHITECTURE.html"), "utf8")).toBe("<h1>mine</h1>\n");
  }, 120_000);

  it("refuses an --out path outside the repository without a stack trace", () => {
    const root = project();
    run(["index", root]);
    const output = run(["map", root, "--out", "../escape.html"], true);
    expect(output).toMatch(/outside the repository/);
    expect(output).not.toMatch(/PathEscapeError|at RepoBoundary/);
  }, 120_000);

  it("is hidden from top-level help but still runs by name", () => {
    // No usefulness gate has measured this command's output yet, so it must
    // not be offered. It stays reachable for the gate itself to use.
    const help = run(["--help"]);
    expect(help).not.toMatch(/^\s+map\b/m);
    expect(help).toMatch(/^\s+doc\b/m);
    expect(run(["map", "--help"])).toMatch(/experimental/);
  }, 120_000);

  it("--complete draws strictly more than the simple map", () => {
    const root = project();
    run(["index", root]);
    const simple = run(["map", root, "--stdout"]);
    const complete = run(["map", root, "--complete", "--stdout"]);
    expect(complete.length).toBeGreaterThan(simple.length);
    // The simple map offers no escape hatch to unverified pairs, by design.
    // The script references the control either way, so assert on the control.
    expect(simple).not.toMatch(/<input[^>]+id="showUnverified"/);
    expect(complete).toMatch(/<input[^>]+id="showUnverified"/);
  }, 120_000);
});
