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

let root: string;
let cacheHome: string;

const cli = (args: string[], input?: string): string =>
  execFileSync(
    process.execPath,
    ["--import", "tsx", "src/cli/main.ts", ...args],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      env: { ...process.env, HOME: cacheHome },
      input,
    },
  );

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "cg-init-repo-"));
  cacheHome = mkdtempSync(join(tmpdir(), "cg-init-home-"));
  mkdirSync(join(root, "src"));
  writeFileSync(join(root, "tsconfig.json"), "{}");
  writeFileSync(join(root, "src", "a.ts"), "export function a() {}");
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
  rmSync(cacheHome, { recursive: true, force: true });
});

describe("sonde init", () => {
  it("indexes the repo and creates .mcp.json with --yes, no prompt needed", () => {
    const out = cli(["init", root, "--yes", "--json"]);
    const parsed = JSON.parse(out);
    expect(parsed.index.filesIndexed).toBe(1);
    expect(parsed.mcpConfig.action).toBe("create");

    const written = JSON.parse(readFileSync(join(root, ".mcp.json"), "utf8"));
    expect(written.mcpServers.sonde).toEqual({
      command: "sonde",
      args: ["mcp", "serve", "."],
    });
  });

  it("indexes but does not write .mcp.json when the prompt is answered no", () => {
    cli(["init", root], "n\n");
    expect(existsSync(join(root, ".mcp.json"))).toBe(false);
  });

  it("writes .mcp.json when the prompt is answered yes", () => {
    cli(["init", root], "y\n");
    expect(existsSync(join(root, ".mcp.json"))).toBe(true);
  });

  it("is idempotent: a second run reports already-configured and does not error", () => {
    cli(["init", root, "--yes", "--json"]);
    const second = JSON.parse(cli(["init", root, "--yes", "--json"]));
    expect(second.mcpConfig.action).toBe("noop");
  });

  it("preserves an existing .mcp.json's other servers", () => {
    writeFileSync(
      join(root, ".mcp.json"),
      JSON.stringify({
        mcpServers: { other: { command: "x", args: [] } },
      }),
    );
    cli(["init", root, "--yes"]);
    const written = JSON.parse(readFileSync(join(root, ".mcp.json"), "utf8"));
    expect(written.mcpServers.other).toEqual({ command: "x", args: [] });
    expect(written.mcpServers.sonde).toBeDefined();
  });

  it("refuses to touch a malformed .mcp.json and exits non-zero", () => {
    writeFileSync(join(root, ".mcp.json"), "{ not json");
    expect(() => cli(["init", root, "--yes"])).toThrow();
    expect(readFileSync(join(root, ".mcp.json"), "utf8")).toBe("{ not json");
  });

  it("reports a conflict without overwriting a differently-configured sonde entry", () => {
    writeFileSync(
      join(root, ".mcp.json"),
      JSON.stringify({
        mcpServers: { sonde: { command: "/custom/sonde", args: [] } },
      }),
    );
    const out = cli(["init", root, "--yes", "--json"]);
    const parsed = JSON.parse(out);
    expect(parsed.mcpConfig.action).toBe("conflict");
    const stillThere = JSON.parse(
      readFileSync(join(root, ".mcp.json"), "utf8"),
    );
    expect(stillThere.mcpServers.sonde.command).toBe("/custom/sonde");
  });

  it("passes --resolve through to indexing", () => {
    const out = cli(["init", root, "--yes", "--json", "--resolve"]);
    const parsed = JSON.parse(out);
    expect(parsed.index.compilerUpgraded).not.toBeNull();
  });

  it("warns visibly when --resolve has no usable tsconfig", () => {
    rmSync(join(root, "tsconfig.json"));
    const out = cli(["init", root, "--yes", "--resolve"]);
    expect(out).toContain(
      "compiler tier unavailable (no usable tsconfig); edges remain LEXICAL/HEURISTIC",
    );
  });
});
