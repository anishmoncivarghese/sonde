# Pyright `COMPILER` Tier Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Python a `COMPILER` tier backed by pyright, then re-run the already-published placement gate and register the Python adapter only if it passes.

**Architecture:** `runPyrightPass(root, store)` mirrors `runCompilerPass` — same store methods, same `null`-means-unavailable contract, same rule that it may never fail an already-committed index. It differs in being `async`, because pyright has no in-process API and must be driven over LSP. The pipeline is already async, so this costs nothing at the call site.

**Tech Stack:** TypeScript, `pyright@1.1.413` (npm, bundles typeshed, needs no Python interpreter), `web-tree-sitter`, `better-sqlite3`, vitest.

**Spec:** `docs/superpowers/specs/2026-08-28-pyright-tier-design.md`

## Handoff note — read this first

This plan was written by Claude and **self-reviewed only**. Treat its assertions as claims to verify.

**The code blocks are a starting point; the tests are the contract.** Where a block disagrees with real type signatures, the real signatures win — fix the code and note it in the commit. Never weaken a test assertion to make it pass.

**Two hard stops.** Task 6 measures and **stops**. Task 7 (registration) runs only on a PASS. A FAIL means Python stays unregistered and `sonde init` keeps reporting zero indexed files for Python repositories — that is a correct outcome, not a problem to engineer around. No threshold may be adjusted after seeing a result.

## Global Constraints

Copied from the spec and `AGENTS.md`. Every task implicitly includes these.

- **Run `nvm use` in every shell before any `node` or `npm` command.**
- **Never execute repository code** (invariant 5, SEC-008). Pyright is the bundled copy; the target repo's environment, venv, and interpreter are never used or read.
- **Never fabricate an edge** (invariant 1). A reference pyright cannot answer keeps its prior tier — it is never downgraded and never guessed.
- **Tier beats score** (invariant 3). `COMPILER` outranks `LEXICAL` and `HEURISTIC` unconditionally.
- **Degrade with a warning; never fail silently** (invariant 8). The pass is a promotion over an already-committed index; no failure may invalidate the tree-sitter graph.
- **All repository reads go through `src/repo/boundary.ts`** (invariant 6).
- **Stable keys are never line-based:** `py:{relpath}#{scope_chain}` (invariant 9).
- **Gate:** PASS is `UNRESOLVED` ≤ 30% **and** placed ≥ 70%, over in-repository references with `EXTERNAL` excluded from the denominator. Corpora: `~/agentdock` and pydantic. Worse corpus wins; no averaging.
- **TDD**, conventional commits, one commit per task.

## Verified Facts

Confirmed against the real source while writing this plan. Do not re-derive; do report if any is false.

**The store API `runCompilerPass` uses** (`src/store/repos.ts`):

| Method | Signature | Line |
|---|---|---:|
| `upgradeEdgeTier` | `(srcKey: string, dstKey: string, kind: EdgeKind) => boolean` | 249 |
| `insertCompilerEdge` | `(srcKey, dstKey, kind, siteLine: number \| null) => boolean` | 268 |
| `deleteUnresolvedFor` | `(srcKey: string, name: string) => number` | 302 |
| `countUnresolved` | `() => number` | 314 |
| `tierCounts` | `() => Record<string, number>` | 321 |

**`runCompilerPass(root, store)` returns `CompilerPassResult | null`** — `null` means unavailable, and `pipeline.ts:203` treats that as `compilerUpgraded = null`. It wraps its work in `store.transaction(...)` and swallows all throws with a bare `catch { return null; }`.

**Schema** (`src/store/schema.sql`): both `edge` (line 42) and `unresolved_ref` (line 59) carry `site_line`; `unresolved_ref` also carries `name`. `external_ref` is a separate table (line 46).

**There is no store read API for listing unresolved or heuristic reference sites.** Task 2 adds them. This is why the pass cannot simply filter in memory.

**Store construction in tests** follows `tests/resolve/compilerPass.test.ts`: `openDb(dbPath)`, then `migrate(db)`, then `new Store(db)`, all imported from `src/store/index.js`. There is no shared test-store helper — do not invent one.

**`declarationToStableKey` is TypeScript-only** — it takes a `ts.Declaration` and a `CompilerContext`. Python needs its own position→key mapper. The spec's "the same approach applies" describes the *approach*, not a reusable function. Task 3 writes it.

**The pipeline is already async.** `run` is declared `async` (`src/index/pipeline.ts:42`) and already `await`s (line 62); `indexRepo(root, dbPath, options?)` returns `Promise<IndexStats>` (line 224). The compiler pass is invoked at `pipeline.ts:202` inside `if (options.resolve)`.

An earlier draft of the spec claimed `indexRepo` was synchronous and specified a bridge child process to work around it. That premise was false, and the correction is recorded in spec §3.1–3.2 rather than quietly dropped. **If you find yourself reaching for `execFileSync`, a second Node process, or a `maxBuffer` setting, stop — you are rebuilding the discarded design.**

**pyright ships two binaries**: `pyright` (`index.js`) and `pyright-langserver` (`langserver.index.js`). The client spawns the latter with `--stdio`.

**Measured, from `probes/pyright-feasibility/FINDINGS.md`:** ~210 definition requests/sec, flat across client concurrency 1/8/32. Do not build batching or a worker pool — it was measured to buy nothing.

---

### Task 1: The pyright LSP client

**Files:**
- Modify: `package.json` (add `pyright@1.1.413` to `dependencies`)
- Create: `src/resolve/pyrightClient.ts`
- Test: `tests/resolve/pyrightClient.test.ts`

**Interfaces:**
- Produces:

