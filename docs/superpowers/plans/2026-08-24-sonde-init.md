# Sonde Init Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collapse project onboarding from two manual, easy-to-forget steps (`sonde index .`, then hand-writing `.mcp.json`) into one command: `sonde init`.

**Architecture:** A new CLI command that (1) runs the existing `indexRepo` pipeline unchanged, then (2) merge-safely writes a `sonde` entry into the project's `.mcp.json`, asking for confirmation before touching that file unless `--yes` is passed. Two small, independently-testable modules do the real work (`mcpConfig.ts` for the merge logic, `prompt.ts` for the confirmation), so the CLI wiring in `main.ts` stays thin.

**Tech Stack:** TypeScript (strict), Node 22+, `commander` (already a dependency), `node:readline/promises` (built in — no new dependency).

**Spec:** `docs/superpowers/specs/2026-08-16-sonde-design.md`. This plan does not change extraction, resolution, or storage — it only adds an onboarding command, so no spec revision is needed.

## Why this exists

A developer using Sonde today has to remember two unrelated things per project: run `sonde index .`, then hand-author a JSON file in a format they have to look up. Every step a developer has to remember is a step they'll skip, and a skipped step reads as "this tool doesn't work" rather than "I forgot a step." `sonde init` makes the whole onboarding path one command, matching the shape of `git init`, `npm init`, and `gh auth login` — tools people already trust to set themselves up safely.

## The one hard constraint: never silently damage `.mcp.json`

`.mcp.json` is not Sonde's file. It is the MCP client's shared config, and it may already list other servers a developer configured by hand. Every failure mode below must be handled explicitly — "just overwrite it" is not an acceptable fallback for any of them:

| Situation on disk | Required behavior |
|---|---|
| No `.mcp.json` | Create it with exactly one key: `sonde`. |
| Valid JSON, no `sonde` entry | Merge `sonde` in. Every other key, and every other server under `mcpServers`, is preserved untouched. |
| Valid JSON, `sonde` entry already present and identical | No-op. Say so. Do not rewrite the file (avoids meaningless diffs and preserves the developer's own formatting if they hand-edited it). |
| Valid JSON, `sonde` entry present but different from what init would write | Do not touch it. Report the difference and let the developer decide — this is deliberate customisation until proven otherwise, not staleness to fix. |
| File exists but is not valid JSON | Stop with a clear error naming the file and the parse failure. Never overwrite a file you cannot parse — whatever is in it might be mid-edit or hand-recoverable, and guessing wrong destroys it. |

## Global Constraints

- **Node 22+.** Run `nvm use` in every shell before any `node`/`npm`/`npx` command; this machine's default is v20 and fails with `EBADENGINE`.
- **No new dependency.** The confirmation prompt uses `node:readline/promises`, built into Node — do not add `inquirer`, `prompts`, or similar.
- **All file access goes through `RepoBoundary`** (`src/repo/boundary.ts`), same as every other command. `boundary.resolve(".mcp.json")` is safe to call even when the file does not yet exist (verified: containment is checked before the existence check).
- **Default is to ask, not to act.** Any write to `.mcp.json` is preceded by a confirmation prompt showing exactly what will change, unless `-y`/`--yes` is passed. On EOF or empty stdin (a non-interactive shell with no `--yes` given), the answer is treated as "no" — never default to "yes" for a config-writing action.
- **`sonde init` must be idempotent.** Running it twice in a row does the right thing both times: the second run reports "already indexed, already configured" rather than erroring or duplicating anything.
- **Reuse `indexRepo` exactly as `sonde index` already calls it.** Do not fork indexing logic; `init`'s indexing step must produce byte-identical results to running `sonde index` directly with the same flags.
- Conventional commits; commit per task.

---

## File Structure

```
src/cli/
  mcpConfig.ts        # NEW. Pure merge logic: read, decide, describe, write.
  prompt.ts            # NEW. A single yes/no confirmation over stdin/stdout.
  main.ts              # MODIFY. Register `init`, wire the two modules above.
tests/cli/
  mcpConfig.test.ts    # NEW. Pure unit tests, no process spawning.
  prompt.test.ts        # NEW. Unit tests using an injectable stream pair.
  init.test.ts          # NEW. End-to-end CLI tests via execFileSync, matching
                         # the existing pattern in tests/cli/cli.test.ts.
README.md              # MODIFY. `sonde init` becomes the documented first step.
```

---

### Task 1: Merge-safe `.mcp.json` read and write

**Files:**
- Create: `src/cli/mcpConfig.ts`, `tests/cli/mcpConfig.test.ts`

**Interfaces:**
- Consumes: nothing beyond `node:fs` — this module takes raw file content as
  input/output so it is trivially unit-testable without touching disk if the
  tests prefer that, though the plan below uses real temp files to match
  this project's convention of testing real behaviour over mocks.
- Produces:
  - `interface McpServerEntry { command: string; args: string[]; }`
  - `type McpMergeResult =`
    `| { action: "create"; content: string }`
    `| { action: "merge"; content: string }`
    `| { action: "noop"; reason: "already-configured" }`
    `| { action: "conflict"; existing: McpServerEntry }`
    `| { action: "invalid-json"; error: string }`
  - `function sondeMcpEntry(): McpServerEntry` — the canonical entry this
    project writes: `{ command: "sonde", args: ["mcp", "serve", "."] }`
  - `function planMcpMerge(existingContent: string | null): McpMergeResult` —
    pure function, no I/O. Decides what *would* happen without touching disk;
    `main.ts` uses this to build the confirmation prompt text, then only
    calls the writer once the developer has agreed.
  - `function writeMcpConfig(path: string, content: string): void` — the only
    function in this module that touches disk, called only after the
    develoer has confirmed (or `--yes` was given).

- [ ] **Step 1: Write the failing test**

```ts
// tests/cli/mcpConfig.test.ts
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
    expect(parsed.mcpServers.other).toEqual({ command: "other-tool", args: ["serve"] });
    expect(parsed.mcpServers.sonde).toEqual(sondeMcpEntry());
  });

  it("merges into an existing file with top-level keys other than mcpServers, untouched", () => {
    const existing = JSON.stringify({ someOtherTopLevelSetting: true, mcpServers: {} });
    const result = planMcpMerge(existing);
    if (result.action !== "merge") throw new Error("unreachable");
    const parsed = JSON.parse(result.content);
    expect(parsed.someOtherTopLevelSetting).toBe(true);
  });

  it("is a no-op when the sonde entry already matches exactly", () => {
    const existing = JSON.stringify({ mcpServers: { sonde: sondeMcpEntry() } });
    const result = planMcpMerge(existing);
    expect(result).toEqual({ action: "noop", reason: "already-configured" });
  });

  it("reports a conflict rather than overwriting a different sonde entry", () => {
    const existing = JSON.stringify({
      mcpServers: { sonde: { command: "/some/custom/path", args: ["mcp", "serve"] } },
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
```

- [ ] **Step 2: Run it and confirm it fails** — `nvm use && npx vitest run tests/cli/mcpConfig.test.ts` → cannot resolve `mcpConfig.js`

- [ ] **Step 3: Implement**

```ts
// src/cli/mcpConfig.ts
import { readFileSync, writeFileSync } from "node:fs";

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

/** The entry this project writes. A relative "." assumes the MCP client
 * launches the server with this directory as its working directory, which
 * is how every documented client config in this repo already works. */
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

  const servers = (parsed.mcpServers as Record<string, McpServerEntry> | undefined) ?? {};
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

/** The only function in this module that touches disk. */
export function writeMcpConfig(path: string, content: string): void {
  writeFileSync(path, content, "utf8");
}

export function readMcpConfigIfPresent(path: string): string | null {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run tests** — expect 7 passing

- [ ] **Step 5: Commit** — `feat: add merge-safe .mcp.json read/write`

---

### Task 2: A single yes/no confirmation prompt

**Files:**
- Create: `src/cli/prompt.ts`, `tests/cli/prompt.test.ts`

**Interfaces:**
- Produces: `async function confirm(question: string, input: NodeJS.ReadableStream, output: NodeJS.WritableStream): Promise<boolean>`

Streams are passed in explicitly (not read from `process.stdin`/`process.stdout` directly inside the function) specifically so this is unit-testable without spawning a process — pipe a `PassThrough` stream in the tests.

- [ ] **Step 1: Write the failing test**

```ts
// tests/cli/prompt.test.ts
import { describe, expect, it } from "vitest";
import { PassThrough } from "node:stream";
import { confirm } from "../../src/cli/prompt.js";

function fakeInput(text: string): PassThrough {
  const stream = new PassThrough();
  stream.end(text);
  return stream;
}

describe("confirm", () => {
  it("returns true for 'y'", async () => {
    const output = new PassThrough();
    output.resume();
    expect(await confirm("Continue?", fakeInput("y\n"), output)).toBe(true);
  });

  it("returns true for 'yes', case-insensitively", async () => {
    const output = new PassThrough();
    output.resume();
    expect(await confirm("Continue?", fakeInput("Yes\n"), output)).toBe(true);
  });

  it("returns false for 'n'", async () => {
    const output = new PassThrough();
    output.resume();
    expect(await confirm("Continue?", fakeInput("n\n"), output)).toBe(false);
  });

  it("returns false for anything else typed", async () => {
    const output = new PassThrough();
    output.resume();
    expect(await confirm("Continue?", fakeInput("sure whatever\n"), output)).toBe(false);
  });

  it("returns false on empty input (EOF, non-interactive shell)", async () => {
    // Never default a config-writing prompt to "yes" when nothing was typed.
    const output = new PassThrough();
    output.resume();
    expect(await confirm("Continue?", fakeInput(""), output)).toBe(false);
  });

  it("writes the question to the output stream", async () => {
    const output = new PassThrough();
    let written = "";
    output.on("data", (chunk) => { written += chunk.toString(); });
    await confirm("Write this to .mcp.json?", fakeInput("y\n"), output);
    expect(written).toContain("Write this to .mcp.json?");
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

- [ ] **Step 3: Implement**

```ts
// src/cli/prompt.ts
import { createInterface } from "node:readline/promises";

/**
 * A single yes/no question. Never defaults to "yes" -- an empty answer,
 * anything ambiguous, or EOF (a non-interactive shell with no --yes given)
 * all resolve false, because the only thing this gates is writing into a
 * config file Sonde does not own.
 */
export async function confirm(
  question: string,
  input: NodeJS.ReadableStream,
  output: NodeJS.WritableStream,
): Promise<boolean> {
  const rl = createInterface({ input, output });
  try {
    const answer = await rl.question(`${question} [y/N] `);
    return /^y(es)?$/i.test(answer.trim());
  } finally {
    rl.close();
  }
}
```

- [ ] **Step 4: Run tests** — expect 6 passing

- [ ] **Step 5: Commit** — `feat: add a yes/no confirmation prompt`

---

### Task 3: Wire `sonde init`

**Files:**
- Modify: `src/cli/main.ts`
- Create: `tests/cli/init.test.ts`

**Interfaces:**
- Consumes: `planMcpMerge`, `writeMcpConfig`, `readMcpConfigIfPresent`,
  `sondeMcpEntry` (Task 1); `confirm` (Task 2); `indexRepo`, `indexPathFor`
  (already imported in `main.ts`)
- Produces: the `sonde init [path]` command

Register `init` immediately before the existing `index` command, since it is
now the documented first step. Options mirror `index` (`--resolve`,
`--json`) plus one new one, `-y`/`--yes`, that skips the confirmation prompt.

- [ ] **Step 1: Write the failing test**

```ts
// tests/cli/init.test.ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

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
      JSON.stringify({ mcpServers: { other: { command: "x", args: [] } } }),
    );
    cli(["init", root, "--yes"]);
    const written = JSON.parse(readFileSync(join(root, ".mcp.json"), "utf8"));
    expect(written.mcpServers.other).toEqual({ command: "x", args: [] });
    expect(written.mcpServers.sonde).toBeDefined();
  });

  it("refuses to touch a malformed .mcp.json and exits non-zero", () => {
    writeFileSync(join(root, ".mcp.json"), "{ not json");
    expect(() => cli(["init", root, "--yes"])).toThrow();
    // The file must be untouched -- confirm it is still the same broken text,
    // not silently replaced.
    expect(readFileSync(join(root, ".mcp.json"), "utf8")).toBe("{ not json");
  });

  it("reports a conflict without overwriting a differently-configured sonde entry", () => {
    writeFileSync(
      join(root, ".mcp.json"),
      JSON.stringify({ mcpServers: { sonde: { command: "/custom/sonde", args: [] } } }),
    );
    const out = cli(["init", root, "--yes", "--json"]);
    const parsed = JSON.parse(out);
    expect(parsed.mcpConfig.action).toBe("conflict");
    const stillThere = JSON.parse(readFileSync(join(root, ".mcp.json"), "utf8"));
    expect(stillThere.mcpServers.sonde.command).toBe("/custom/sonde");
  });

  it("passes --resolve through to indexing", () => {
    const out = cli(["init", root, "--yes", "--json", "--resolve"]);
    const parsed = JSON.parse(out);
    expect(parsed.index.compilerUpgraded).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

- [ ] **Step 3: Implement**

Add near the top of `src/cli/main.ts`'s command registrations, immediately
before the existing `.command("index")`:

```ts
program
  .command("init")
  .argument("[path]", "repository root", ".")
  .option(
    "--resolve",
    "resolve edges with the TypeScript compiler (slower, more precise)",
  )
  .option("-y, --yes", "write .mcp.json without asking for confirmation")
  .option("--json", "structured output")
  .action(async (
    path: string,
    options: { resolve?: boolean; yes?: boolean; json?: boolean },
  ) => {
    const indexStats = await indexRepo(path, indexPathFor(path), {
      resolve: options.resolve,
    });

    const boundary = new RepoBoundary(path);
    const mcpPath = boundary.resolve(".mcp.json");
    const existing = readMcpConfigIfPresent(mcpPath);
    const plan = planMcpMerge(existing);

    if (plan.action === "invalid-json") {
      console.error(
        `${mcpPath} exists but is not valid JSON (${plan.error}); ` +
          "leaving it untouched. Fix or remove it, then run 'sonde init' again.",
      );
      process.exitCode = 1;
      emit(options.json === true, { index: indexStats, mcpConfig: plan }, "");
      return;
    }

    if (plan.action === "noop") {
      emit(
        options.json === true,
        { index: indexStats, mcpConfig: plan },
        `indexed ${indexStats.filesIndexed} files. ` +
          "sonde is already configured in .mcp.json.",
      );
      return;
    }

    if (plan.action === "conflict") {
      emit(
        options.json === true,
        { index: indexStats, mcpConfig: plan },
        `indexed ${indexStats.filesIndexed} files. .mcp.json already has a ` +
          "different 'sonde' entry -- leaving it as-is. Expected:\n" +
          `  ${JSON.stringify(sondeMcpEntry())}\n` +
          `Found:\n  ${JSON.stringify(plan.existing)}`,
      );
      return;
    }

    // plan.action is "create" or "merge" here.
    const verb = plan.action === "create" ? "Create" : "Update";
    const proceed =
      options.yes === true ||
      (await confirm(
        `${verb} ${mcpPath} to register sonde as an MCP server?`,
        process.stdin,
        process.stdout,
      ));

    if (!proceed) {
      emit(
        options.json === true,
        { index: indexStats, mcpConfig: { action: "declined" } },
        `indexed ${indexStats.filesIndexed} files. Skipped .mcp.json ` +
          "(not confirmed). Run 'sonde init --yes' to write it without asking.",
      );
      return;
    }

    writeMcpConfig(mcpPath, plan.content);
    emit(
      options.json === true,
      { index: indexStats, mcpConfig: plan },
      `indexed ${indexStats.filesIndexed} files and ${verb.toLowerCase()}d ` +
        `${mcpPath}. Restart your MCP client to pick it up.`,
    );
  });
```

Add the new imports at the top of `main.ts`:

```ts
import { confirm } from "./prompt.js";
import {
  planMcpMerge,
  readMcpConfigIfPresent,
  sondeMcpEntry,
  writeMcpConfig,
} from "./mcpConfig.js";
```

- [ ] **Step 4: Run the new tests** — expect 8 passing

- [ ] **Step 5: Run the FULL suite** — every existing CLI test must be
  unaffected; `init` is additive

- [ ] **Step 6: Commit** — `feat: add sonde init`

---

### Task 4: Make `init` the documented first step

**Files:** Modify `README.md`

- [ ] **Step 1: Update the install section**

Replace the two-command onboarding sequence with the one-command version,
keeping the manual two-step path documented immediately after as the
"what init actually does, if you want to do it by hand" explanation --
this project has been consistent about disclosing what a convenience command
does under the hood rather than hiding it.

```markdown
## Install and run

\`\`\`sh
npm install -g @cheppulabs/sonde
cd your-project
sonde init
\`\`\`

\`sonde init\` indexes the repository and registers sonde as an MCP server in
this project's \`.mcp.json\`, asking before it writes anything (skip the
prompt with \`sonde init --yes\`). It never touches an \`.mcp.json\` it can't
safely merge into -- an existing \`sonde\` entry that differs from what
\`init\` would write is left alone and reported, not overwritten.

Equivalent by hand, if you'd rather see every step:

\`\`\`sh
sonde index .
# then add to .mcp.json:
# { "mcpServers": { "sonde": { "command": "sonde", "args": ["mcp", "serve", "."] } } }
\`\`\`
```

- [ ] **Step 2: Add `init` to the CLI command list** wherever the other
  commands (`index`, `update`, `status`, ...) are enumerated in the README.

- [ ] **Step 3: Run the full suite one more time** (docs-only change, but
  confirm nothing else drifted) — `npm run typecheck && npm test`

- [ ] **Step 4: Commit** — `docs: document sonde init as the primary onboarding path`

---

## Completion criteria

- [ ] `sonde init` indexes a repo and creates `.mcp.json` when none exists
- [ ] Merges into an existing `.mcp.json` without disturbing other servers or other top-level keys
- [ ] Is idempotent — a second run reports `noop`, does not error, does not rewrite the file
- [ ] Never overwrites a differing `sonde` entry — reports `conflict` instead
- [ ] Never overwrites malformed JSON — reports `invalid-json`, exits non-zero, leaves the file byte-for-byte as found
- [ ] Defaults to asking before writing; `-y`/`--yes` skips the prompt; empty/EOF input is treated as "no"
- [ ] `--resolve` passes through to indexing exactly as `sonde index --resolve` does
- [ ] README documents `sonde init` as the first onboarding step, with the manual equivalent still shown
- [ ] `npm run typecheck && npm test` clean

## Known risks

| Risk | Signal | Response |
|---|---|---|
| A different MCP client uses a different config filename/location (e.g. not `.mcp.json` at the project root) | A user reports `init` didn't wire up their client | Out of scope for this plan -- `.mcp.json` at the project root is what this repository's own docs and `mcp-client-verification.md` already standardise on. A follow-up plan can add client selection if this turns out to matter in practice; do not speculatively build it now. |
| `readline/promises` behaves differently across Node versions for a piped (non-TTY) stdin | A CI test hangs instead of resolving | The EOF-returns-false behavior in Task 2 is exactly the safeguard for this — if it does hang, that's a bug in the implementation, not an acceptable trade-off; do not add a timeout as a workaround, fix the stream handling. |
| Someone runs `init` in a repo where the parent directory chain leads outside intended boundaries | Same class of risk `RepoBoundary` already exists to prevent | No new risk here — this plan does not bypass `RepoBoundary` anywhere. |
