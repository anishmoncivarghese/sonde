import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const CLI = join(process.cwd(), "src/cli/main.ts");

/** Top-level commands `sonde --help` offers; hidden ones are not offered. */
function offeredCommands(): Set<string> {
  const help = execFileSync(process.execPath, ["--import", "tsx", CLI, "--help"], {
    encoding: "utf8",
  });
  const listing = help.slice(help.indexOf("Commands:"));
  const names = [...listing.matchAll(/^ {2}([a-z][\w-]*)\b/gm)].map((m) => m[1]!);
  return new Set(names.filter((name) => name !== "help"));
}

/** Commands named in the fenced block under the README's `## CLI` heading. */
function documentedCommands(): Set<string> {
  const readme = readFileSync(join(process.cwd(), "README.md"), "utf8");
  const section = readme.slice(readme.indexOf("\n## CLI\n"));
  const block = /```text\n([\s\S]*?)```/.exec(section);
  if (block === null) throw new Error("README has no fenced block under ## CLI");
  return new Set(
    [...block[1]!.matchAll(/^sonde ([a-z][\w-]*)\b/gm)].map((m) => m[1]!),
  );
}

describe("README command inventory", () => {
  // The inventory once omitted `doc` and `embed` for three releases. Nothing
  // failed, because nothing compared the two lists.
  it("names every command the CLI offers", () => {
    const documented = documentedCommands();
    const missing = [...offeredCommands()].filter((name) => !documented.has(name));
    expect(missing).toEqual([]);
  }, 60_000);

  it("names no command the CLI does not offer", () => {
    const offered = offeredCommands();
    const stale = [...documentedCommands()].filter((name) => !offered.has(name));
    expect(stale).toEqual([]);
  }, 60_000);
});