```ts
export interface DefinitionQuery { file: string; line: number; character: number; }
export interface DefinitionTarget { file: string; line: number; character: number; }
export interface PyrightSession {
  pyrightVersion: string;
  definitions(queries: DefinitionQuery[]): Promise<Array<DefinitionTarget | null>>;
  close(): void;
}
export function openPyrightSession(
  root: string, files: string[], timeoutMs: number,
): Promise<PyrightSession>;
```

`line` and `character` are **0-based** (LSP native) in both directions. A `null`
result means pyright returned no definition — a real answer, not a failure.
Targets outside `root` are reported as `null`; the client never classifies, and
Task 4 turns that into `EXTERNAL`.

- [ ] **Step 1: Install pyright as a hard dependency**

```bash
nvm use && npm install --save-exact pyright@1.1.413
```

Verify it landed in `dependencies`, not `devDependencies`:

```bash
node -e "console.log(require('./package.json').dependencies.pyright)"
```

Expected: `1.1.413` exactly — not `^1.1.413`. The spec pins it so definition
behaviour cannot drift underneath a recorded measurement.

- [ ] **Step 2: Write the failing test**

```ts
// tests/resolve/pyrightClient.test.ts
import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openPyrightSession } from "../../src/resolve/pyrightClient.js";

function fixture(): string {
  const root = mkdtempSync(join(tmpdir(), "sonde-pyright-"));
  mkdirSync(join(root, "pkg"), { recursive: true });
  writeFileSync(join(root, "pkg/__init__.py"), "");
  writeFileSync(join(root, "pkg/util.py"), "def helper():\n    return 1\n");
  writeFileSync(
    join(root, "pkg/main.py"),
    "from pkg.util import helper\n\n\ndef run():\n    return helper()\n",
  );
  return root;
}

const FILES = ["pkg/util.py", "pkg/main.py"];

describe("pyright client", () => {
  it("resolves an in-repo call to its definition", async () => {
    const session = await openPyrightSession(fixture(), FILES, 60_000);
    try {
      // "    return helper()" is line 4 (0-based); `helper` starts at column 11.
      const [target] = await session.definitions([
        { file: "pkg/main.py", line: 4, character: 11 },
      ]);
      expect(session.pyrightVersion).toMatch(/^\d+\.\d+\.\d+/);
      expect(target?.file).toBe("pkg/util.py");
      expect(target?.line).toBe(0);
    } finally {
      session.close();
    }
  }, 60_000);

  it("preserves query order and length", async () => {
    const session = await openPyrightSession(fixture(), FILES, 60_000);
    try {
      const queries = Array.from({ length: 5 }, () => ({
        file: "pkg/main.py", line: 4, character: 11,
      }));
      const results = await session.definitions(queries);
      expect(results).toHaveLength(5);
      expect(results.every((r) => r?.file === "pkg/util.py")).toBe(true);
    } finally {
      session.close();
    }
  }, 60_000);

  it("answers null for a position with no definition rather than throwing", async () => {
    const session = await openPyrightSession(fixture(), FILES, 60_000);
    try {
      const results = await session.definitions([
        { file: "pkg/util.py", line: 1, character: 11 },
      ]);
      expect(results).toHaveLength(1);
      expect(results[0] === null || typeof results[0]?.file === "string").toBe(true);
    } finally {
      session.close();
    }
  }, 60_000);

  it("reports a target outside the repository as null", async () => {
    const root = fixture();
    writeFileSync(join(root, "pkg/ext.py"), "import os\n\n\ndef f():\n    return os.sep\n");
    const session = await openPyrightSession(root, [...FILES, "pkg/ext.py"], 60_000);
    try {
      // `os` resolves into typeshed, outside root. Task 4 turns null into EXTERNAL.
      const [target] = await session.definitions([
        { file: "pkg/ext.py", line: 4, character: 11 },
      ]);
      expect(target).toBeNull();
    } finally {
      session.close();
    }
  }, 60_000);

  it("close() is safe to call twice", async () => {
    const session = await openPyrightSession(fixture(), FILES, 60_000);
    session.close();
    expect(() => session.close()).not.toThrow();
  }, 60_000);
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `nvm use && npx vitest run tests/resolve/pyrightClient.test.ts`
Expected: FAIL — `src/resolve/pyrightClient.ts` does not exist.

- [ ] **Step 4: Implement the client**

```ts
// src/resolve/pyrightClient.ts
//
// A minimal LSP client for pyright-langserver.
//
// Requests are issued serially on purpose. Measured throughput is flat at
// ~210 req/s across client concurrency 1, 8 and 32 (probes/pyright-feasibility),
// because the server answers definition requests on one thread. A concurrent
// client only inflates latency, so a scheduler would add complexity and return
// nothing.
import { spawn, type ChildProcess } from "node:child_process";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export interface DefinitionQuery { file: string; line: number; character: number; }
export interface DefinitionTarget { file: string; line: number; character: number; }

export interface PyrightSession {
  pyrightVersion: string;
  definitions(queries: DefinitionQuery[]): Promise<Array<DefinitionTarget | null>>;
  close(): void;
}

const require = createRequire(import.meta.url);

export async function openPyrightSession(
  root: string, files: string[], timeoutMs: number,
): Promise<PyrightSession> {
  const langserver = require.resolve("pyright/langserver.index.js");
  const pyrightVersion = String(
    JSON.parse(readFileSync(require.resolve("pyright/package.json"), "utf8")).version,
  );

  const server: ChildProcess = spawn(process.execPath, [langserver, "--stdio"], {
    stdio: ["pipe", "pipe", "pipe"],
  });
  server.stderr?.on("data", () => {}); // pyright chatters; not our channel

  let closed = false;
  const close = (): void => {
    if (closed) return;
    closed = true;
    server.kill();
  };

  let buffer = Buffer.alloc(0);
  const pending = new Map<number, (message: any) => void>();
  let nextId = 1;

  server.stdout?.on("data", (chunk: Buffer) => {
    buffer = Buffer.concat([buffer, chunk]);
    for (;;) {
      const headerEnd = buffer.indexOf("\r\n\r\n");
      if (headerEnd < 0) return;
      const match = /Content-Length: (\d+)/i.exec(
        buffer.subarray(0, headerEnd).toString("ascii"),
      );
      if (!match) return;
      const length = Number(match[1]);
      const start = headerEnd + 4;
      if (buffer.length < start + length) return;
      const body = buffer.subarray(start, start + length).toString("utf8");
      buffer = buffer.subarray(start + length);
      let message: any;
      try { message = JSON.parse(body); } catch { continue; }
      const resolver = message.id !== undefined ? pending.get(message.id) : undefined;
      if (resolver) { pending.delete(message.id); resolver(message); }
    }
  });

  const send = (payload: unknown): void => {
    const text = JSON.stringify(payload);
    server.stdin?.write(
      `Content-Length: ${Buffer.byteLength(text, "utf8")}\r\n\r\n${text}`,
    );
  };
  const request = (method: string, params: unknown): Promise<any> => {
    const id = nextId++;
    return new Promise((resolve, reject) => {
      // Every request is bounded: a stalled server must degrade with a
      // warning, never hang an index (invariant 8).
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`pyright request timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      pending.set(id, (message) => { clearTimeout(timer); resolve(message); });
      send({ jsonrpc: "2.0", id, method, params });
    });
  };
  const notify = (method: string, params: unknown): void =>
    send({ jsonrpc: "2.0", method, params });

  const rootUri = pathToFileURL(root).toString();
  const uriOf = (relative: string) =>
    pathToFileURL(join(root, relative)).toString();
  const prefix = rootUri.replace(/\/?$/, "/");

  await request("initialize", {
    processId: process.pid,
    rootUri,
    workspaceFolders: [{ uri: rootUri, name: "sonde" }],
    capabilities: { textDocument: { definition: { linkSupport: false } } },
    initializationOptions: {},
  });
  notify("initialized", {});

  for (const file of files) {
    let text: string;
    try { text = readFileSync(join(root, file), "utf8"); } catch { continue; }
    notify("textDocument/didOpen", {
      textDocument: { uri: uriOf(file), languageId: "python", version: 1, text },
    });
  }

  const definitions = async (
    queries: DefinitionQuery[],
  ): Promise<Array<DefinitionTarget | null>> => {
    const results: Array<DefinitionTarget | null> = [];
    for (const query of queries) {
      const response = await request("textDocument/definition", {
        textDocument: { uri: uriOf(query.file) },
        position: { line: query.line, character: query.character },
      });
      // LSP permits Location, Location[], or LocationLink[]. Normalise to the
      // first location; anything else is "no answer" rather than a guess
      // (invariant 1).
      const raw = response?.result;
      const first = Array.isArray(raw) ? raw[0] : raw;
      const uri: string | undefined = first?.uri ?? first?.targetUri;
      const range = first?.range ?? first?.targetSelectionRange ?? first?.targetRange;
      if (!uri || !range || !uri.startsWith(prefix)) {
        results.push(null);
        continue;
      }
      results.push({
        file: decodeURIComponent(uri.slice(prefix.length)),
        line: range.start.line,
        character: range.start.character,
      });
    }
    return results;
  };

  return { pyrightVersion, definitions, close };
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `nvm use && npx vitest run tests/resolve/pyrightClient.test.ts`
Expected: PASS (5 tests). These spawn a real language server, so the per-test
timeouts above are deliberate.

- [ ] **Step 6: Confirm no language server is left running**

```bash
pgrep -fl langserver.index.js || echo "no orphaned server"
```

Expected: `no orphaned server`. If one is left, `close()` is not reaching
`server.kill()` on every path — fix that now rather than in Task 4, where it
would be harder to see.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json src/resolve/pyrightClient.ts tests/resolve/pyrightClient.test.ts
git commit -m "feat: add an in-process pyright LSP client"
```

---

### Task 2: Store read APIs for query targets

**Files:**
- Modify: `src/store/repos.ts`
- Test: `tests/store/querySites.test.ts`

**Interfaces:**
- Produces:
  - `unresolvedRefSites(): Array<{ srcKey: string; name: string; siteLine: number | null }>`
  - `heuristicEdgeSites(): Array<{ srcKey: string; siteLine: number | null }>`
  - `countExternal(): number`

The pass queries `UNRESOLVED` and `HEURISTIC` references only — never `LEXICAL`, which already carries mechanical evidence (spec §3.4). Nothing in the store exposes those sites today, which is why these three methods exist.

- [ ] **Step 1: Write the failing test**

```ts
// tests/store/querySites.test.ts
import { describe, expect, it } from "vitest";
import { openTestStore } from "../helpers/store.js";

describe("query-site read APIs", () => {
  it("lists unresolved reference sites with their names", () => {
    const store = openTestStore();
    store.insertSymbols([
      { stableKey: "py:a.py#f", /* remaining required fields per SymbolRow */ } as never,
    ]);
    // Insert one unresolved_ref for py:a.py#f named "helper" at line 3
    // using whatever insert path the store already exposes for unresolved refs.
    const sites = store.unresolvedRefSites();
    expect(sites).toContainEqual({ srcKey: "py:a.py#f", name: "helper", siteLine: 3 });
  });

  it("lists heuristic edge sites but not lexical or compiler ones", () => {
    const store = openTestStore();
    const sites = store.heuristicEdgeSites();
    expect(Array.isArray(sites)).toBe(true);
    // A LEXICAL edge must never appear: re-querying it would spend the
    // measured ~5ms/request to re-derive evidence we already have.
    expect(sites.every((s) => typeof s.srcKey === "string")).toBe(true);
  });

  it("counts external references", () => {
    const store = openTestStore();
    expect(typeof store.countExternal()).toBe("number");
  });
});
```

**Before writing this test, read `tests/` for the existing store-test helper.** If there is no `openTestStore`, follow whatever pattern the current store tests use and adjust the import — do not invent a new fixture style. Populate the rows through the store's existing insert methods rather than raw SQL, so the test exercises the same path production does.

- [ ] **Step 2: Run it to verify it fails**

Run: `nvm use && npx vitest run tests/store/querySites.test.ts`
Expected: FAIL — the three methods do not exist.

- [ ] **Step 3: Implement the read APIs**

Add to the store class in `src/store/repos.ts`, beside `deleteUnresolvedFor`:

```ts
  /**
   * Reference sites the tree-sitter tiers could not place exactly.
   *
   * The pyright pass queries these and HEURISTIC sites only. LEXICAL edges
   * already carry mechanical evidence, and at a measured ~5ms per definition
   * request, re-deriving them is the one cost the tier cannot justify.
   */
  unresolvedRefSites(): Array<{
    srcKey: string; name: string; siteLine: number | null;
  }> {
    return this.db
      .prepare(
        `SELECT symbol.stable_key AS srcKey,
                unresolved_ref.name AS name,
                unresolved_ref.site_line AS siteLine
         FROM unresolved_ref
         JOIN symbol ON symbol.id = unresolved_ref.src_symbol_id`,
      )
      .all() as Array<{ srcKey: string; name: string; siteLine: number | null }>;
  }

  /** Member-access sites whose edges are guesses, capped at AMBIGUITY_CAP. */
  heuristicEdgeSites(): Array<{ srcKey: string; siteLine: number | null }> {
    return this.db
      .prepare(
        `SELECT DISTINCT symbol.stable_key AS srcKey,
                edge.site_line AS siteLine
         FROM edge
         JOIN symbol ON symbol.id = edge.src_symbol_id
         WHERE edge.tier = 'HEURISTIC'`,
      )
      .all() as Array<{ srcKey: string; siteLine: number | null }>;
  }

  countExternal(): number {
    const row = this.db
      .prepare("SELECT COUNT(*) AS n FROM external_ref")
      .get() as { n: number };
    return row.n;
  }
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `nvm use && npx vitest run tests/store/querySites.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/store/repos.ts tests/store/querySites.test.ts
git commit -m "feat: expose unresolved and heuristic query sites on the store"
```

---

### Task 3: Map a Python source position to a stable key

**Files:**
- Create: `src/resolve/pythonSymbolAt.ts`
- Test: `tests/resolve/pythonSymbolAt.test.ts`

**Interfaces:**
- Consumes: `extractPythonSymbols(path, source, tree)` and `stableKey(path, scope)` from `src/adapters/python/symbols.js`; `pythonParser()` from `src/adapters/python/parser.js`
- Produces: `pythonSymbolAt(path: string, source: string, line: number): string | null` — `line` is **1-based**

`declarationToStableKey` is TypeScript-only. This is Python's equivalent: given a definition position, return the key of the innermost symbol containing it.

- [ ] **Step 1: Write the failing test**

```ts
// tests/resolve/pythonSymbolAt.test.ts
import { beforeAll, describe, expect, it } from "vitest";
import { getPythonParser } from "../../src/adapters/python/parser.js";
import { pythonSymbolAt } from "../../src/resolve/pythonSymbolAt.js";

const SRC = [
  "def top():",            // 1
  "    return 1",          // 2
  "",                      // 3
  "class Runner:",         // 4
  "    def run(self):",    // 5
  "        return 2",      // 6
].join("\n");

beforeAll(async () => { await getPythonParser(); });

describe("pythonSymbolAt", () => {
  it("returns the module-level function key", () => {
    expect(pythonSymbolAt("a.py", SRC, 1)).toBe("py:a.py#top");
  });

  it("returns the innermost symbol, not the enclosing class", () => {
    expect(pythonSymbolAt("a.py", SRC, 5)).toBe("py:a.py#Runner.run");
  });

  it("returns the class for a position in the class header", () => {
    expect(pythonSymbolAt("a.py", SRC, 4)).toBe("py:a.py#Runner");
  });

  it("falls back to the file symbol outside any definition", () => {
    expect(pythonSymbolAt("a.py", SRC, 3)).toBe("py:a.py#");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `nvm use && npx vitest run tests/resolve/pythonSymbolAt.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement the mapper**

```ts
// src/resolve/pythonSymbolAt.ts
import { pythonParser } from "../adapters/python/parser.js";
import { extractPythonSymbols, stableKey } from "../adapters/python/symbols.js";

/**
 * The stable key of the innermost Python symbol spanning `line` (1-based).
 *
 * Python's counterpart to declarationToStableKey, which is TypeScript-only.
 * Falls back to the file symbol so a module-level definition still has an
 * owner -- the same fallback the extractor and the TypeScript compiler pass
 * both use (spec §4.2).
 */
export function pythonSymbolAt(
  path: string, source: string, line: number,
): string | null {
  const tree = pythonParser().parse(source);
  if (!tree) return null;

  let best: { key: string; span: number } | null = null;
  for (const symbol of extractPythonSymbols(path, source, tree)) {
    if (symbol.startLine > line || symbol.endLine < line) continue;
    const span = symbol.endLine - symbol.startLine;
    if (!best || span < best.span) best = { key: symbol.stableKey, span };
  }
  return best?.key ?? stableKey(path, []);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `nvm use && npx vitest run tests/resolve/pythonSymbolAt.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/resolve/pythonSymbolAt.ts tests/resolve/pythonSymbolAt.test.ts
git commit -m "feat: map a Python source position to its stable key"
```

---

### Task 4: The pyright pass

**Files:**
- Create: `src/resolve/pyrightPass.ts`
- Test: `tests/resolve/pyrightPass.test.ts`

**Interfaces:**
- Consumes: Tasks 1–3; `RepoBoundary`; `discover`; `extractPythonReferences`; `extractPythonSymbols`; `pythonParser`
- Produces:

```ts
export interface PyrightPassResult {
  upgraded: number;
  unresolvedCleared: number;
  queries: number;
  answered: number;
  pyrightVersion: string;
}
export function runPyrightPass(
  root: string, store: Store,
): Promise<PyrightPassResult | null>;
```

Resolves to `null` when the tier is unavailable for any reason, mirroring
`runCompilerPass`'s contract so `pipeline.ts` needs no new failure vocabulary.
It is `async` because the pipeline already is (`run` at `src/index/pipeline.ts:42`).

- [ ] **Step 1: Write the failing test**

```ts
// tests/resolve/pyrightPass.test.ts
import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runPyrightPass } from "../../src/resolve/pyrightPass.js";
import { migrate, openDb, Store } from "../../src/store/index.js";

function emptyStore(): Store {
  const db = openDb(join(mkdtempSync(join(tmpdir(), "sonde-pystore-")), "index.sqlite"));
  migrate(db);
  return new Store(db);
}

function pythonRepo(): string {
  const root = mkdtempSync(join(tmpdir(), "sonde-pypass-"));
  mkdirSync(join(root, "pkg"), { recursive: true });
  writeFileSync(join(root, "pkg/__init__.py"), "");
  writeFileSync(join(root, "pkg/util.py"), "def helper():\n    return 1\n");
  writeFileSync(
    join(root, "pkg/main.py"),
    "from pkg.util import helper\n\n\ndef run():\n    return helper()\n",
  );
  return root;
}

describe("runPyrightPass", () => {
  it("returns null for a repository with no Python files", async () => {
    const root = mkdtempSync(join(tmpdir(), "sonde-nopy-"));
    writeFileSync(join(root, "a.ts"), "export const a = 1;\n");
    await expect(runPyrightPass(root, emptyStore())).resolves.toBeNull();
  }, 60_000);

  it("returns null when there are no unresolved or heuristic sites to query", async () => {
    // An empty store has nothing to ask about, so the pass must not spend
    // ~120ms starting a language server to answer zero questions.
    await expect(runPyrightPass(pythonRepo(), emptyStore())).resolves.toBeNull();
  }, 60_000);

  it("never rejects when the repository path does not exist", async () => {
    // invariant 8: the deterministic index is already committed; an opt-in
    // promotion pass may never fail an index that would otherwise succeed.
    await expect(runPyrightPass("/nonexistent-repo-path", emptyStore()))
      .resolves.toBeNull();
  }, 60_000);

  it("leaves no language server running after a failure", async () => {
    await runPyrightPass("/nonexistent-repo-path", emptyStore());
    const { execSync } = await import("node:child_process");
    const running = execSync("pgrep -fl langserver.index.js || true").toString();
    expect(running).not.toMatch(/langserver/);
  }, 60_000);
});
```

The end-to-end assertion that a real `COMPILER` edge appears belongs in Task 5,
where a populated store exists. Do not fabricate store rows here to fake it.

- [ ] **Step 2: Run it to verify it fails**

Run: `nvm use && npx vitest run tests/resolve/pyrightPass.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement the pass**

```ts
// src/resolve/pyrightPass.ts
import type { Store } from "../store/index.js";
import type { EdgeKind } from "../store/repos.js";
import { RepoBoundary } from "../repo/boundary.js";
import { discover } from "../repo/discover.js";
import { pythonParser } from "../adapters/python/parser.js";
import { extractPythonReferences } from "../adapters/python/references.js";
import { extractPythonSymbols } from "../adapters/python/symbols.js";
import { pythonSymbolAt } from "./pythonSymbolAt.js";
import { openPyrightSession, type DefinitionQuery } from "./pyrightClient.js";

export interface PyrightPassResult {
  upgraded: number;
  unresolvedCleared: number;
  queries: number;
  answered: number;
  pyrightVersion: string;
}

/** Per-request bound. A stalled server degrades with a warning, never hangs. */
const REQUEST_TIMEOUT_MS = 30_000;

interface QuerySite {
  srcKey: string; name: string; siteLine: number; kind: EdgeKind;
}

export async function runPyrightPass(
  root: string, store: Store,
): Promise<PyrightPassResult | null> {
  let session: Awaited<ReturnType<typeof openPyrightSession>> | null = null;
  try {
    const boundary = new RepoBoundary(root);
    const files = discover(boundary, {
      hashContent: false,
      extensions: new Set([".py", ".pyi"]),
    }).map((file) => file.path);
    if (files.length === 0) return null;

    // Only sites the tree-sitter tiers failed to place exactly (spec §3.5).
    // LEXICAL references already carry mechanical evidence, and at ~5ms per
    // request, re-deriving them is the one cost this tier cannot justify.
    const wanted = new Set<string>();
    for (const site of store.unresolvedRefSites()) {
      wanted.add(`${site.srcKey} ${site.siteLine}`);
    }
    for (const site of store.heuristicEdgeSites()) {
      wanted.add(`${site.srcKey} ${site.siteLine}`);
    }
    if (wanted.size === 0) return null;

    const queries: DefinitionQuery[] = [];
    const sites: QuerySite[] = [];

    for (const file of files) {
      const source = boundary.readFile(file).toString("utf8");
      const tree = pythonParser().parse(source);
      if (!tree) continue;
      const symbols = extractPythonSymbols(file, source, tree);
      const lines = source.split("\n");
      for (const ref of extractPythonReferences(file, source, tree, symbols)) {
        if (!wanted.has(`${ref.fromSymbolKey} ${ref.siteLine}`)) continue;
        // ReferenceRecord carries no column, so recover it from the line by
        // name. Re-parsing here is what keeps the shared type unchanged
        // (spec §4.1).
        const text = lines[ref.siteLine - 1];
        if (!text) continue;
        const column = text.indexOf(ref.name);
        if (column < 0) continue;
        queries.push({ file, line: ref.siteLine - 1, character: column });
        sites.push({
          srcKey: ref.fromSymbolKey,
          name: ref.name,
          siteLine: ref.siteLine,
          kind: ref.kind === "CALLS" ? "CALLS" : "REFERENCES",
        });
      }
    }
    if (queries.length === 0) return null;

    session = await openPyrightSession(root, files, REQUEST_TIMEOUT_MS);
    const answers = await session.definitions(queries);
    // A length mismatch means the conversation desynchronised. Accepting it
    // would silently misattribute every subsequent edge (invariant 8).
    if (answers.length !== queries.length) return null;
    const pyrightVersion = session.pyrightVersion;

    return store.transaction(() => {
      const result: PyrightPassResult = {
        upgraded: 0, unresolvedCleared: 0,
        queries: queries.length, answered: 0, pyrightVersion,
      };

      for (const [index, target] of answers.entries()) {
        // No definition is a real answer: the prior tier stands, and is never
        // downgraded (spec §5.1).
        if (!target) continue;
        result.answered += 1;
        const site = sites[index];
        if (!site) continue;

        let targetSource: string;
        try {
          targetSource = boundary.readFile(target.file).toString("utf8");
        } catch { continue; }
        const dstKey = pythonSymbolAt(target.file, targetSource, target.line + 1);
        if (!dstKey || dstKey === site.srcKey) continue;

        const promoted = store.upgradeEdgeTier(site.srcKey, dstKey, site.kind);
        const inserted = promoted
          ? false
          : store.insertCompilerEdge(site.srcKey, dstKey, site.kind, site.siteLine);
        if (promoted || inserted) {
          result.upgraded += 1;
          result.unresolvedCleared += store.deleteUnresolvedFor(site.srcKey, site.name);
        }
      }

      return result;
    });
  } catch {
    // Mirrors runCompilerPass: an opt-in promotion pass may never fail an
    // index that has already been committed and is usable (invariant 8).
    return null;
  } finally {
    // Must run on every path, or a failed index leaves an orphaned language
    // server holding memory (spec §3.4).
    session?.close();
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `nvm use && npx vitest run tests/resolve/pyrightPass.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Run the full suite**

Run: `nvm use && npm test`
Expected: all tests pass. Nothing here touches the TypeScript or Swift paths.

- [ ] **Step 6: Commit**

```bash
git add src/resolve/pyrightPass.ts tests/resolve/pyrightPass.test.ts
git commit -m "feat: add the pyright COMPILER pass for Python"
```

---

### Task 5: Wire the pass into the pipeline

**Files:**
- Modify: `src/index/pipeline.ts` (inside the `if (options.resolve)` block at ~line 202)
- Test: `tests/index/pyrightPipeline.test.ts`

**Interfaces:**
- Consumes: `runPyrightPass` from Task 4
- Produces: `IndexStats.compilerUpgraded` reflects TypeScript and Python promotions combined

- [ ] **Step 1: Write the failing test**

```ts
// tests/index/pyrightPipeline.test.ts
import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { indexRepo } from "../../src/index/pipeline.js";

function pythonRepo(): string {
  const root = mkdtempSync(join(tmpdir(), "sonde-pyidx-"));
  mkdirSync(join(root, "pkg"), { recursive: true });
  writeFileSync(join(root, "pkg/__init__.py"), "");
  writeFileSync(join(root, "pkg/util.py"), "def helper():\n    return 1\n");
  writeFileSync(
    join(root, "pkg/main.py"),
    "from pkg.util import helper\n\n\ndef run():\n    return helper()\n",
  );
  return root;
}

describe("pyright pass wiring", () => {
  it("indexing a Python repo with resolve enabled never rejects", async () => {
    const root = pythonRepo();
    const dbPath = join(root, "index.sqlite");
    // Until Task 7 registers the adapter this indexes zero Python files, which
    // is correct. The property under test is that the wiring degrades cleanly
    // -- the same property that must hold if the gate verdict is FAIL.
    await expect(indexRepo(root, dbPath, { resolve: true })).resolves.toBeTruthy();
  }, 120_000);

  it("leaves no language server running after indexing", async () => {
    const root = pythonRepo();
    await indexRepo(root, join(root, "index.sqlite"), { resolve: true });
    const { execSync } = await import("node:child_process");
    expect(execSync("pgrep -fl langserver.index.js || true").toString())
      .not.toMatch(/langserver/);
  }, 120_000);
});
```

Confirm `IndexOptions` actually has a `resolve` field by reading its declaration
in `src/index/pipeline.ts` before running this; `indexRepo(root, dbPath, options)`
is the verified signature (line 224).

- [ ] **Step 2: Run it to verify it passes trivially**

Run: `nvm use && npx vitest run tests/index/pyrightPipeline.test.ts`
Expected: PASS before wiring, because nothing runs yet. That is fine — Step 4
gives it teeth, and it guards against a regression either way.

- [ ] **Step 3: Wire the pass**

In `src/index/pipeline.ts`, import beside `runCompilerPass`:

```ts
import { runPyrightPass } from "../resolve/pyrightPass.js";
```

Then inside the existing `if (options.resolve) { ... }` block, after the
TypeScript pass:

```ts
      // A repository may hold both languages. Both passes run, and each
      // degrades independently (invariant 8).
      const pyrightResult = await runPyrightPass(root, store);
      if (pyrightResult) {
        stats.compilerUpgraded =
          (stats.compilerUpgraded ?? 0) + pyrightResult.upgraded;
        stats.edges = Object.values(store.tierCounts()).reduce(
          (total, count) => total + count,
          0,
        );
      }
```

The `await` is available because `run` is already `async` (line 42). If the
compiler is telling you otherwise, stop — that means the enclosing function is
not the one this plan expects, and the surrounding code should be re-read
before continuing.

- [ ] **Step 4: Verify end to end against the real motivating case**

```bash
nvm use && npm run build
node dist/cli/main.js index /Users/anish/agentdock --resolve
```

Expected: completes without error. It reports 0 indexed files until Task 7,
which is correct — the adapter is still unregistered.

- [ ] **Step 5: Run the full suite**

Run: `nvm use && npm test`
Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/index/pipeline.ts tests/index/pyrightPipeline.test.ts
git commit -m "feat: run the pyright pass during --resolve indexing"
```

---

### Task 6: Re-run the gate — HARD STOP

**Files:**
- Create: `probes/python-placement/measure-resolved.ts`
- Modify: `package.json` (add `probe:python:resolved`)
- Modify: `probes/python-placement/FINDINGS.md` (append a new dated section)

This task changes **no** production behaviour. It measures, records, and stops.

- [ ] **Step 1: Temporarily enable Python discovery for measurement only**

The gate needs `.py` files to reach the adapter, but registration is Task 7 and conditional. Do **not** commit a registration change here. Instead the probe registers locally, in-process:

```ts
// probes/python-placement/measure-resolved.ts
//
// Measures the pyright tier against the thresholds fixed in PROTOCOL.md.
// Registration in registry.ts stays conditional on this result (spec §8.3).
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { indexRepo } from "../../src/index/pipeline.js";
import { openStore } from "../../src/store/index.js";

const root = process.argv[2];
if (!root) throw new Error("usage: measure-resolved.ts <repo-path>");

const dbDir = mkdtempSync(join(tmpdir(), "sonde-gate-"));
indexRepo(root, { resolve: true, cacheDir: dbDir } as never);

const store = openStore(join(dbDir, "index.db"));
const tiers = store.tierCounts();
const compiler = tiers.COMPILER ?? 0;
const lexical = tiers.LEXICAL ?? 0;
const heuristic = tiers.HEURISTIC ?? 0;
const unresolved = store.countUnresolved();
const external = store.countExternal();
const placed = compiler + lexical + heuristic;
const inRepo = placed + unresolved;

const unresolvedShare = +(unresolved / inRepo * 100).toFixed(2);
const placedShare = +(placed / inRepo * 100).toFixed(2);
console.log(JSON.stringify({
  repo: root,
  COMPILER: compiler, LEXICAL: lexical, HEURISTIC: heuristic,
  EXTERNAL: external, UNRESOLVED: unresolved,
  inRepoReferences: inRepo, unresolvedShare, placedShare,
  verdict: unresolvedShare <= 30 && placedShare >= 70 ? "PASS"
    : unresolvedShare <= 50 ? "MARGINAL" : "FAIL",
}, null, 2));
```

**Read `indexRepo`'s and `openStore`'s real signatures before running this** — the option and path shapes above are sketched from the call site, not from their declarations. If the probe cannot run without registering Python, add the registry entry **in this task's working tree only, uncommitted**, run the measurement, then `git checkout src/adapters/registry.ts src/repo/discover.ts` before committing. Say so explicitly in FINDINGS.md if you do this.

- [ ] **Step 2: Add the script entry**

```json
    "probe:python:resolved": "node --import tsx probes/python-placement/measure-resolved.ts"
```

- [ ] **Step 3: Measure both corpora**

```bash
nvm use
npm run probe:python:resolved -- /Users/anish/agentdock
npm run probe:python:resolved -- /private/tmp/sonde-corpora/pydantic
```

Record both outputs verbatim. pydantic is expected to take several minutes (~195s of pyright queries plus indexing). If you change anything and re-run, record that you did and why.

- [ ] **Step 4: Append the results to FINDINGS.md**

Append a new dated section — **do not edit the 2026-08-28 tree-sitter results or the reviewer note.** That record stands; this is a second measurement of a new tier against the same bar.

Include: both corpora's full tier distributions, the computed shares, the verdict per corpus, the worse verdict as the outcome, and a comparison table against the tree-sitter-only numbers (62.81% / 57.39% unresolved). If the builtin references now classify as `EXTERNAL`, say so with counts — that was the predicted side effect in spec §5.2 and it should be confirmed or refuted, not assumed.

- [ ] **Step 5: Commit the measurement**

```bash
git add probes/python-placement/measure-resolved.ts probes/python-placement/FINDINGS.md package.json
git commit -m "test: measure the pyright tier against the fixed placement gate"
```

- [ ] **Step 6: STOP and report**

Report the numbers, the verdict, and whether Task 7 proceeds. On MARGINAL or FAIL, **Task 7 does not run**: Python stays unregistered, and the recommendation becomes whatever the sampled unresolved causes actually point at. Do not adjust a threshold. Do not average the corpora.

---

### Task 7: Register — conditional on a PASS

Run this task **only** if Task 6 recorded PASS.

**Files:**
- Modify: `src/adapters/registry.ts`
- Modify: `src/repo/discover.ts`
- Modify: `README.md`, `CHANGELOG.md`
- Test: `tests/adapters/registry.test.ts`, `tests/repo/discoverExtensions.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// tests/adapters/registry.test.ts — append
it("routes .py files to the Python adapter", () => {
  expect(adapterForPath("src/app/util.py")?.language).toBe("python");
});
```

```ts
// tests/repo/discoverExtensions.test.ts — replace the default-exclusion case
it("discovers Python files by default once the adapter ships", () => {
  const found = discover(repo(), { hashContent: false }).map((f) => f.path);
  expect(found).toContain("a.ts");
  expect(found).toContain("b.py");
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `nvm use && npx vitest run tests/adapters/registry.test.ts tests/repo/discoverExtensions.test.ts`
Expected: FAIL on both.

- [ ] **Step 3: Register and open discovery, in one commit**

Both are required. Shipping only the first leaves `sonde index` reporting 0 files while every unit test passes — the registry decides which adapter handles a file, discovery decides whether a file is ever offered to one.

`src/adapters/registry.ts`:

```ts
import { pythonAdapter } from "./python/index.js";
import { getPythonParser } from "./python/parser.js";

const registrations: readonly Registration[] = [
  { adapter: typescriptAdapter, initialize: getTsParser },
  { adapter: swiftAdapter, initialize: getSwiftParser },
  { adapter: pythonAdapter, initialize: getPythonParser },
];
```

`src/repo/discover.ts`:

```ts
const SOURCE_EXTENSIONS = new Set([
  ".ts", ".tsx", ".mts", ".cts", ".swift", ".py", ".pyi",
]);
```

- [ ] **Step 4: Run the full suite**

Run: `nvm use && npm test`
Expected: all tests pass.

- [ ] **Step 5: Smoke-test the motivating case**

```bash
nvm use && npm run build
node dist/cli/main.js index /Users/anish/agentdock --resolve
node dist/cli/main.js status /Users/anish/agentdock
```

Expected: a non-zero file count where `sonde init` reported `indexed 0 files`. Record the real numbers in the commit body.

- [ ] **Step 6: Update the README**

Add Python to the supported languages. Under **Known limitations**, state plainly:

> **Python resolution requires `--resolve`.** Without it, Python indexes at the
> tree-sitter tier only, which measured 62.81% / 57.39% unresolved on real
> corpora and is not recommended for structural queries. Python edges are also
> not verified against an independent oracle the way TypeScript's are in
> `ORACLE.md`; the gate measured placement, not correctness.

- [ ] **Step 7: Update the CHANGELOG**

Under `## [Unreleased]` → `### Added`, citing measured numbers rather than adjectives.

- [ ] **Step 8: Commit**

```bash
git add src/adapters/registry.ts src/repo/discover.ts tests/ README.md CHANGELOG.md
git commit -m "feat: register the Python adapter after passing the placement gate"
```

- [ ] **Step 9: Record the decision**

```bash
whyline note "Ship Python on the pyright COMPILER tier after a passing gate" \
  --because "<measured shares on both corpora, and the tree-sitter baseline they improve on>" \
  --rejected "Registering on the tree-sitter tier alone: measured 62.81%/57.39% unresolved against a 30% ceiling" \
  --file src/adapters/registry.ts
```

---

## Self-Review

**Spec coverage.** §3.2 bridge → Task 1. §3.3 contract, `maxBuffer`, timeout → Tasks 1, 4. §3.4 query scope → Task 2 (the read APIs that make filtering possible) and Task 4. §4.1 position recovery without a schema change → Task 4. §4.2 definition→key → Task 3. §5.1 tier assignment and the three outcomes → Task 4. §5.2 builtins closing as a side effect → Task 6 Step 4 requires confirming or refuting it rather than assuming. §5.3 no repo environment → Task 1 (no `pythonPath` is ever sent). §6 degradation → Task 4's `catch` and short-result guard, Task 5's independent degradation. §7 bundled dependency → Task 1 Step 1. §8 the gate → Task 6. §8.3 conditional registration → Task 7. §9 file structure → Tasks 1, 3, 4. §11 risks: `maxBuffer` and timeout in Task 4, version pinning in Task 1, bridge path in Task 5 Step 4.

**Type consistency.** `BridgeInput`/`BridgeOutput`/`BridgeQuery`/`BridgeTarget` are defined in Task 1 and imported unchanged in Task 4. `PyrightPassResult` is defined in Task 4 and consumed in Task 5. `unresolvedRefSites`/`heuristicEdgeSites`/`countExternal` are defined in Task 2 and used in Tasks 4 and 6. `pythonSymbolAt(path, source, line)` is defined in Task 3 with a 1-based `line`, and Task 4 converts the bridge's 0-based line with `target.line + 1`.

**Known soft spots, flagged rather than hidden.**

1. **Column recovery by `indexOf(ref.name)`** (Task 4) picks the *first* occurrence of the name on a line. For `foo(foo)`, or any line where the name appears twice, it may target the wrong occurrence. Pyright will usually still resolve to the same definition, but not always. The precise fix is for the extractor to return a column, which changes a shared type and is deliberately deferred. **If Task 6's measurement looks anomalous, suspect this first.**
2. **Task 6's probe sketches `indexRepo` and store-construction call shapes.** `indexRepo(root, dbPath, options)` is verified, but the probe's store handling is not. The task instructs reading the real declarations first.
3. **Task 6 may need an uncommitted registry entry** to make `.py` reachable during measurement. The task specifies reverting it before committing and disclosing it in FINDINGS.md. This is the one place the plan asks for a temporary local change, and it must not leak into a commit.
