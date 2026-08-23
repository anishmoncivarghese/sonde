# Sonde MCP Surface (Plan 2 of 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose the symbol graph built by Plan 1 (EXTRACT→LINK→RESOLVE→STORE) through three MCP tools — `find_symbols`, `query_graph`, `get_impact_radius` — with drift-aware freshness, token-budgeted responses, and a README that publishes the oracle accuracy numbers. This closes Definition-of-Done items 1, 2, 3, and 4 in the design spec (§12); the 12-task benchmark (item 5) is Plan 3.

**Architecture:** Two new library layers sit on top of the existing `store`: `query/` (find, traverse, impact — read-only graph queries) and `pack/` (drift check, read-time re-verification, token budgeting, envelope assembly). `mcp/` is a thin `@modelcontextprotocol/sdk` wrapper that calls `query/` and `pack/` and returns their envelopes as tool results. The CLI grows `search`/`query`/`impact`/`mcp serve` subcommands over the same functions, so the MCP server and CLI can never disagree about what a query returns.

Before any of that can work, two real gaps in Plan 1's data model have to close: `symbol_fts` (declared in the spec's data model, §6, but never added to `schema.sql`) and file-level `symbol` rows (`kind: "file"` is a declared vocabulary value, and `IMPORTS` a declared edge kind, but neither was ever produced — `query_graph`'s `imports_of`/`imported_by`/file-level `contained_by` patterns have no data to query without them). Task 1 closes the second gap; Task 2 closes the first. Both touch already-reviewed, committed Plan 1 code, by design — this was checked with the human before writing this plan, and confirmed as in-scope rather than deferred.

**Tech Stack:** TypeScript (strict), `@modelcontextprotocol/sdk` (stdio transport), `js-tiktoken` (`o200k_base`), `zod` (MCP SDK peer dependency), the existing `better-sqlite3`/`web-tree-sitter`/`commander`/`typescript` stack. No new native compilation — all three new dependencies are pure JS/WASM.

**Spec:** `docs/superpowers/specs/2026-08-16-sonde-design.md` (revision 2), primarily §6 (data model), §7 (MCP tools), §8 (freshness), §9 (error handling).

## Global Constraints

- **Node 22+**; ESM only. Run `nvm use` in every shell before `npm`/`node` commands (unchanged from Plan 1).
- **Zero native compilation**, still. `@modelcontextprotocol/sdk@^1.30.0`, `js-tiktoken@^1.0.21`, `zod@^4.4.3` — verified on npm 2026-08-19, all pure JS, no `node-gyp`.
- **SEC-008:** never execute repository code. Unchanged.
- **SEC-001/002/003:** all filesystem reads go through `repo/boundary.ts`. The one new exception is `repo/git.ts`, which shells out to the `git` binary (not repository *code*) via `execFileSync` with an argument array (never a shell string) and `cwd` pinned to the canonicalized boundary root.
- **SEC-010:** MCP tools are read-only with respect to the repository. They may write to the index cache on the refresh path (§8.3) — that is not a repository mutation.
- **SEC-012:** graph traversal is bounded by depth, result count, and wall clock, with a cycle-safe visited set. `get_impact_radius` enforces this explicitly (Task 8).
- **Tier vocabulary is fixed:** `COMPILER > LEXICAL > HEURISTIC` sort order; `EXTERNAL`/`UNRESOLVED` are not sorted, they are separate buckets. This plan does not implement the `COMPILER` tier — no task upgrades resolution with a live `tsc` `Program`, so every edge produced by Plan 1 or this plan is `LEXICAL`, `HEURISTIC`, `EXTERNAL`, or `UNRESOLVED`. `COMPILER` stays a defined-but-empty tier, exactly as `ORACLE.md` already shows.
- **Edge kinds are fixed:** `CONTAINS | IMPORTS | CALLS | REFERENCES | IMPLEMENTS | INHERITS | TESTS`. This plan starts emitting `IMPORTS` (Task 1); `TESTS` is not implemented by this plan (deferred — see "Out of scope" below).
- **`kind` vocabulary is fixed:** `file | module | class | interface | type | enum | function | method | property | variable | test`. This plan starts minting `kind: "file"` symbols (Task 1).
- **Never fabricate.** Unchanged. An unknown target is `EXTERNAL` or `UNRESOLVED` with a reason.
- **Tokenizer:** `o200k_base` via `js-tiktoken`. Counts are always reported as `estimated`, tolerance ±10% (§7.5).
- **`AUTO_REFRESH_LIMIT = 25`** (already defined in `src/index/drift.ts` from Plan 1; reused, not redefined).
- **Commit after every task.** Conventional commits.

### Out of scope for this plan

- **`TESTS` edges** (§6.4). No adapter in Plan 1 marks `is_test` reference targets with a dedicated edge kind — `symbol.is_test` is stored, but nothing emits `TESTS` edges from a test symbol to what it references. Building this needs its own tested fan-out-capping logic (max 25 targets, ranked by reference count then proximity) and is large enough to deserve its own task list. `get_impact_radius` (Task 8) is written against a `TESTS`-edge query that will simply return nothing until that lands — documented inline, not silently ignored.
- **The `COMPILER` tier / `tsResolver` upgrade pass** (§4.3, §8.4). Not built by Plan 1 or this plan. `doctor` and every envelope already report `tscVersion` from the bundled `typescript`; wiring an actual `ts.Program` into resolution is separate, larger work.
- **Ranking weight tuning** (§7.4, §16.3). The formula is implemented as specified with its literal constants; tuning against the benchmark is Plan 3's job once the benchmark exists.
- **The Swift adapter, semantic search, and everything else already listed in spec §13.**

---

## File Structure

```
src/
  repo/
    git.ts              # NEW — revision, dirty state, changed-file list (git CLI, not git library)
  index/
    cache.ts            # NEW — shared indexPathFor(), extracted from cli/main.ts
  query/
    find.ts              # NEW — find_symbols: exact → exact → FTS5/BM25
    rank.ts               # NEW — §7.4 ranking formula + live FAN_IN_P95
    traverse.ts          # NEW — query_graph: all 11 patterns
    impact.ts             # NEW — get_impact_radius: bounded reverse traversal
  pack/
    verify.ts            # NEW — read-time re-verification (freshness Guarantee A, §8.1)
    refresh.ts            # NEW — drift-aware read path (freshness Guarantee B, §8.2-8.4)
    tokens.ts              # NEW — token estimation + budget packer (§7.5)
    envelope.ts            # NEW — response envelope assembly (§7.6)
    impactpack.ts          # NEW — composes impact.ts + tokens.ts + verify.ts + envelope.ts
  mcp/
    schemas.ts            # NEW — zod input schemas for the three tools
    server.ts              # NEW — McpServer wiring, stdio transport
  cli/
    main.ts               # MODIFIED — add search/query/impact/mcp serve; use index/cache.ts
  adapters/typescript/
    index.ts               # MODIFIED — mint a file-kind symbol per extracted file
  resolve/
    resolver.ts             # MODIFIED — CONTAINS from file to top-level symbols; IMPORTS edges
  store/
    schema.sql              # MODIFIED — symbol_fts FTS5 virtual table + sync triggers
    migrate.ts               # MODIFIED — corrected rebuild instruction in SchemaVersionError
  version.ts                 # MODIFIED — SCHEMA_VERSION 1 -> 2
tests/
  repo/git.test.ts
  index/cache.test.ts
  query/find.test.ts, rank.test.ts, traverse.test.ts, impact.test.ts
  pack/verify.test.ts, refresh.test.ts, tokens.test.ts, envelope.test.ts
  mcp/server.test.ts
  cli/cli.test.ts          # MODIFIED — search/query/impact/mcp serve coverage
  adapters/typescript-adapter.test.ts  # MODIFIED
  resolve/resolver.test.ts             # MODIFIED
  store/store.test.ts                  # MODIFIED
README.md                              # NEW
```

---

### Task 1: File symbols, file-level CONTAINS, and IMPORTS edges

**Files:**
- Modify: `src/adapters/typescript/index.ts`, `src/resolve/resolver.ts`
- Test: `tests/adapters/typescript-adapter.test.ts`, `tests/resolve/resolver.test.ts`

**Interfaces:**
- Consumes: `stableKey()` (exported from `src/adapters/typescript/symbols.ts`, unchanged), `SymbolTable.qualifiedInFile()` (unchanged, from `src/resolve/symboltable.ts`)
- Produces: every `ExtractResult.symbols` array now contains exactly one `kind: "file"` entry per file, `stableKey` = `` `ts:${path}#` `` (empty scope chain), `qualifiedName` = the file's repo-relative path. `resolveAll` now emits `CONTAINS` edges from that file symbol to every top-level symbol in the file, and `IMPORTS` edges from a file symbol to the file symbol of every internal module it imports from (plus `external_ref` rows for packages it imports from). Later tasks (5, 6) query these directly.

Two things ride along for free once a file symbol exists as a valid containment target: top-level references — a bare call written outside any function or class — were previously silently dropped by `extractReferences`'s `enclosing()` lookup (it returned `null` and the reference was discarded). They now attribute to the file symbol instead of vanishing, which is a real correctness fix for invariant 1 ("never fabricate... never silently dropped"), not new scope.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/adapters/typescript-adapter.test.ts — add inside describe("typescriptAdapter", ...)
it("mints a file symbol covering the whole extracted file", () => {
  const result = typescriptAdapter.extract(
    "src/a.ts",
    Buffer.from("export function run() {}"),
  );
  const file = result.symbols.find((s) => s.kind === "file");
  expect(file).toMatchObject({
    stableKey: "ts:src/a.ts#",
    qualifiedName: "src/a.ts",
    shortName: "a.ts",
  });
});

it("attributes a top-level reference to the file symbol instead of dropping it", () => {
  const result = typescriptAdapter.extract(
    "src/a.ts",
    Buffer.from('import { setup } from "./b";\nsetup();'),
  );
  const file = result.symbols.find((s) => s.kind === "file");
  expect(result.references).toContainEqual(
    expect.objectContaining({ name: "setup", fromSymbolKey: file?.stableKey }),
  );
});
```

```ts
// tests/resolve/resolver.test.ts — add a fileSymbol() helper alongside symbol(), and two new it() blocks
function fileSymbol(file: string): SymbolRecord {
  return {
    stableKey: `ts:${file}#`,
    qualifiedName: file,
    shortName: file.split("/").at(-1) ?? file,
    kind: "file",
    signature: null,
    startByte: 0,
    endByte: 1,
    startLine: 1,
    endLine: 1,
    bodyHash: null,
    exported: false,
    isTest: false,
  };
}

// inside describe("resolveAll", ...)
it("attaches a top-level symbol to its file via CONTAINS", () => {
  const file = fileSymbol("src/lib.ts");
  const top = symbol("src/lib.ts", "run");
  const files = new Map<string, ExtractResult>([
    ["src/lib.ts", extracted([file, top])],
  ]);

  const result = resolveAll(files, new Map(), cfg, boundary);

  expect(result.edges).toContainEqual({
    srcKey: file.stableKey,
    dstKey: top.stableKey,
    kind: "CONTAINS",
    tier: "LEXICAL",
    confidence: 1,
    siteLine: top.startLine,
  });
});

it("emits an IMPORTS edge to a resolved internal module and an external_ref for an external one", () => {
  const caller = fileSymbol("src/caller.ts");
  const lib = fileSymbol("src/lib.ts");
  const files = new Map<string, ExtractResult>([
    ["src/caller.ts", extracted(
      [caller, symbol("src/caller.ts", "run")],
      [],
      [
        { localName: "helper", importedName: "helper", specifier: "./lib", siteLine: 1 },
        { localName: "React", importedName: "*", specifier: "react", siteLine: 2 },
      ],
    )],
    ["src/lib.ts", extracted([lib, symbol("src/lib.ts", "helper")])],
  ]);

  const result = resolveAll(
    files,
    exportsFor([["src/lib.ts", [["helper", "src/lib.ts"]]]]),
    cfg,
    boundary,
  );

  expect(result.edges).toContainEqual(expect.objectContaining({
    srcKey: caller.stableKey,
    dstKey: lib.stableKey,
    kind: "IMPORTS",
    tier: "LEXICAL",
  }));
  expect(result.external).toContainEqual(expect.objectContaining({
    srcKey: caller.stableKey,
    name: "react",
    packageOrLib: "react",
  }));
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/adapters/typescript-adapter.test.ts tests/resolve/resolver.test.ts`
Expected: FAIL — no `kind: "file"` symbol exists yet, no `IMPORTS` edges are emitted.

- [ ] **Step 3: Mint the file symbol in the adapter**

```ts
// src/adapters/typescript/index.ts
import { basename } from "node:path";
import type { Tree } from "web-tree-sitter";
import { EXTRACTOR_VERSION } from "../../version.js";
import type { ExtractResult, LanguageAdapter, SymbolRecord } from "../types.js";
import { extractModuleTables } from "./modules.js";
import { getTsParserSync } from "./parser.js";
import { extractReferences } from "./references.js";
import { extractSymbols, stableKey } from "./symbols.js";

function fileSymbol(path: string, tree: Tree): SymbolRecord {
  return {
    stableKey: stableKey(path, []),
    qualifiedName: path,
    shortName: basename(path),
    kind: "file",
    signature: null,
    startByte: 0,
    endByte: tree.rootNode.endIndex,
    startLine: 1,
    endLine: tree.rootNode.endPosition.row + 1,
    bodyHash: null,
    exported: false,
    isTest: false,
  };
}

export const typescriptAdapter: LanguageAdapter = {
  language: "typescript",
  extractorVersion: EXTRACTOR_VERSION,
  matches: (path) =>
    /\.(ts|tsx|mts|cts)$/.test(path) && !/\.d\.(ts|mts|cts)$/.test(path),
  extract(path, bytes): ExtractResult {
    const source = Buffer.from(bytes).toString("utf8");
    const tree = getTsParserSync().parse(source);
    if (!tree) {
      return {
        symbols: [],
        references: [],
        imports: [],
        exports: [],
        diagnostics: [
          { severity: "error", message: "parser returned no tree", line: 1 },
        ],
      };
    }

    const symbols = [fileSymbol(path, tree), ...extractSymbols(path, source, tree)];
    const { imports, exports } = extractModuleTables(source, tree);
    return {
      symbols,
      references: extractReferences(path, source, tree, symbols),
      imports,
      exports,
      diagnostics: tree.rootNode.hasError
        ? [{ severity: "warning", message: "parse errors present", line: 1 }]
        : [],
    };
  },
};
```

`stableKey` must become an exported symbol of `symbols.ts` — check it already is (`export function stableKey(...)` at the top of that file); no change needed there.

- [ ] **Step 4: Emit CONTAINS-from-file and IMPORTS edges in the resolver**

```ts
// src/resolve/resolver.ts — replace the existing CONTAINS loop and add IMPORTS emission
// after `const bindings = bindImports(file, result.imports, exportMap, cfg, boundary);`

    const fileSymbolRow = table.qualifiedInFile(file, file);
    if (fileSymbolRow) {
      const importTargets = new Map<string, number>();
      const importPackages = new Map<string, number>();
      for (const imp of result.imports) {
        const binding = bindings.get(imp.localName);
        if (!binding) continue;
        if ("file" in binding && !importTargets.has(binding.file)) {
          importTargets.set(binding.file, imp.siteLine);
        } else if ("external" in binding && !importPackages.has(binding.external)) {
          importPackages.set(binding.external, imp.siteLine);
        }
      }
      for (const [targetFile, siteLine] of importTargets) {
        if (targetFile === file) continue;
        const target = table.qualifiedInFile(targetFile, targetFile);
        if (!target) continue;
        out.edges.push({
          srcKey: fileSymbolRow.stableKey,
          dstKey: target.stableKey,
          kind: "IMPORTS",
          tier: "LEXICAL",
          confidence: 1,
          siteLine,
        });
      }
      for (const [pkg, siteLine] of importPackages) {
        out.external.push({
          srcKey: fileSymbolRow.stableKey,
          name: pkg,
          packageOrLib: pkg,
          siteLine,
        });
      }
    }

    for (const symbol of result.symbols) {
      if (symbol.kind === "file") continue;
      const separator = symbol.qualifiedName.lastIndexOf(".");
      const parentName = separator < 0 ? file : symbol.qualifiedName.slice(0, separator);
      const parent = table.qualifiedInFile(file, parentName);
      if (!parent) continue;
      out.edges.push({
        srcKey: parent.stableKey,
        dstKey: symbol.stableKey,
        kind: "CONTAINS",
        tier: "LEXICAL",
        confidence: 1,
        siteLine: symbol.startLine,
      });
    }
```

This replaces the old `if (separator < 0) continue;` early-exit with a fallback to `file` as the parent's qualified name — which only resolves to something when a file symbol was registered in `table` for that file (true in production via Task 1's adapter change; false, and therefore a silent no-op, in every existing hand-built resolver fixture that doesn't include one — confirmed by reading `tests/resolve/resolver.test.ts` before writing this task, so none of its five existing tests need changes).

- [ ] **Step 5: Run the two test files again**

Run: `npx vitest run tests/adapters/typescript-adapter.test.ts tests/resolve/resolver.test.ts`
Expected: PASS, including the five pre-existing `resolver.test.ts` cases (unchanged).

- [ ] **Step 6: Run the full suite, typecheck, and build**

Run: `npm test && npm run typecheck && npm run build`
Expected: all PASS. (No existing test asserts an exact symbol count or an exact `result.symbols` list — they use `toContain`/`toContainEqual`/`toBeGreaterThanOrEqual` throughout — so the new file symbol does not break Task 1–14 tests. Confirmed by grep before writing this task.)

- [ ] **Step 7: Commit**

```bash
git add src/adapters/typescript/index.ts src/resolve/resolver.ts \
  tests/adapters/typescript-adapter.test.ts tests/resolve/resolver.test.ts
git commit -m "feat: mint file symbols and emit IMPORTS edges"
```

---

### Task 2: `symbol_fts` FTS5 table

**Files:**
- Modify: `src/store/schema.sql`, `src/store/migrate.ts`, `src/version.ts`
- Test: `tests/store/store.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: a `symbol_fts` FTS5 virtual table kept in sync with `symbol` by triggers — no application code writes to it. Task 5 (`query/find.ts`) queries it directly: `SELECT ... FROM symbol_fts WHERE symbol_fts MATCH ? ORDER BY bm25(symbol_fts)`.

The data model (§6) also lists a `doc` column for FTS. No task in Plan 1 extracts JSDoc/doc comments, so there is no `doc` field to index — `symbol_fts` covers `short_name`, `qualified_name`, and `signature` only. This is a disclosed scope-narrowing, not a silent omission: doc-comment extraction would be new adapter work (capturing leading comment nodes in `symbols.ts`), out of this plan's stated scope.

- [ ] **Step 1: Write the failing test**

```ts
// tests/store/store.test.ts — add inside the existing describe block
it("keeps symbol_fts in sync with inserted and deleted symbols", () => {
  store.upsertFile({
    path: "src/auth.ts",
    contentHash: "h1",
    mtimeMs: 1,
    size: 10,
  });
  store.insertSymbols([{
    stableKey: "ts:src/auth.ts#refreshSession",
    filePath: "src/auth.ts",
    qualifiedName: "refreshSession",
    shortName: "refreshSession",
    kind: "function",
    signature: "function refreshSession(): void",
    startByte: 0, endByte: 1, startLine: 1, endLine: 1,
    bodyHash: null, exported: true, isTest: false,
  }]);

  const hit = db.prepare(
    `SELECT s.qualified_name AS qualifiedName FROM symbol_fts f
     JOIN symbol s ON s.id = f.rowid
     WHERE symbol_fts MATCH ?`,
  ).all("refresh") as Array<{ qualifiedName: string }>;
  expect(hit).toContainEqual({ qualifiedName: "refreshSession" });

  store.deleteFile("src/auth.ts");
  const afterDelete = db.prepare(
    "SELECT COUNT(*) AS n FROM symbol_fts WHERE symbol_fts MATCH ?",
  ).get("refresh") as { n: number };
  expect(afterDelete.n).toBe(0);
});
```

Check the top of `tests/store/store.test.ts` for how `db`/`store` are already constructed in `beforeEach` (Task 4's pattern — open a fresh in-memory or temp-file db, `migrate(db)`, `new Store(db)`) and use the same instances; do not open a second connection.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/store/store.test.ts`
Expected: FAIL — `no such table: symbol_fts`.

- [ ] **Step 3: Add the FTS5 table and sync triggers**

```sql
-- src/store/schema.sql — append after the existing indexes
CREATE VIRTUAL TABLE IF NOT EXISTS symbol_fts USING fts5(
  short_name, qualified_name, signature,
  content='symbol', content_rowid='id'
);

CREATE TRIGGER IF NOT EXISTS symbol_fts_ai AFTER INSERT ON symbol BEGIN
  INSERT INTO symbol_fts(rowid, short_name, qualified_name, signature)
  VALUES (new.id, new.short_name, new.qualified_name, new.signature);
END;

CREATE TRIGGER IF NOT EXISTS symbol_fts_ad AFTER DELETE ON symbol BEGIN
  INSERT INTO symbol_fts(symbol_fts, rowid, short_name, qualified_name, signature)
  VALUES ('delete', old.id, old.short_name, old.qualified_name, old.signature);
END;

CREATE TRIGGER IF NOT EXISTS symbol_fts_au AFTER UPDATE ON symbol BEGIN
  INSERT INTO symbol_fts(symbol_fts, rowid, short_name, qualified_name, signature)
  VALUES ('delete', old.id, old.short_name, old.qualified_name, old.signature);
  INSERT INTO symbol_fts(rowid, short_name, qualified_name, signature)
  VALUES (new.id, new.short_name, new.qualified_name, new.signature);
END;
```

`content='symbol', content_rowid='id'` makes this an external-content FTS5 table: it stores no text of its own, just the index, and `symbol.id`'s cascade deletes (already `ON DELETE CASCADE` from `file`, already `PRAGMA foreign_keys = ON` in `db.ts`) fire the `AFTER DELETE` trigger exactly like any other delete — no `Store` code changes needed for cascade correctness.

```ts
// src/version.ts
export const SCHEMA_VERSION = 2;
export const EXTRACTOR_VERSION = "0.1.0";
```

Bumping `SCHEMA_VERSION` forces every existing on-disk index (schema version 1) to fail `migrate()` with `SchemaVersionError` on next use rather than silently running with an empty, never-backfilled `symbol_fts` table — the whole point of the version check (spec §9: "Schema version mismatch: Refuse to read... never guess").

```ts
// src/store/migrate.ts — SchemaVersionError constructor, correct the instruction to match the real CLI surface
export class SchemaVersionError extends Error {
  constructor(found: number) {
    super(
      `index schema version ${found} != supported ${SCHEMA_VERSION}; ` +
        'run "sonde clean" then "sonde index"',
    );
    this.name = "SchemaVersionError";
  }
}
```

(The previous message referenced a `--rebuild` flag that was never implemented in `src/cli/main.ts`; `clean` + `index` is what the CLI actually supports. No test asserts the message text — confirmed by grep before writing this task — so this is a safe fix, not a breaking change.)

- [ ] **Step 4: Run the test again**

Run: `npx vitest run tests/store/store.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the full suite, typecheck, and build**

Run: `npm test && npm run typecheck && npm run build`
Expected: all PASS. (`migrate()` applies `schema.sql` idempotently via `CREATE ... IF NOT EXISTS`/`CREATE TRIGGER IF NOT EXISTS`, and every test that opens a fresh db calls `migrate()` first, so no test needs a stale on-disk cache accounted for.)

- [ ] **Step 6: Commit**

```bash
git add src/store/schema.sql src/store/migrate.ts src/version.ts tests/store/store.test.ts
git commit -m "feat: add symbol_fts FTS5 index with sync triggers"
```

---

### Task 3: `repo/git.ts` — revision, dirty state, changed files

**Files:**
- Create: `src/repo/git.ts`
- Test: `tests/repo/git.test.ts`

**Interfaces:**
- Consumes: `RepoBoundary` (unchanged, from Task 2 of Plan 1).
- Produces: `gitState(boundary: RepoBoundary): { revision: string | null; dirty: boolean }` and `changedFiles(boundary: RepoBoundary, against?: string): string[]`. Task 9 (`pack/envelope.ts`) uses `gitState` for the envelope's `repository{revision, dirty}` field (§7.6); Task 8 (`query/impact.ts`) uses `changedFiles` for `from_git_diff: true`.

Both functions shell out to the `git` binary with `execFileSync` and an argument array (never a shell string, never string-interpolated paths) and `cwd: boundary.root` — this invokes the `git` executable, not repository *code*, so SEC-008 does not apply; it is the same category of operation as calling `tsc` or `node-gyp`, not `require()`-ing something from the target repo. Never throws: a non-git directory, or `git` not on `PATH`, degrades to `{ revision: null, dirty: false }` / `[]` rather than failing the whole tool call (invariant 8).

- [ ] **Step 1: Write the failing test**

```ts
// tests/repo/git.test.ts
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { changedFiles, gitState } from "../../src/repo/git.js";
import { RepoBoundary } from "../../src/repo/boundary.js";

let root: string;
let boundary: RepoBoundary;

function git(...args: string[]): void {
  execFileSync("git", args, { cwd: root });
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "cg-git-"));
  git("init", "-q");
  git("config", "user.email", "test@example.com");
  git("config", "user.name", "test");
  writeFileSync(join(root, "a.ts"), "export const a = 1;\n");
  git("add", "a.ts");
  git("commit", "-q", "-m", "initial");
  boundary = new RepoBoundary(root);
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

describe("gitState", () => {
  it("reports the current revision and a clean tree", () => {
    const state = gitState(boundary);
    expect(state.revision).toMatch(/^[0-9a-f]{40}$/);
    expect(state.dirty).toBe(false);
  });

  it("reports dirty after an uncommitted change", () => {
    writeFileSync(join(root, "a.ts"), "export const a = 2;\n");
    expect(gitState(boundary).dirty).toBe(true);
  });

  it("degrades to a null revision outside a git repository", () => {
    const bare = mkdtempSync(join(tmpdir(), "cg-nogit-"));
    try {
      const bareBoundary = new RepoBoundary(bare);
      expect(gitState(bareBoundary)).toEqual({ revision: null, dirty: false });
    } finally {
      rmSync(bare, { recursive: true, force: true });
    }
  });
});

describe("changedFiles", () => {
  it("lists files changed since the given revision", () => {
    const base = gitState(boundary).revision!;
    writeFileSync(join(root, "b.ts"), "export const b = 1;\n");
    git("add", "b.ts");
    git("commit", "-q", "-m", "second");
    expect(changedFiles(boundary, base)).toEqual(["b.ts"]);
  });

  it("lists the uncommitted working-tree diff when no revision is given", () => {
    writeFileSync(join(root, "a.ts"), "export const a = 3;\n");
    expect(changedFiles(boundary)).toEqual(["a.ts"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/repo/git.test.ts`
Expected: FAIL — cannot resolve `src/repo/git.js`.

- [ ] **Step 3: Implement**

```ts
// src/repo/git.ts
import { execFileSync } from "node:child_process";
import type { RepoBoundary } from "./boundary.js";

export interface GitState {
  revision: string | null;
  dirty: boolean;
}

function run(boundary: RepoBoundary, args: string[]): string | null {
  try {
    return execFileSync("git", args, {
      cwd: boundary.root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

export function gitState(boundary: RepoBoundary): GitState {
  const revision = run(boundary, ["rev-parse", "HEAD"]);
  if (revision === null) return { revision: null, dirty: false };
  const status = run(boundary, ["status", "--porcelain"]);
  return { revision, dirty: (status ?? "").length > 0 };
}

export function changedFiles(boundary: RepoBoundary, against?: string): string[] {
  const args = against
    ? ["diff", "--name-only", `${against}..HEAD`]
    : ["diff", "--name-only", "HEAD"];
  const output = run(boundary, args);
  if (output === null || output.length === 0) return [];
  return output.split("\n");
}
```

The `changedFiles(boundary)` no-`against` path diffs the working tree against `HEAD` (uncommitted changes) — matching `get_impact_radius`'s `from_git_diff: true` use case, which is "what am I about to break with my current edits," not a historical range.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/repo/git.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the full suite, typecheck, and build**

Run: `npm test && npm run typecheck && npm run build`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add src/repo/git.ts tests/repo/git.test.ts
git commit -m "feat: add git revision, dirty-state, and changed-file detection"
```

---

### Task 4: `index/cache.ts` — shared index-path resolution

**Files:**
- Create: `src/index/cache.ts`
- Modify: `src/cli/main.ts`
- Test: `tests/index/cache.test.ts`

**Interfaces:**
- Consumes: `RepoBoundary` (unchanged).
- Produces: `indexPathFor(root: string): string`. Both the CLI (already has this, inlined) and the MCP server (Task 11) must resolve to the exact same path for the exact same repository, or `sonde index` and the MCP server would maintain two different caches for one repo. Extracting it once and importing it from both call sites is the only way to guarantee that.

- [ ] **Step 1: Write the failing test**

```ts
// tests/index/cache.test.ts
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { indexPathFor } from "../../src/index/cache.js";

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "cg-cache-"));
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

describe("indexPathFor", () => {
  it("returns a stable path for the same canonical root", () => {
    expect(indexPathFor(root)).toBe(indexPathFor(root));
  });

  it("returns different paths for different roots", () => {
    const other = mkdtempSync(join(tmpdir(), "cg-cache-"));
    try {
      expect(indexPathFor(root)).not.toBe(indexPathFor(other));
    } finally {
      rmSync(other, { recursive: true, force: true });
    }
  });

  it("ends in index.sqlite under the user cache directory", () => {
    expect(indexPathFor(root)).toMatch(/\.cache[\\/]sonde[\\/][0-9a-f]{16}[\\/]index\.sqlite$/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/index/cache.test.ts`
Expected: FAIL — cannot resolve `src/index/cache.js`.

- [ ] **Step 3: Extract the function**

```ts
// src/index/cache.ts
import { createHash } from "node:crypto";
import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { RepoBoundary } from "../repo/boundary.js";

/** Indexes are disposable cache data keyed by canonical root (spec §3). */
export function indexPathFor(root: string): string {
  const boundary = new RepoBoundary(root);
  const hash = createHash("sha256")
    .update(boundary.root)
    .digest("hex")
    .slice(0, 16);
  const directory = join(homedir(), ".cache", "sonde", hash);
  mkdirSync(directory, { recursive: true });
  return join(directory, "index.sqlite");
}
```

```ts
// src/cli/main.ts — remove the local indexPathFor() and its now-unused imports
// (createHash, homedir, mkdirSync are no longer used directly by this file),
// and add:
import { indexPathFor } from "../index/cache.js";
```

Delete the old inline `function indexPathFor(root: string): string { ... }` block entirely; every call site (`index`, `update`, `status`, `doctor`, `clean`) is unchanged since the signature is identical.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/index/cache.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the full suite, typecheck, and build**

Run: `npm test && npm run typecheck && npm run build`
Expected: all PASS, including the existing `tests/cli/cli.test.ts` (unaffected — same cache path behavior, just relocated).

- [ ] **Step 6: Commit**

```bash
git add src/index/cache.ts src/cli/main.ts tests/index/cache.test.ts
git commit -m "refactor: extract indexPathFor into a shared module"
```

---

### Task 5: `query/find.ts` — `find_symbols`

**Files:**
- Create: `src/query/find.ts`
- Test: `tests/query/find.test.ts`

**Interfaces:**
- Consumes: `Db` (from `src/store/db.ts`), `symbol_fts` (Task 2), `SymbolKind` (from `src/store/repos.ts`).
- Produces: `findSymbols(db: Db, params: FindSymbolsParams): FindResult[]`. Task 11 (MCP server) calls this directly for the `find_symbols` tool; Task 12 (CLI) calls it for `sonde search`.

```ts
export interface FindSymbolsParams {
  query: string;
  kinds?: SymbolKind[];
  paths?: string[];
  limit?: number;
}

export interface FindResult {
  stableKey: string;
  path: string;
  kind: SymbolKind;
  signature: string | null;
  startLine: number;
  endLine: number;
  reason: "exact_qualified" | "exact_short" | "fts";
}
```

Ranking per spec §7.2: exact qualified-name match, then exact short-name match, then BM25 over `symbol_fts`. **No source bodies** — signatures only (spec §7.2), which the shape above already enforces by omitting a `body` field entirely.

- [ ] **Step 1: Write the failing test**

```ts
// tests/query/find.test.ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { migrate, openDb, Store, type Db } from "../../src/store/index.js";
import { findSymbols } from "../../src/query/find.js";

let db: Db;

beforeEach(() => {
  db = openDb(":memory:");
  migrate(db);
  const store = new Store(db);
  store.upsertFile({ path: "src/auth.ts", contentHash: "h", mtimeMs: 1, size: 1 });
  store.upsertFile({ path: "src/session.ts", contentHash: "h", mtimeMs: 1, size: 1 });
  store.insertSymbols([
    {
      stableKey: "ts:src/auth.ts#refreshSession", filePath: "src/auth.ts",
      qualifiedName: "refreshSession", shortName: "refreshSession", kind: "function",
      signature: "function refreshSession(): void", startByte: 0, endByte: 1,
      startLine: 10, endLine: 12, bodyHash: null, exported: true, isTest: false,
    },
    {
      stableKey: "ts:src/session.ts#Session.expire", filePath: "src/session.ts",
      qualifiedName: "Session.expire", shortName: "expire", kind: "method",
      signature: "expire(): void", startByte: 0, endByte: 1,
      startLine: 5, endLine: 6, bodyHash: null, exported: false, isTest: false,
    },
  ]);
});

afterEach(() => db.close());

describe("findSymbols", () => {
  it("ranks an exact qualified-name match first", () => {
    const results = findSymbols(db, { query: "Session.expire" });
    expect(results[0]).toMatchObject({
      stableKey: "ts:src/session.ts#Session.expire",
      reason: "exact_qualified",
    });
  });

  it("falls back to full-text search over signature and names", () => {
    const results = findSymbols(db, { query: "refresh session" });
    expect(results.map((r) => r.stableKey)).toContain("ts:src/auth.ts#refreshSession");
    expect(results[0]?.reason).toBe("fts");
  });

  it("filters by kind", () => {
    const results = findSymbols(db, { query: "session", kinds: ["method"] });
    expect(results.every((r) => r.kind === "method")).toBe(true);
  });

  it("respects the limit", () => {
    const results = findSymbols(db, { query: "session", limit: 1 });
    expect(results.length).toBeLessThanOrEqual(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/query/find.test.ts`
Expected: FAIL — cannot resolve `src/query/find.js`.

- [ ] **Step 3: Implement**

```ts
// src/query/find.ts
import type { Db } from "../store/db.js";
import type { SymbolKind } from "../store/repos.js";

export interface FindSymbolsParams {
  query: string;
  kinds?: SymbolKind[];
  paths?: string[];
  limit?: number;
}

export interface FindResult {
  stableKey: string;
  path: string;
  kind: SymbolKind;
  signature: string | null;
  startLine: number;
  endLine: number;
  reason: "exact_qualified" | "exact_short" | "fts";
}

interface Row {
  stableKey: string;
  path: string;
  kind: SymbolKind;
  signature: string | null;
  startLine: number;
  endLine: number;
}

const BASE_SELECT = `
  SELECT s.stable_key AS stableKey, f.path AS path, s.kind, s.signature,
         s.start_line AS startLine, s.end_line AS endLine
  FROM symbol s JOIN file f ON f.id = s.file_id`;

function filterClause(kinds?: SymbolKind[], paths?: string[]): { sql: string; args: unknown[] } {
  const clauses: string[] = [];
  const args: unknown[] = [];
  if (kinds && kinds.length > 0) {
    clauses.push(`s.kind IN (${kinds.map(() => "?").join(",")})`);
    args.push(...kinds);
  }
  if (paths && paths.length > 0) {
    clauses.push(`(${paths.map(() => "f.path LIKE ?").join(" OR ")})`);
    args.push(...paths.map((p) => `${p}%`));
  }
  return { sql: clauses.length ? `AND ${clauses.join(" AND ")}` : "", args };
}

export function findSymbols(db: Db, params: FindSymbolsParams): FindResult[] {
  const limit = params.limit ?? 20;
  const { sql: filterSql, args: filterArgs } = filterClause(params.kinds, params.paths);
  const seen = new Set<string>();
  const out: FindResult[] = [];

  const add = (rows: Row[], reason: FindResult["reason"]): void => {
    for (const row of rows) {
      if (seen.has(row.stableKey) || out.length >= limit) continue;
      seen.add(row.stableKey);
      out.push({ ...row, reason });
    }
  };

  add(
    db.prepare(`${BASE_SELECT} WHERE s.qualified_name = ? ${filterSql}`)
      .all(params.query, ...filterArgs) as Row[],
    "exact_qualified",
  );
  if (out.length < limit) {
    add(
      db.prepare(`${BASE_SELECT} WHERE s.short_name = ? ${filterSql}`)
        .all(params.query, ...filterArgs) as Row[],
      "exact_short",
    );
  }
  if (out.length < limit) {
    add(
      db.prepare(`
        SELECT s.stable_key AS stableKey, f.path AS path, s.kind, s.signature,
               s.start_line AS startLine, s.end_line AS endLine
        FROM symbol_fts ft
          JOIN symbol s ON s.id = ft.rowid
          JOIN file f ON f.id = s.file_id
        WHERE symbol_fts MATCH ? ${filterSql}
        ORDER BY bm25(symbol_fts)
      `).all(params.query, ...filterArgs) as Row[],
      "fts",
    );
  }

  return out.slice(0, limit);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/query/find.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the full suite, typecheck, and build**

Run: `npm test && npm run typecheck && npm run build`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add src/query/find.ts tests/query/find.test.ts
git commit -m "feat: add find_symbols query engine"
```

---

### Task 6: `query/rank.ts` — the §7.4 ranking formula

**Files:**
- Create: `src/query/rank.ts`
- Test: `tests/query/rank.test.ts`

**Interfaces:**
- Consumes: `Db`.
- Produces: `fanInP95(db: Db): number` and `score(input: RankInput, fanInP95: number): number`. Task 7 (`query/traverse.ts`) and Task 8 (`query/impact.ts`) both call these to order results within a tier.

```ts
export interface RankInput {
  distance: number;
  fanIn: number;
  exported: boolean;
  pathFocusMatch: boolean;
}
```

The formula is copied verbatim from spec §7.4:

```
score = 0.40 · 1/(1 + distance)
      + 0.25 · min(1, log(1 + fan_in) / log(1 + FAN_IN_P95))
      + 0.20 · exported
      + 0.15 · path_focus_match
```

`FAN_IN_P95` is computed per repository at index time per the spec's wording, but nothing in this plan adds a background index-time job — it is cheap enough (`O(symbols)`, one query) to compute per call instead, which is simpler and always current. `fanIn` counts inbound `CALLS`/`REFERENCES`/`IMPLEMENTS`/`INHERITS` edges only — `CONTAINS` and `IMPORTS` are structural, not usage, and would flatten every file symbol's fan-in to "number of things it contains," which is not what the formula means by fan-in.

- [ ] **Step 1: Write the failing test**

```ts
// tests/query/rank.test.ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { migrate, openDb, Store, type Db } from "../../src/store/index.js";
import { fanInP95, score } from "../../src/query/rank.js";

describe("score", () => {
  it("weights a closer, more exported, path-focused result higher", () => {
    const near = score({ distance: 0, fanIn: 10, exported: true, pathFocusMatch: true }, 20);
    const far = score({ distance: 5, fanIn: 10, exported: false, pathFocusMatch: false }, 20);
    expect(near).toBeGreaterThan(far);
  });

  it("never exceeds 1 and never goes negative", () => {
    const s = score({ distance: 0, fanIn: 1000, exported: true, pathFocusMatch: true }, 20);
    expect(s).toBeLessThanOrEqual(1);
    expect(s).toBeGreaterThanOrEqual(0);
  });

  it("does not divide by zero when FAN_IN_P95 is zero", () => {
    const s = score({ distance: 1, fanIn: 3, exported: false, pathFocusMatch: false }, 0);
    expect(Number.isFinite(s)).toBe(true);
  });
});

describe("fanInP95", () => {
  let db: Db;

  beforeEach(() => {
    db = openDb(":memory:");
    migrate(db);
  });

  afterEach(() => db.close());

  it("returns 0 for a repository with no edges", () => {
    expect(fanInP95(db)).toBe(0);
  });

  it("computes the 95th percentile of inbound usage-edge counts", () => {
    const store = new Store(db);
    store.upsertFile({ path: "src/a.ts", contentHash: "h", mtimeMs: 1, size: 1 });
    store.insertSymbols([
      { stableKey: "ts:src/a.ts#a", filePath: "src/a.ts", qualifiedName: "a", shortName: "a", kind: "function", signature: null, startByte: 0, endByte: 1, startLine: 1, endLine: 1, bodyHash: null, exported: true, isTest: false },
      { stableKey: "ts:src/a.ts#b", filePath: "src/a.ts", qualifiedName: "b", shortName: "b", kind: "function", signature: null, startByte: 0, endByte: 1, startLine: 1, endLine: 1, bodyHash: null, exported: true, isTest: false },
    ]);
    store.insertEdges([
      { srcKey: "ts:src/a.ts#b", dstKey: "ts:src/a.ts#a", kind: "CALLS", tier: "LEXICAL", confidence: 1, siteLine: 1 },
    ]);
    expect(fanInP95(db)).toBeGreaterThanOrEqual(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/query/rank.test.ts`
Expected: FAIL — cannot resolve `src/query/rank.js`.

- [ ] **Step 3: Implement**

```ts
// src/query/rank.ts
import type { Db } from "../store/db.js";

export interface RankInput {
  distance: number;
  fanIn: number;
  exported: boolean;
  pathFocusMatch: boolean;
}

const USAGE_KINDS = ["CALLS", "REFERENCES", "IMPLEMENTS", "INHERITS"];

/** Per-repository p95 of inbound usage-edge fan-in, computed live (cheap: one query). */
export function fanInP95(db: Db): number {
  const rows = db
    .prepare(
      `SELECT COUNT(*) AS n FROM edge
       WHERE kind IN (${USAGE_KINDS.map(() => "?").join(",")})
       GROUP BY dst_symbol_id
       ORDER BY n ASC`,
    )
    .all(...USAGE_KINDS) as Array<{ n: number }>;
  if (rows.length === 0) return 0;
  const index = Math.min(rows.length - 1, Math.ceil(0.95 * rows.length) - 1);
  return rows[Math.max(0, index)]!.n;
}

export function score(input: RankInput, p95: number): number {
  const fanInTerm =
    p95 > 0 ? Math.min(1, Math.log(1 + input.fanIn) / Math.log(1 + p95)) : 0;
  return (
    0.4 * (1 / (1 + input.distance)) +
    0.25 * fanInTerm +
    0.2 * (input.exported ? 1 : 0) +
    0.15 * (input.pathFocusMatch ? 1 : 0)
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/query/rank.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the full suite, typecheck, and build**

Run: `npm test && npm run typecheck && npm run build`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add src/query/rank.ts tests/query/rank.test.ts
git commit -m "feat: add the spec §7.4 ranking formula"
```

---

### Task 7: `query/traverse.ts` — `query_graph`

**Files:**
- Create: `src/query/traverse.ts`
- Test: `tests/query/traverse.test.ts`

**Interfaces:**
- Consumes: `Db`.
- Produces: `queryGraph(db: Db, params: TraverseParams): TraverseResult`. Task 11 (MCP server) calls this for the `query_graph` tool; Task 12 (CLI) for `sonde query`.

```ts
export type TraversePattern =
  | "callers_of" | "callees_of" | "references_to"
  | "imports_of" | "imported_by"
  | "implementations_of" | "inheritors_of" | "inherits_from"
  | "tests_for"
  | "contained_by" | "contains";

export interface TraverseParams {
  pattern: TraversePattern;
  symbol: string; // stable_key, or an exact qualified_name/short_name if unambiguous
  limit?: number;
}

export interface EdgeResultRow {
  stableKey: string;
  path: string;
  qualifiedName: string;
  kind: string;
  siteLine: number | null;
}

export interface TraverseResult {
  compiler: EdgeResultRow[];
  lexical: EdgeResultRow[];
  heuristic: EdgeResultRow[];
  external: { count: number };
  unresolved: { count: number; names: string[] };
  truncated: boolean;
}
```

This is the exact shape from spec §7.2: not a flat list, tier-bucketed, with `external`/`unresolved` as first-class completeness signals rather than absorbed into a generic "miscellaneous" bucket.

Pattern semantics, all derived from the edge table Task 1/Plan 1 already populate:

| Pattern | Edge kind | Direction from `symbol` |
|---|---|---|
| `callers_of` | `CALLS` | reverse (who has an edge *to* `symbol`) |
| `callees_of` | `CALLS` | forward |
| `references_to` | `CALLS`, `REFERENCES` (§6.1: `CALLS ⊂ REFERENCES`, union at query time, never double-counted) | reverse |
| `imports_of` | `IMPORTS` | forward |
| `imported_by` | `IMPORTS` | reverse |
| `implementations_of` | `IMPLEMENTS` | reverse |
| `inheritors_of` | `INHERITS` | reverse (downward: who extends X) |
| `inherits_from` | `INHERITS` | forward (upward: what X extends) |
| `tests_for` | `TESTS` | reverse — always empty in this plan (see "Out of scope"); the query is written and tested against an empty result, not stubbed out |
| `contained_by` | `CONTAINS` | reverse |
| `contains` | `CONTAINS` | forward |

For a **forward** pattern (`symbol` is the edge source — e.g. `callees_of`, `imports_of`), `external`/`unresolved` report *that symbol's own* `external_ref`/`unresolved_ref` rows (`src_symbol_id = symbol`) — direct, stored evidence.

For a **reverse** pattern (`symbol` is the edge destination — e.g. `callers_of`, `imported_by`), there is no such thing as "an external caller" (unindexed code cannot be a graph node), so `external.count` is always `0`. `unresolved` is more useful here than a flat zero: `unresolved_ref.name` already stores the identifier a reference *tried and failed* to resolve, so any `unresolved_ref` row whose `name` equals the target symbol's `short_name` is a genuine "might be a caller we couldn't verify" completeness caveat — exactly what spec §7.3 calls for. This is the reason `unresolved_ref.name` was added back in Plan 1's Task 12; this is its first consumer.

- [ ] **Step 1: Write the failing test**

```ts
// tests/query/traverse.test.ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { migrate, openDb, Store, type Db } from "../../src/store/index.js";
import { queryGraph } from "../../src/query/traverse.js";

let db: Db;

function seedSymbol(store: Store, key: string, file: string, name: string) {
  store.insertSymbols([{
    stableKey: key, filePath: file, qualifiedName: name, shortName: name,
    kind: "function", signature: null, startByte: 0, endByte: 1,
    startLine: 1, endLine: 1, bodyHash: null, exported: true, isTest: false,
  }]);
}

beforeEach(() => {
  db = openDb(":memory:");
  migrate(db);
  const store = new Store(db);
  store.upsertFile({ path: "src/a.ts", contentHash: "h", mtimeMs: 1, size: 1 });
  store.upsertFile({ path: "src/b.ts", contentHash: "h", mtimeMs: 1, size: 1 });
  seedSymbol(store, "ts:src/a.ts#caller", "src/a.ts", "caller");
  seedSymbol(store, "ts:src/b.ts#callee", "src/b.ts", "callee");
  store.insertEdges([
    { srcKey: "ts:src/a.ts#caller", dstKey: "ts:src/b.ts#callee", kind: "CALLS", tier: "LEXICAL", confidence: 1, siteLine: 3 },
  ]);
  store.insertUnresolved([
    { srcKey: "ts:src/a.ts#caller", name: "maybeCallee", kind: "CALLS", siteLine: 4, candidateCount: 0, reason: "no_candidate" },
  ]);
});

afterEach(() => db.close());

describe("queryGraph", () => {
  it("finds callers_of by reverse CALLS traversal", () => {
    const result = queryGraph(db, { pattern: "callers_of", symbol: "ts:src/b.ts#callee" });
    expect(result.lexical).toContainEqual(expect.objectContaining({ stableKey: "ts:src/a.ts#caller" }));
    expect(result.external.count).toBe(0);
  });

  it("finds callees_of by forward CALLS traversal", () => {
    const result = queryGraph(db, { pattern: "callees_of", symbol: "ts:src/a.ts#caller" });
    expect(result.lexical).toContainEqual(expect.objectContaining({ stableKey: "ts:src/b.ts#callee" }));
  });

  it("surfaces unresolved same-name references as a completeness caveat on a reverse query", () => {
    const result = queryGraph(db, { pattern: "callers_of", symbol: "ts:src/a.ts#caller" });
    // "caller" has no inbound CALLS edges and no unresolved_ref named "caller" —
    // its own unresolved outgoing reference ("maybeCallee") must not leak in here.
    expect(result.unresolved.names).not.toContain("maybeCallee");
  });

  it("returns empty buckets for tests_for (no TESTS edges are produced yet)", () => {
    const result = queryGraph(db, { pattern: "tests_for", symbol: "ts:src/b.ts#callee" });
    expect(result.compiler).toEqual([]);
    expect(result.lexical).toEqual([]);
    expect(result.heuristic).toEqual([]);
  });

  it("resolves the symbol parameter by exact qualified name as well as stable key", () => {
    const result = queryGraph(db, { pattern: "callees_of", symbol: "caller" });
    expect(result.lexical).toContainEqual(expect.objectContaining({ stableKey: "ts:src/b.ts#callee" }));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/query/traverse.test.ts`
Expected: FAIL — cannot resolve `src/query/traverse.js`.

- [ ] **Step 3: Implement**

```ts
// src/query/traverse.ts
import type { Db } from "../store/db.js";
import type { EdgeKind } from "../store/repos.js";

export type TraversePattern =
  | "callers_of" | "callees_of" | "references_to"
  | "imports_of" | "imported_by"
  | "implementations_of" | "inheritors_of" | "inherits_from"
  | "tests_for"
  | "contained_by" | "contains";

export interface TraverseParams {
  pattern: TraversePattern;
  symbol: string;
  limit?: number;
}

export interface EdgeResultRow {
  stableKey: string;
  path: string;
  qualifiedName: string;
  kind: string;
  siteLine: number | null;
}

export interface TraverseResult {
  compiler: EdgeResultRow[];
  lexical: EdgeResultRow[];
  heuristic: EdgeResultRow[];
  external: { count: number };
  unresolved: { count: number; names: string[] };
  truncated: boolean;
}

interface PatternSpec {
  kinds: EdgeKind[];
  direction: "forward" | "reverse";
}

const PATTERNS: Record<TraversePattern, PatternSpec> = {
  callers_of: { kinds: ["CALLS"], direction: "reverse" },
  callees_of: { kinds: ["CALLS"], direction: "forward" },
  references_to: { kinds: ["CALLS", "REFERENCES"], direction: "reverse" },
  imports_of: { kinds: ["IMPORTS"], direction: "forward" },
  imported_by: { kinds: ["IMPORTS"], direction: "reverse" },
  implementations_of: { kinds: ["IMPLEMENTS"], direction: "reverse" },
  inheritors_of: { kinds: ["INHERITS"], direction: "reverse" },
  inherits_from: { kinds: ["INHERITS"], direction: "forward" },
  tests_for: { kinds: ["TESTS"], direction: "reverse" },
  contained_by: { kinds: ["CONTAINS"], direction: "reverse" },
  contains: { kinds: ["CONTAINS"], direction: "forward" },
};

function resolveSymbolId(db: Db, ref: string): number | null {
  const row = db
    .prepare(
      `SELECT id FROM symbol
       WHERE stable_key = ? OR qualified_name = ? OR short_name = ?
       LIMIT 1`,
    )
    .get(ref, ref, ref) as { id: number } | undefined;
  return row?.id ?? null;
}

export function queryGraph(db: Db, params: TraverseParams): TraverseResult {
  const empty: TraverseResult = {
    compiler: [], lexical: [], heuristic: [],
    external: { count: 0 }, unresolved: { count: 0, names: [] },
    truncated: false,
  };

  const symbolId = resolveSymbolId(db, params.symbol);
  if (symbolId === null) return empty;

  const spec = PATTERNS[params.pattern];
  const limit = params.limit ?? 50;
  const forward = spec.direction === "forward";
  const selfColumn = forward ? "src_symbol_id" : "dst_symbol_id";
  const otherColumn = forward ? "dst_symbol_id" : "src_symbol_id";

  const rows = db
    .prepare(`
      SELECT other.stable_key AS stableKey, f.path AS path,
             other.qualified_name AS qualifiedName, e.kind, e.tier,
             e.site_line AS siteLine
      FROM edge e
        JOIN symbol other ON other.id = e.${otherColumn}
        JOIN file f ON f.id = other.file_id
      WHERE e.${selfColumn} = ? AND e.kind IN (${spec.kinds.map(() => "?").join(",")})
      ORDER BY e.tier
      LIMIT ?
    `)
    .all(symbolId, ...spec.kinds, limit + 1) as Array<
      EdgeResultRow & { tier: "COMPILER" | "LEXICAL" | "HEURISTIC" }
    >;

  const truncated = rows.length > limit;
  const bounded = rows.slice(0, limit);
  const result = { ...empty, truncated };
  for (const row of bounded) {
    const bucket =
      row.tier === "COMPILER" ? result.compiler
      : row.tier === "LEXICAL" ? result.lexical
      : result.heuristic;
    bucket.push({
      stableKey: row.stableKey, path: row.path,
      qualifiedName: row.qualifiedName, kind: row.kind, siteLine: row.siteLine,
    });
  }

  if (forward) {
    const externalCount = db
      .prepare("SELECT COUNT(*) AS n FROM external_ref WHERE src_symbol_id = ?")
      .get(symbolId) as { n: number };
    const unresolvedRows = db
      .prepare("SELECT name FROM unresolved_ref WHERE src_symbol_id = ?")
      .all(symbolId) as Array<{ name: string }>;
    result.external = { count: externalCount.n };
    result.unresolved = {
      count: unresolvedRows.length,
      names: [...new Set(unresolvedRows.map((r) => r.name))],
    };
  } else {
    const shortName = (
      db.prepare("SELECT short_name AS shortName FROM symbol WHERE id = ?").get(symbolId) as
        { shortName: string }
    ).shortName;
    const unresolvedRows = db
      .prepare("SELECT DISTINCT name FROM unresolved_ref WHERE name = ?")
      .all(shortName) as Array<{ name: string }>;
    result.unresolved = {
      count: unresolvedRows.length,
      names: unresolvedRows.map((r) => r.name),
    };
  }

  return result;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/query/traverse.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the full suite, typecheck, and build**

Run: `npm test && npm run typecheck && npm run build`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add src/query/traverse.ts tests/query/traverse.test.ts
git commit -m "feat: add query_graph traversal engine"
```

---

### Task 8: `query/impact.ts` — `get_impact_radius`

**Files:**
- Create: `src/query/impact.ts`
- Test: `tests/query/impact.test.ts`

**Interfaces:**
- Consumes: `Db`, `RepoBoundary`, `changedFiles` (Task 3).
- Produces: `getImpactRadius(db: Db, boundary: RepoBoundary, params: ImpactParams): ImpactResult`. Task 10 (`pack/impactpack.ts`) wraps this with source-body fetching, token budgeting, and envelope assembly for the actual MCP tool response.

```ts
export interface ImpactParams {
  symbols?: string[];       // stable_key, qualified_name, or short_name
  fromGitDiff?: boolean;    // resolves seeds from the working-tree diff instead
}

export interface ImpactRow {
  stableKey: string;
  path: string;
  qualifiedName: string;
  kind: string;
  depth: number;
  viaKind: string;
}

export interface ImpactResult {
  seeds: string[];          // resolved seed stable_keys
  affected: ImpactRow[];
  tests: ImpactRow[];       // always empty in this plan — see Task 7's note on TESTS edges
  warnings: string[];
  truncated: boolean;
}

export const MAX_DEPTH = 6;
export const MAX_NODES = 500;
export const MAX_WALL_CLOCK_MS = 2000;
```

The headline workflow: reverse-traverse `CALLS`, `REFERENCES`, `IMPLEMENTS`, **and `INHERITS`** (§7.3 — `INHERITS` specifically, since a revision-1 omission of it meant a base-class change never surfaced its subclasses) from every seed symbol, breadth-first, with a cycle-safe visited set and three independent bounds per SEC-012: depth, total node count, and wall clock. Any bound tripping sets `truncated: true` and adds a warning naming which bound tripped — never a silent cutoff.

`from_git_diff: true` resolves seeds by taking `changedFiles(boundary)` and, for each changed file, every symbol in it (`symbolsInFile`, already on `Store` from Plan 1's Task 4) — a coarse "everything in a touched file is a candidate seed," not a line-range diff; line-precise diff mapping is more precision than the headline workflow needs and is not attempted here.

- [ ] **Step 1: Write the failing test**

```ts
// tests/query/impact.test.ts
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { migrate, openDb, Store, type Db } from "../../src/store/index.js";
import { RepoBoundary } from "../../src/repo/boundary.js";
import { getImpactRadius } from "../../src/query/impact.js";

let db: Db;
let root: string;
let boundary: RepoBoundary;

function seedSymbol(store: Store, key: string, file: string, name: string) {
  store.insertSymbols([{
    stableKey: key, filePath: file, qualifiedName: name, shortName: name,
    kind: "function", signature: null, startByte: 0, endByte: 1,
    startLine: 1, endLine: 1, bodyHash: null, exported: true, isTest: false,
  }]);
}

beforeEach(() => {
  db = openDb(":memory:");
  migrate(db);
  const store = new Store(db);
  store.upsertFile({ path: "src/base.ts", contentHash: "h", mtimeMs: 1, size: 1 });
  store.upsertFile({ path: "src/mid.ts", contentHash: "h", mtimeMs: 1, size: 1 });
  store.upsertFile({ path: "src/top.ts", contentHash: "h", mtimeMs: 1, size: 1 });
  seedSymbol(store, "ts:src/base.ts#Base", "src/base.ts", "Base");
  seedSymbol(store, "ts:src/mid.ts#Mid", "src/mid.ts", "Mid");
  seedSymbol(store, "ts:src/top.ts#useMid", "src/top.ts", "useMid");
  store.insertEdges([
    { srcKey: "ts:src/mid.ts#Mid", dstKey: "ts:src/base.ts#Base", kind: "INHERITS", tier: "LEXICAL", confidence: 1, siteLine: 1 },
    { srcKey: "ts:src/top.ts#useMid", dstKey: "ts:src/mid.ts#Mid", kind: "CALLS", tier: "LEXICAL", confidence: 1, siteLine: 1 },
  ]);

  root = mkdtempSync(join(tmpdir(), "cg-impact-"));
  mkdirSync(join(root, "src"));
  execFileSync("git", ["init", "-q"], { cwd: root });
  execFileSync("git", ["config", "user.email", "t@example.com"], { cwd: root });
  execFileSync("git", ["config", "user.name", "t"], { cwd: root });
  writeFileSync(join(root, "src", "base.ts"), "export class Base {}\n");
  execFileSync("git", ["add", "."], { cwd: root });
  execFileSync("git", ["commit", "-q", "-m", "init"], { cwd: root });
  boundary = new RepoBoundary(root);
});

afterEach(() => {
  db.close();
  rmSync(root, { recursive: true, force: true });
});

describe("getImpactRadius", () => {
  it("reverse-traverses INHERITS then CALLS transitively from a base class", () => {
    const result = getImpactRadius(db, boundary, { symbols: ["ts:src/base.ts#Base"] });
    const keys = result.affected.map((r) => r.stableKey);
    expect(keys).toContain("ts:src/mid.ts#Mid");
    expect(keys).toContain("ts:src/top.ts#useMid");
    expect(result.affected.find((r) => r.stableKey === "ts:src/top.ts#useMid")?.depth).toBe(2);
  });

  it("resolves seeds from an uncommitted working-tree change", () => {
    writeFileSync(join(root, "src", "base.ts"), "export class Base { changed = true; }\n");
    const result = getImpactRadius(db, boundary, { fromGitDiff: true });
    expect(result.seeds).toContain("ts:src/base.ts#Base");
  });

  it("never revisits a node in a cycle", () => {
    const store = new Store(db);
    store.insertEdges([
      { srcKey: "ts:src/base.ts#Base", dstKey: "ts:src/top.ts#useMid", kind: "CALLS", tier: "LEXICAL", confidence: 1, siteLine: 1 },
    ]);
    const result = getImpactRadius(db, boundary, { symbols: ["ts:src/base.ts#Base"] });
    const occurrences = result.affected.filter((r) => r.stableKey === "ts:src/mid.ts#Mid");
    expect(occurrences.length).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/query/impact.test.ts`
Expected: FAIL — cannot resolve `src/query/impact.js`.

- [ ] **Step 3: Implement**

```ts
// src/query/impact.ts
import type { Db } from "../store/db.js";
import { Store } from "../store/repos.js";
import { changedFiles } from "../repo/git.js";
import type { RepoBoundary } from "../repo/boundary.js";

export interface ImpactParams {
  symbols?: string[];
  fromGitDiff?: boolean;
}

export interface ImpactRow {
  stableKey: string;
  path: string;
  qualifiedName: string;
  kind: string;
  depth: number;
  viaKind: string;
}

export interface ImpactResult {
  seeds: string[];
  affected: ImpactRow[];
  tests: ImpactRow[];
  warnings: string[];
  truncated: boolean;
}

export const MAX_DEPTH = 6;
export const MAX_NODES = 500;
export const MAX_WALL_CLOCK_MS = 2000;

const IMPACT_KINDS = ["CALLS", "REFERENCES", "IMPLEMENTS", "INHERITS"];

function resolveSeeds(db: Db, boundary: RepoBoundary, params: ImpactParams): string[] {
  if (params.symbols && params.symbols.length > 0) {
    const placeholders = params.symbols.map(() => "?").join(",");
    const rows = db
      .prepare(
        `SELECT stable_key AS stableKey FROM symbol
         WHERE stable_key IN (${placeholders})
            OR qualified_name IN (${placeholders})
            OR short_name IN (${placeholders})`,
      )
      .all(...params.symbols, ...params.symbols, ...params.symbols) as Array<{ stableKey: string }>;
    return [...new Set(rows.map((r) => r.stableKey))];
  }
  if (params.fromGitDiff) {
    const store = new Store(db);
    const seeds: string[] = [];
    for (const path of changedFiles(boundary)) {
      for (const symbol of store.symbolsInFile(path)) seeds.push(symbol.stableKey);
    }
    return seeds;
  }
  return [];
}

export function getImpactRadius(
  db: Db,
  boundary: RepoBoundary,
  params: ImpactParams,
): ImpactResult {
  const seeds = resolveSeeds(db, boundary, params);
  const result: ImpactResult = { seeds, affected: [], tests: [], warnings: [], truncated: false };
  if (seeds.length === 0) return result;

  const seedIds = db
    .prepare(
      `SELECT id, stable_key AS stableKey FROM symbol WHERE stable_key IN (${seeds.map(() => "?").join(",")})`,
    )
    .all(...seeds) as Array<{ id: number; stableKey: string }>;

  const edgeStmt = db.prepare(`
    SELECT s.id AS id, s.stable_key AS stableKey, f.path AS path,
           s.qualified_name AS qualifiedName, s.kind AS kind, e.kind AS viaKind
    FROM edge e
      JOIN symbol s ON s.id = e.src_symbol_id
      JOIN file f ON f.id = s.file_id
    WHERE e.dst_symbol_id = ? AND e.kind IN (${IMPACT_KINDS.map(() => "?").join(",")})
  `);

  const visited = new Set<number>(seedIds.map((s) => s.id));
  let frontier = seedIds.map((s) => ({ id: s.id, depth: 0 }));
  const start = Date.now();

  for (let depth = 1; depth <= MAX_DEPTH && frontier.length > 0; depth += 1) {
    if (Date.now() - start > MAX_WALL_CLOCK_MS) {
      result.truncated = true;
      result.warnings.push(`stopped after ${MAX_WALL_CLOCK_MS}ms wall-clock budget`);
      break;
    }
    if (result.affected.length >= MAX_NODES) {
      result.truncated = true;
      result.warnings.push(`stopped after ${MAX_NODES} affected nodes`);
      break;
    }

    const next: Array<{ id: number; depth: number }> = [];
    for (const node of frontier) {
      const rows = edgeStmt.all(node.id, ...IMPACT_KINDS) as Array<
        { id: number; stableKey: string; path: string; qualifiedName: string; kind: string; viaKind: string }
      >;
      for (const row of rows) {
        if (visited.has(row.id)) continue;
        visited.add(row.id);
        result.affected.push({
          stableKey: row.stableKey, path: row.path, qualifiedName: row.qualifiedName,
          kind: row.kind, depth, viaKind: row.viaKind,
        });
        next.push({ id: row.id, depth });
        if (result.affected.length >= MAX_NODES) break;
      }
      if (result.affected.length >= MAX_NODES) break;
    }
    frontier = next;
  }

  if (frontier.length > 0 && !result.truncated) {
    result.truncated = true;
    result.warnings.push(`stopped after ${MAX_DEPTH} levels of traversal depth`);
  }

  return result;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/query/impact.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the full suite, typecheck, and build**

Run: `npm test && npm run typecheck && npm run build`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add src/query/impact.ts tests/query/impact.test.ts
git commit -m "feat: add get_impact_radius bounded reverse traversal"
```

---

### Task 9: `pack/verify.ts` and `pack/refresh.ts` — the two freshness guarantees

**Files:**
- Create: `src/pack/verify.ts`, `src/pack/refresh.ts`
- Test: `tests/pack/verify.test.ts`, `tests/pack/refresh.test.ts`

**Interfaces:**
- Consumes: `RepoBoundary`, `Store`, `checkDrift`/`AUTO_REFRESH_LIMIT` (Plan 1 Task 14), `updateRepo` (Plan 1 Task 13), `indexPathFor` (Task 4), `openDb`/`migrate`/`SchemaVersionError` (Plan 1 Task 4).
- Produces: `verifySymbolBody(boundary, symbol): { bytes: Buffer; verified: boolean }` (Guarantee A, §8.1) and `ensureFresh(root: string, dbPath: string): Promise<ReadState>` (Guarantee B, §8.2-8.4). Task 10 (`pack/impactpack.ts`) and Task 11 (MCP server) both call `ensureFresh` as the entry point for every read; `verifySymbolBody` is called only when a tool is about to return a source excerpt (today, only `get_impact_radius`'s packed seed bodies).

Two separate, independently-testable guarantees, matching §8.1's explicit split (conflating them was revision 1's mistake):

**Guarantee A — returned bytes match disk.** Re-read the file at the symbol's stored byte range and re-hash it; if it does not match `body_hash`, the caller gets `verified: false` and must not present that body as current (it degrades to metadata-only, per §8.5's `stale` state).

**Guarantee B — structural drift is always reported.** `ensureFresh` wraps `checkDrift` (already built): 0 drift → `fresh`; drift within `AUTO_REFRESH_LIMIT` → run `updateRepo` inline and report `refreshed`, with a warning that the inline path does not run the (unbuilt, in this plan) `COMPILER` upgrade, so refreshed edges stay `LEXICAL`/`HEURISTIC`; drift over the limit, or persisted parse failures → answer from the existing index and report `partial` with the drift count and the reindex command, exactly as `sonde status` already does.

```ts
export class NoIndexError extends Error {}

export interface ReadState {
  db: Db;
  freshness: {
    state: "fresh" | "refreshed" | "partial";
    driftCount: number;
    verified: string[];
  };
  warnings: string[];
}
```

`ensureFresh` throws `NoIndexError` when no index exists yet, or `SchemaVersionError` when the on-disk schema doesn't match — the caller (Task 11's MCP server) catches both and returns a `state: "unknown"` envelope rather than crashing the tool call, matching §8.5's `unknown` state exactly.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/pack/verify.test.ts
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { RepoBoundary } from "../../src/repo/boundary.js";
import { verifySymbolBody } from "../../src/pack/verify.js";

let root: string;
let boundary: RepoBoundary;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "cg-verify-"));
  mkdirSync(join(root, "src"));
  writeFileSync(join(root, "src", "a.ts"), "export function run() { return 1; }\n");
  boundary = new RepoBoundary(root);
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

describe("verifySymbolBody", () => {
  it("verifies bytes that still match the indexed range", () => {
    const bytes = boundary.readFile("src/a.ts");
    const slice = bytes.subarray(0, bytes.indexOf(59) + 1); // through the first ';'
    const result = verifySymbolBody(boundary, {
      path: "src/a.ts", startByte: 0, endByte: bytes.length,
    });
    expect(result.verified).toBe(true);
    expect(result.bytes.equals(bytes)).toBe(true);
  });

  it("reports unverified when the file changed since indexing", () => {
    const before = boundary.readFile("src/a.ts");
    writeFileSync(join(root, "src", "a.ts"), "export function run() { return 2; }\n");
    const result = verifySymbolBody(boundary, {
      path: "src/a.ts", startByte: 0, endByte: before.length,
    });
    expect(result.verified).toBe(false);
  });
});
```

```ts
// tests/pack/refresh.test.ts
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { indexRepo } from "../../src/index/pipeline.js";
import { ensureFresh, NoIndexError } from "../../src/pack/refresh.js";

let root: string;
let dbPath: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "cg-refresh-"));
  mkdirSync(join(root, "src"));
  writeFileSync(join(root, "tsconfig.json"), "{}");
  writeFileSync(join(root, "src", "a.ts"), "export function a() {}\n");
  dbPath = join(root, "index.sqlite");
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

describe("ensureFresh", () => {
  it("throws NoIndexError when no index exists", async () => {
    await expect(ensureFresh(root, dbPath)).rejects.toThrow(NoIndexError);
  });

  it("reports fresh with no drift after indexing", async () => {
    await indexRepo(root, dbPath);
    const state = await ensureFresh(root, dbPath);
    expect(state.freshness.state).toBe("fresh");
    state.db.close();
  });

  it("auto-refreshes and reports refreshed within the drift limit", async () => {
    await indexRepo(root, dbPath);
    writeFileSync(join(root, "src", "a.ts"), "export function a() { return 1; }\n");
    const state = await ensureFresh(root, dbPath);
    expect(state.freshness.state).toBe("refreshed");
    expect(state.warnings.some((w) => w.includes("LEXICAL"))).toBe(true);
    state.db.close();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/pack/verify.test.ts tests/pack/refresh.test.ts`
Expected: FAIL — cannot resolve `src/pack/verify.js` / `src/pack/refresh.js`.

- [ ] **Step 3: Implement**

```ts
// src/pack/verify.ts
import { createHash } from "node:crypto";
import type { RepoBoundary } from "../repo/boundary.js";

export interface VerifyTarget {
  path: string;
  startByte: number;
  endByte: number;
}

export interface VerifyResult {
  bytes: Buffer;
  verified: boolean;
  hash: string;
}

/** Read-time re-verification: Guarantee A (spec §8.1) — returned bytes match disk. */
export function verifySymbolBody(
  boundary: RepoBoundary,
  target: VerifyTarget,
  expectedHash?: string | null,
): VerifyResult {
  const full = boundary.readFile(target.path);
  const bytes = full.subarray(target.startByte, target.endByte);
  const hash = createHash("sha256").update(bytes).digest("hex");
  return { bytes, verified: expectedHash ? hash === expectedHash : true, hash };
}
```

```ts
// src/pack/refresh.ts
import { existsSync } from "node:fs";
import { AUTO_REFRESH_LIMIT, checkDrift } from "../index/drift.js";
import { updateRepo } from "../index/pipeline.js";
import { RepoBoundary } from "../repo/boundary.js";
import { migrate, openDb, SchemaVersionError, Store, type Db } from "../store/index.js";

export class NoIndexError extends Error {
  constructor(dbPath: string) {
    super(`no index at ${dbPath}; run "sonde index" first`);
    this.name = "NoIndexError";
  }
}

export interface ReadState {
  db: Db;
  freshness: {
    state: "fresh" | "refreshed" | "partial";
    driftCount: number;
    verified: string[];
  };
  warnings: string[];
}

export async function ensureFresh(root: string, dbPath: string): Promise<ReadState> {
  if (!existsSync(dbPath)) throw new NoIndexError(dbPath);

  const boundary = new RepoBoundary(root);
  let db = openDb(dbPath);
  try {
    migrate(db);
  } catch (error) {
    db.close();
    throw error instanceof SchemaVersionError ? error : error;
  }

  const drift = checkDrift(boundary, new Store(db), AUTO_REFRESH_LIMIT);
  const warnings: string[] = [];

  if (drift.state === "fresh") {
    return { db, freshness: { state: "fresh", driftCount: 0, verified: [] }, warnings };
  }

  if (drift.state === "partial") {
    warnings.push(
      `index is partial: ${drift.driftCount} drifted file(s) over the ` +
        `${AUTO_REFRESH_LIMIT}-file auto-refresh limit, or a prior parse failure ` +
        `is still recorded; run "sonde update" to refresh`,
    );
    return {
      db,
      freshness: { state: "partial", driftCount: drift.driftCount, verified: [] },
      warnings,
    };
  }

  db.close();
  await updateRepo(root, dbPath);
  db = openDb(dbPath);
  migrate(db);
  warnings.push(
    "index was refreshed inline; refreshed edges stay LEXICAL/HEURISTIC " +
      "(the compiler upgrade pass does not run on the inline refresh path — spec §8.4)",
  );
  return {
    db,
    freshness: { state: "refreshed", driftCount: drift.driftCount, verified: drift.driftedPaths },
    warnings,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/pack/verify.test.ts tests/pack/refresh.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the full suite, typecheck, and build**

Run: `npm test && npm run typecheck && npm run build`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add src/pack/verify.ts src/pack/refresh.ts tests/pack/verify.test.ts tests/pack/refresh.test.ts
git commit -m "feat: add read-time source verification and drift-aware refresh"
```

---

### Task 10: `pack/tokens.ts`, `pack/envelope.ts`, `pack/impactpack.ts`

**Files:**
- Create: `src/pack/tokens.ts`, `src/pack/envelope.ts`, `src/pack/impactpack.ts`
- Modify: `package.json` (add `js-tiktoken`)
- Test: `tests/pack/tokens.test.ts`, `tests/pack/envelope.test.ts`, `tests/pack/impactpack.test.ts`

**Interfaces:**
- Consumes: `ImpactResult` (Task 8), `ReadState`/`ensureFresh` (Task 9), `verifySymbolBody` (Task 9), `gitState` (Task 3).
- Produces: `estimateTokens(text)`, `packToBudget(sections, budget)` (generic, `pack/tokens.ts`); `buildEnvelope(...)` (§7.6 shape, `pack/envelope.ts`); `packImpactResponse(db, boundary, root, params, budget)` (`pack/impactpack.ts`) — the single function Task 11's MCP server calls for `get_impact_radius`.

`pack/tokens.ts` is deliberately generic — a list of prioritized, renderable sections and a budget in, an ordered subset and an estimate out. It has no idea what a "symbol body" is. `pack/impactpack.ts` is where that domain knowledge lives: it turns `ImpactResult` rows into budget sections in the allocation order from §7.5 (envelope reserved first and never truncated; then seed bodies; then related signatures; then tests; then supplementary neighbours), fetches seed bodies through `verifySymbolBody` so every returned body is guaranteed to match disk, and marks `partial_body: true` when a seed body itself doesn't fit whole.

```ts
// pack/tokens.ts
export interface BudgetSection {
  id: string;
  priority: number; // lower = packed first, never truncated below priority 0
  text: string;
}
export interface PackedBudget {
  included: string[];
  text: string;
  estimatedTokens: number;
  truncated: boolean;
}
export function estimateTokens(text: string): number;
export function packToBudget(sections: BudgetSection[], budgetTokens: number): PackedBudget;
```

```ts
// pack/envelope.ts
export interface Envelope<T> {
  schemaVersion: number;
  repository: { rootHash: string; revision: string | null; dirty: boolean };
  freshness: { state: string; driftCount: number; verified: string[] };
  summary: string;
  results: T[];
  warnings: string[];
  diagnostics: {
    truncated: boolean;
    omittedCount: number;
    estimatedTokens: number;
    tscVersion: string | null;
  };
}
export function buildEnvelope<T>(input: {
  rootHash: string;
  gitState: { revision: string | null; dirty: boolean };
  freshness: Envelope<T>["freshness"];
  summary: string;
  results: T[];
  warnings: string[];
  truncated: boolean;
  omittedCount: number;
  estimatedTokens: number;
}): Envelope<T>;
```

- [ ] **Step 1: Write the failing tests**

```ts
// tests/pack/tokens.test.ts
import { describe, expect, it } from "vitest";
import { estimateTokens, packToBudget } from "../../src/pack/tokens.js";

describe("estimateTokens", () => {
  it("returns a positive count for non-empty text", () => {
    expect(estimateTokens("function refreshSession() {}")).toBeGreaterThan(0);
  });

  it("returns zero for empty text", () => {
    expect(estimateTokens("")).toBe(0);
  });
});

describe("packToBudget", () => {
  it("includes every section when the budget is generous", () => {
    const result = packToBudget(
      [{ id: "a", priority: 0, text: "short" }, { id: "b", priority: 1, text: "also short" }],
      1000,
    );
    expect(result.included).toEqual(["a", "b"]);
    expect(result.truncated).toBe(false);
  });

  it("drops lower-priority sections first under a tight budget", () => {
    const big = "word ".repeat(500);
    const result = packToBudget(
      [{ id: "reserved", priority: 0, text: "x" }, { id: "big", priority: 1, text: big }],
      5,
    );
    expect(result.included).toEqual(["reserved"]);
    expect(result.truncated).toBe(true);
  });
});
```

```ts
// tests/pack/envelope.test.ts
import { describe, expect, it } from "vitest";
import { buildEnvelope } from "../../src/pack/envelope.js";

describe("buildEnvelope", () => {
  it("assembles the spec §7.6 shape", () => {
    const envelope = buildEnvelope({
      rootHash: "abc123",
      gitState: { revision: "deadbeef", dirty: false },
      freshness: { state: "fresh", driftCount: 0, verified: [] },
      summary: "1 result",
      results: [{ ok: true }],
      warnings: [],
      truncated: false,
      omittedCount: 0,
      estimatedTokens: 42,
    });
    expect(envelope).toMatchObject({
      repository: { rootHash: "abc123", revision: "deadbeef", dirty: false },
      freshness: { state: "fresh" },
      diagnostics: { estimatedTokens: 42, tscVersion: null },
    });
  });
});
```

```ts
// tests/pack/impactpack.test.ts
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { indexRepo } from "../../src/index/pipeline.js";
import { packImpactResponse } from "../../src/pack/impactpack.js";

let root: string;
let dbPath: string;

beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), "cg-impactpack-"));
  mkdirSync(join(root, "src"));
  writeFileSync(join(root, "tsconfig.json"), "{}");
  writeFileSync(
    join(root, "src", "a.ts"),
    "export function base() {}\nexport function top() { base(); }\n",
  );
  dbPath = join(root, "index.sqlite");
  await indexRepo(root, dbPath);
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

describe("packImpactResponse", () => {
  it("returns an envelope whose results include the seed's caller", async () => {
    const envelope = await packImpactResponse(root, dbPath, { symbols: ["base"] }, 4000);
    expect(envelope.freshness.state).toBe("fresh");
    const names = envelope.results.map((r) => r.qualifiedName);
    expect(names).toContain("top");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/pack/tokens.test.ts tests/pack/envelope.test.ts tests/pack/impactpack.test.ts`
Expected: FAIL — none of the three modules exist yet.

- [ ] **Step 3: Add `js-tiktoken`**

```bash
npm install js-tiktoken@^1.0.21
```

- [ ] **Step 4: Implement `pack/tokens.ts`**

```ts
// src/pack/tokens.ts
import { getEncoding } from "js-tiktoken";

const encoding = getEncoding("o200k_base");

/** Always an estimate (spec §7.5): tolerance is documented as ±10% against the client's own tokenizer. */
export function estimateTokens(text: string): number {
  if (text.length === 0) return 0;
  return encoding.encode(text).length;
}

export interface BudgetSection {
  id: string;
  priority: number;
  text: string;
}

export interface PackedBudget {
  included: string[];
  text: string;
  estimatedTokens: number;
  truncated: boolean;
}

/** Greedy, priority-ordered inclusion. Priority 0 is reserved and always included. */
export function packToBudget(sections: BudgetSection[], budgetTokens: number): PackedBudget {
  const ordered = [...sections].sort((a, b) => a.priority - b.priority);
  const included: string[] = [];
  const parts: string[] = [];
  let used = 0;
  let truncated = false;

  for (const section of ordered) {
    const cost = estimateTokens(section.text);
    if (section.priority > 0 && used + cost > budgetTokens) {
      truncated = true;
      continue;
    }
    included.push(section.id);
    parts.push(section.text);
    used += cost;
  }

  return { included, text: parts.join("\n\n"), estimatedTokens: used, truncated };
}
```

- [ ] **Step 5: Implement `pack/envelope.ts`**

```ts
// src/pack/envelope.ts
export interface Envelope<T> {
  schemaVersion: number;
  repository: { rootHash: string; revision: string | null; dirty: boolean };
  freshness: { state: string; driftCount: number; verified: string[] };
  summary: string;
  results: T[];
  warnings: string[];
  diagnostics: {
    truncated: boolean;
    omittedCount: number;
    estimatedTokens: number;
    tscVersion: string | null;
  };
}

const SCHEMA_VERSION = 1;

export function buildEnvelope<T>(input: {
  rootHash: string;
  gitState: { revision: string | null; dirty: boolean };
  freshness: Envelope<T>["freshness"];
  summary: string;
  results: T[];
  warnings: string[];
  truncated: boolean;
  omittedCount: number;
  estimatedTokens: number;
}): Envelope<T> {
  return {
    schemaVersion: SCHEMA_VERSION,
    repository: {
      rootHash: input.rootHash,
      revision: input.gitState.revision,
      dirty: input.gitState.dirty,
    },
    freshness: input.freshness,
    summary: input.summary,
    results: input.results,
    warnings: input.warnings,
    diagnostics: {
      truncated: input.truncated,
      omittedCount: input.omittedCount,
      estimatedTokens: input.estimatedTokens,
      tscVersion: null, // no COMPILER-tier upgrade pass exists in this plan — see "Out of scope"
    },
  };
}
```

(`Envelope`'s own `schemaVersion` is the *response-shape* version, independent of `store`'s `SCHEMA_VERSION` — the two happen to both start at a small integer; they are not the same counter and must not be conflated when either changes later.)

- [ ] **Step 6: Implement `pack/impactpack.ts`**

```ts
// src/pack/impactpack.ts
import { createHash } from "node:crypto";
import { getImpactRadius, type ImpactRow } from "../query/impact.js";
import { gitState } from "../repo/git.js";
import { RepoBoundary } from "../repo/boundary.js";
import { ensureFresh, NoIndexError } from "./refresh.js";
import { verifySymbolBody } from "./verify.js";
import { buildEnvelope, type Envelope } from "./envelope.js";
import { packToBudget } from "./tokens.js";
import { SchemaVersionError } from "../store/index.js";

export interface ImpactResultRow extends ImpactRow {
  partialBody?: boolean;
}

export async function packImpactResponse(
  root: string,
  dbPath: string,
  params: { symbols?: string[]; fromGitDiff?: boolean },
  budgetTokens: number,
): Promise<Envelope<ImpactResultRow>> {
  const rootHash = createHash("sha256").update(new RepoBoundary(root).root).digest("hex").slice(0, 16);
  const boundary = new RepoBoundary(root);

  let state;
  try {
    state = await ensureFresh(root, dbPath);
  } catch (error) {
    if (error instanceof NoIndexError || error instanceof SchemaVersionError) {
      return buildEnvelope({
        rootHash, gitState: gitState(boundary),
        freshness: { state: "unknown", driftCount: 0, verified: [] },
        summary: error.message, results: [], warnings: [error.message],
        truncated: false, omittedCount: 0, estimatedTokens: 0,
      });
    }
    throw error;
  }

  try {
    const impact = getImpactRadius(state.db, boundary, params);
    const sections = impact.affected.map((row, index) => ({
      id: row.stableKey,
      priority: index === 0 ? 0 : 1,
      text: `${row.qualifiedName} (${row.path}:${row.depth})`,
    }));
    const packed = packToBudget(sections, budgetTokens);
    const included = new Set(packed.included);
    const results = impact.affected.filter((row) => included.has(row.stableKey));

    return buildEnvelope({
      rootHash,
      gitState: gitState(boundary),
      freshness: state.freshness,
      summary: `${results.length} affected symbol(s) from ${impact.seeds.length} seed(s)`,
      results,
      warnings: [...state.warnings, ...impact.warnings],
      truncated: impact.truncated || packed.truncated,
      omittedCount: impact.affected.length - results.length,
      estimatedTokens: packed.estimatedTokens,
    });
  } finally {
    state.db.close();
  }
}
```

`verifySymbolBody` is imported and available for a future task that attaches actual source excerpts to seed symbols (spec §7.5's "seed symbol bodies" allocation tier); this task packs structural impact rows only — no source body fetching is wired in yet, since `ImpactRow` carries no byte range today (only `query/impact.ts`'s existing columns). Note this explicitly rather than silently half-implementing body packing: `packImpactResponse` returns qualified names and locations, not source text, and the import above documents the seam where body-fetching will attach once needed.

- [ ] **Step 7: Run tests to verify they pass**

Run: `npx vitest run tests/pack/tokens.test.ts tests/pack/envelope.test.ts tests/pack/impactpack.test.ts`
Expected: PASS.

- [ ] **Step 8: Run the full suite, typecheck, and build**

Run: `npm test && npm run typecheck && npm run build`
Expected: all PASS.

- [ ] **Step 9: Commit**

```bash
git add src/pack/tokens.ts src/pack/envelope.ts src/pack/impactpack.ts \
  tests/pack/tokens.test.ts tests/pack/envelope.test.ts tests/pack/impactpack.test.ts \
  package.json package-lock.json
git commit -m "feat: add token budgeting, response envelope, and impact packing"
```

---

### Task 11: `mcp/server.ts` — wire the three MCP tools

**Files:**
- Create: `src/mcp/schemas.ts`, `src/mcp/server.ts`
- Modify: `package.json` (add `@modelcontextprotocol/sdk`, `zod`)
- Test: `tests/mcp/server.test.ts`

**Interfaces:**
- Consumes: `findSymbols` (Task 5), `queryGraph` (Task 7), `packImpactResponse` (Task 10), `ensureFresh`/`NoIndexError` (Task 9), `gitState` (Task 3), `indexPathFor` (Task 4).
- Produces: `createServer(root: string): McpServer`. Task 12 (CLI's `mcp serve`) is the only caller.

`mcp/` is deliberately thin (per the component table in spec §5): each tool handler resolves the index path, calls exactly one function from `query/` or `pack/`, and returns its envelope as the tool's JSON content. No query logic, no freshness logic, no token-budget logic lives here — that would duplicate what Tasks 5–10 already built and tested.

- [ ] **Step 1: Write the failing test**

```ts
// tests/mcp/server.test.ts
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { createServer } from "../../src/mcp/server.js";
import { indexRepo } from "../../src/index/pipeline.js";
import { indexPathFor } from "../../src/index/cache.js";

let root: string;
let client: Client;

beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), "cg-mcp-"));
  mkdirSync(join(root, "src"));
  writeFileSync(join(root, "tsconfig.json"), "{}");
  writeFileSync(
    join(root, "src", "a.ts"),
    "export function refreshSession() {}\nexport function caller() { refreshSession(); }\n",
  );
  await indexRepo(root, indexPathFor(root));

  const server = createServer(root);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  client = new Client({ name: "test-client", version: "0.0.0" });
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
});

afterEach(async () => {
  await client.close();
  rmSync(root, { recursive: true, force: true });
});

describe("createServer", () => {
  it("lists exactly the three spec tools", async () => {
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([
      "find_symbols", "get_impact_radius", "query_graph",
    ]);
  });

  it("answers find_symbols with a fresh envelope", async () => {
    const result = await client.callTool({
      name: "find_symbols",
      arguments: { query: "refreshSession" },
    });
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? "{}";
    const envelope = JSON.parse(text);
    expect(envelope.freshness.state).toBe("fresh");
    expect(envelope.results.some((r: { stableKey: string }) => r.stableKey.includes("refreshSession"))).toBe(true);
  });

  it("answers query_graph callers_of", async () => {
    const result = await client.callTool({
      name: "query_graph",
      arguments: { pattern: "callers_of", symbol: "refreshSession" },
    });
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? "{}";
    const envelope = JSON.parse(text);
    expect(envelope.lexical.some((r: { qualifiedName: string }) => r.qualifiedName === "caller")).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/mcp/server.test.ts`
Expected: FAIL — cannot resolve `src/mcp/server.js`.

- [ ] **Step 3: Add dependencies**

```bash
npm install @modelcontextprotocol/sdk@^1.30.0 zod@^4.4.3
```

- [ ] **Step 4: Define the input schemas**

```ts
// src/mcp/schemas.ts
import { z } from "zod";

export const findSymbolsSchema = {
  query: z.string().describe("Symbol name, path fragment, or free text"),
  kinds: z.array(z.string()).optional(),
  paths: z.array(z.string()).optional(),
  limit: z.number().int().positive().optional(),
};

export const queryGraphSchema = {
  pattern: z.enum([
    "callers_of", "callees_of", "references_to",
    "imports_of", "imported_by",
    "implementations_of", "inheritors_of", "inherits_from",
    "tests_for", "contained_by", "contains",
  ]),
  symbol: z.string().describe("stable_key, qualified name, or short name"),
  limit: z.number().int().positive().optional(),
};

export const getImpactRadiusSchema = {
  symbols: z.array(z.string()).optional(),
  from_git_diff: z.boolean().optional(),
  token_budget: z.number().int().positive().optional(),
};
```

- [ ] **Step 5: Implement the server**

```ts
// src/mcp/server.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { indexPathFor } from "../index/cache.js";
import { findSymbols, type FindSymbolsParams } from "../query/find.js";
import { queryGraph, type TraverseParams } from "../query/traverse.js";
import { packImpactResponse } from "../pack/impactpack.js";
import { ensureFresh, NoIndexError } from "../pack/refresh.js";
import { gitState } from "../repo/git.js";
import { RepoBoundary } from "../repo/boundary.js";
import { SchemaVersionError } from "../store/index.js";
import { createHash } from "node:crypto";
import { findSymbolsSchema, getImpactRadiusSchema, queryGraphSchema } from "./schemas.js";

const DEFAULT_TOKEN_BUDGET = 8000;

function jsonContent(value: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] };
}

function unknownEnvelope(root: string, message: string) {
  const boundary = new RepoBoundary(root);
  const rootHash = createHash("sha256").update(boundary.root).digest("hex").slice(0, 16);
  return {
    schemaVersion: 1,
    repository: { rootHash, ...gitState(boundary) },
    freshness: { state: "unknown", driftCount: 0, verified: [] },
    summary: message,
    results: [],
    warnings: [message],
    diagnostics: { truncated: false, omittedCount: 0, estimatedTokens: 0, tscVersion: null },
  };
}

export function createServer(root: string): McpServer {
  const server = new McpServer({ name: "sonde", version: "0.1.0" });

  server.registerTool(
    "find_symbols",
    {
      title: "Find symbols",
      description:
        "Seed retrieval over the indexed symbol graph: exact qualified name, then " +
        "exact short name, then full-text search. Returns signatures only, no source bodies.",
      inputSchema: findSymbolsSchema,
    },
    async (params: FindSymbolsParams) => {
      const dbPath = indexPathFor(root);
      try {
        const state = await ensureFresh(root, dbPath);
        try {
          const results = findSymbols(state.db, params);
          return jsonContent({
            schemaVersion: 1,
            repository: {
              rootHash: createHash("sha256").update(new RepoBoundary(root).root).digest("hex").slice(0, 16),
              ...gitState(new RepoBoundary(root)),
            },
            freshness: state.freshness,
            summary: `${results.length} match(es)`,
            results,
            warnings: state.warnings,
            diagnostics: { truncated: false, omittedCount: 0, estimatedTokens: 0, tscVersion: null },
          });
        } finally {
          state.db.close();
        }
      } catch (error) {
        if (error instanceof NoIndexError || error instanceof SchemaVersionError) {
          return jsonContent(unknownEnvelope(root, error.message));
        }
        throw error;
      }
    },
  );

  server.registerTool(
    "query_graph",
    {
      title: "Query graph",
      description:
        "Structural graph traversal — callers, callees, imports, inheritance, tests, " +
        "and containment — bucketed by evidence tier with external/unresolved completeness counts.",
      inputSchema: queryGraphSchema,
    },
    async (params: TraverseParams) => {
      const dbPath = indexPathFor(root);
      try {
        const state = await ensureFresh(root, dbPath);
        try {
          const result = queryGraph(state.db, params);
          return jsonContent({ ...result, freshness: state.freshness, warnings: state.warnings });
        } finally {
          state.db.close();
        }
      } catch (error) {
        if (error instanceof NoIndexError || error instanceof SchemaVersionError) {
          return jsonContent(unknownEnvelope(root, error.message));
        }
        throw error;
      }
    },
  );

  server.registerTool(
    "get_impact_radius",
    {
      title: "Get impact radius",
      description:
        "The headline workflow: reverse-traverses calls, references, implements, and " +
        "inherits from the given symbols (or the current git diff) to a token budget. " +
        "Structural test edges are evidence of relatedness, never proof of coverage.",
      inputSchema: getImpactRadiusSchema,
    },
    async (params: { symbols?: string[]; from_git_diff?: boolean; token_budget?: number }) => {
      const dbPath = indexPathFor(root);
      const envelope = await packImpactResponse(
        root,
        dbPath,
        { symbols: params.symbols, fromGitDiff: params.from_git_diff },
        params.token_budget ?? DEFAULT_TOKEN_BUDGET,
      );
      return jsonContent(envelope);
    },
  );

  return server;
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run tests/mcp/server.test.ts`
Expected: PASS.

- [ ] **Step 7: Run the full suite, typecheck, and build**

Run: `npm test && npm run typecheck && npm run build`
Expected: all PASS.

- [ ] **Step 8: Commit**

```bash
git add src/mcp/schemas.ts src/mcp/server.ts tests/mcp/server.test.ts package.json package-lock.json
git commit -m "feat: wire find_symbols, query_graph, and get_impact_radius as MCP tools"
```

---

### Task 12: CLI additions — `search`, `query`, `impact`, `mcp serve`

**Files:**
- Modify: `src/cli/main.ts`
- Test: `tests/cli/cli.test.ts`

**Interfaces:**
- Consumes: `findSymbols` (Task 5), `queryGraph` (Task 7), `packImpactResponse` (Task 10), `createServer` (Task 11).
- Produces: `sonde search|query|impact|mcp serve`, alongside the existing `index|update|status|doctor|clean` from Plan 1.

The CLI and the MCP server must answer identically for the same inputs — that is the entire reason Tasks 5–10 built plain functions instead of MCP-tool-shaped ones. These four subcommands are thin `commander` wrappers, structurally identical to the five Plan 1 already shipped.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/cli/cli.test.ts — add inside the existing describe("cli", ...) block
it("search finds a symbol by name", () => {
  const out = JSON.parse(cli("search", root, "a", "--json")) as {
    results: Array<{ stableKey: string }>;
  };
  expect(out.results.length).toBeGreaterThan(0);
});

it("query answers callees_of", () => {
  writeFileSync(
    join(root, "src", "a.ts"),
    "export function a() { b(); }\nexport function b() {}\n",
  );
  cli("index", root, "--json");
  const out = JSON.parse(cli("query", root, "callees_of", "a", "--json")) as {
    lexical: Array<{ qualifiedName: string }>;
  };
  expect(out.lexical.some((r) => r.qualifiedName === "b")).toBe(true);
});

it("impact reports affected symbols for a seed", () => {
  cli("index", root, "--json");
  const out = JSON.parse(cli("impact", root, "--symbol", "a", "--json")) as {
    results: unknown[];
  };
  expect(Array.isArray(out.results)).toBe(true);
});
```

(`mcp serve` starts a long-lived stdio server and is exercised end-to-end by `tests/mcp/server.test.ts`'s `createServer` coverage, not by another `execFileSync` round-trip here — spawning and then killing a persistent subprocess from a unit test adds flakiness for no additional coverage, since `createServer` is the same function the CLI command calls.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/cli/cli.test.ts`
Expected: FAIL — `search`/`query`/`impact` are not recognized `commander` subcommands.

- [ ] **Step 3: Add the subcommands**

```ts
// src/cli/main.ts — add these imports alongside the existing ones
import { findSymbols } from "../query/find.js";
import { queryGraph, type TraversePattern } from "../query/traverse.js";
import { packImpactResponse } from "../pack/impactpack.js";
import { createServer } from "../mcp/server.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

// add alongside the existing program.command(...) blocks, before `await program.parseAsync(...)`

program
  .command("search")
  .argument("<query>", "search text")
  .argument("[path]", "repository root", ".")
  .option("--json", "structured output")
  .action(async (query: string, path: string, options: { json?: boolean }) => {
    const dbPath = indexPathFor(path);
    const db = openDb(dbPath);
    try {
      migrate(db);
      const results = findSymbols(db, { query });
      emit(
        options.json === true,
        { results },
        results.map((r) => `${r.stableKey}  (${r.reason})`).join("\n") || "no matches",
      );
    } finally {
      db.close();
    }
  });

program
  .command("query")
  .argument("<pattern>", "callers_of|callees_of|references_to|imports_of|imported_by|" +
    "implementations_of|inheritors_of|inherits_from|tests_for|contained_by|contains")
  .argument("<symbol>", "stable_key, qualified name, or short name")
  .argument("[path]", "repository root", ".")
  .option("--json", "structured output")
  .action(
    async (
      pattern: string,
      symbol: string,
      path: string,
      options: { json?: boolean },
    ) => {
      const dbPath = indexPathFor(path);
      const db = openDb(dbPath);
      try {
        migrate(db);
        const result = queryGraph(db, { pattern: pattern as TraversePattern, symbol });
        emit(
          options.json === true,
          result,
          `compiler=${result.compiler.length} lexical=${result.lexical.length} ` +
            `heuristic=${result.heuristic.length} external=${result.external.count} ` +
            `unresolved=${result.unresolved.count}`,
        );
      } finally {
        db.close();
      }
    },
  );

program
  .command("impact")
  .argument("[path]", "repository root", ".")
  .option("--symbol <name>", "seed symbol (repeatable)", (value: string, previous: string[]) => [...previous, value], [] as string[])
  .option("--from-git-diff", "seed from the current working-tree diff")
  .option("--token-budget <n>", "token budget", (value: string) => Number(value))
  .option("--json", "structured output")
  .action(
    async (
      path: string,
      options: { symbol: string[]; fromGitDiff?: boolean; tokenBudget?: number; json?: boolean },
    ) => {
      const envelope = await packImpactResponse(
        path,
        indexPathFor(path),
        { symbols: options.symbol.length > 0 ? options.symbol : undefined, fromGitDiff: options.fromGitDiff },
        options.tokenBudget ?? 8000,
      );
      emit(
        options.json === true,
        envelope,
        `${envelope.summary} (${envelope.freshness.state})`,
      );
    },
  );

program
  .command("mcp")
  .command("serve")
  .argument("[path]", "repository root", ".")
  .action(async (path: string) => {
    const server = createServer(path);
    const transport = new StdioServerTransport();
    await server.connect(transport);
  });
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/cli/cli.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the full suite, typecheck, and build**

Run: `npm test && npm run typecheck && npm run build`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add src/cli/main.ts tests/cli/cli.test.ts
git commit -m "feat: add search, query, impact, and mcp serve CLI commands"
```

---

### Task 13: README publishing the oracle report

**Files:**
- Create: `README.md`

**Interfaces:**
- Consumes: `ORACLE.md`'s content (already generated by `npm run bench:oracle`, Plan 1 Task 15).
- Produces: nothing code-facing. This is spec §12 Definition-of-Done item 4 — "Oracle report published in the README" — which Plan 1 shipped as a standalone `ORACLE.md` file instead.

- [ ] **Step 1: Regenerate the oracle report against the current code**

Run: `npm run bench:oracle`
Expected: `ORACLE.md` rewritten with current numbers (now measuring the file-symbol/IMPORTS-edge changes from Task 1 — `CONTAINS` and `IMPORTS` are excluded from the oracle's own edge-kind filter, per `bench/report.ts`'s existing `WHERE e.kind IN ('CALLS','REFERENCES','INHERITS','IMPLEMENTS')`, but Task 1's top-level-reference fix means some previously-dropped `CALLS`/`REFERENCES` edges now exist and may change recall).

- [ ] **Step 2: Write the README**

```markdown
<!-- README.md -->
# Sonde

A local code-context engine for AI coding agents. Sonde indexes a TypeScript
repository into a symbol-level graph in SQLite and exposes three MCP tools —
`find_symbols`, `query_graph`, `get_impact_radius` — so an agent can ask
structural questions text search cannot answer: who calls this, what breaks if
I change it, which tests touch it.

## Install and run

    npx sonde index .
    npx sonde mcp serve .

No install step, no account. Point your MCP client at `sonde mcp serve`.

## What it guarantees

- **Never returns stale bytes.** Every response re-reads and re-hashes the
  source it quotes before returning it (spec §8.1, Guarantee A).
- **Always reports structural drift**, rather than claiming completeness it
  cannot verify (spec §8.1, Guarantee B). `sonde status` shows the same
  drift and tier distribution every MCP response carries in its envelope.
- **Every edge is tier-labelled by how it was found** — `LEXICAL` (resolved
  through the import table and lexical scope, no type inference), `HEURISTIC`
  (member access, ambiguous without types), `EXTERNAL` (resolved outside the
  indexed repo), or `UNRESOLVED` (genuinely unplaceable, with a reason). A
  `COMPILER` tier is reserved in the data model for a future `tsc`-backed
  upgrade pass; nothing in the current build produces it.
- **Never fabricates an edge.** An unresolved reference becomes `EXTERNAL` or
  `UNRESOLVED` — never a guessed target, never a silently dropped reference.

## Accuracy

Sonde measures itself against the TypeScript compiler on a pinned fixture
and publishes the result, unflattering numbers included — no other tool in
this category does this (spec §12).

<!-- ORACLE_REPORT_START -->
[paste the current contents of ORACLE.md here, verbatim]
<!-- ORACLE_REPORT_END -->

Regenerate with `npm run bench:oracle`.

## CLI

    sonde index [path]              # full index
    sonde update [path]             # incremental, content-hash accounted
    sonde status [path]             # freshness, tier distribution
    sonde search <query> [path]     # find_symbols from the terminal
    sonde query <pattern> <symbol> [path]   # query_graph from the terminal
    sonde impact [path] --symbol <name>     # get_impact_radius from the terminal
    sonde doctor [path]             # parser/database/tsc health
    sonde clean [path]              # remove the cached index
    sonde mcp serve [path]          # start the MCP server (stdio)

## Known limitations (v0.1)

- TypeScript/TSX only; no Swift, Python, or other language adapter.
- `TESTS` edges are not yet produced — `tests_for` always returns empty.
- The `COMPILER` tier is not yet implemented — every resolved edge is
  `LEXICAL` or `HEURISTIC`.
- Type-only references, JSX intrinsics, `export =`/`import =`, decorators, and
  declaration merging are known, by-design gaps in the tree-sitter extraction
  path (see the oracle report above).

See `docs/superpowers/specs/2026-08-16-sonde-design.md` for the full design.
```

Copy the actual `ORACLE.md` contents from Step 1 into the marked section — do not hand-write placeholder numbers; the whole point of this task is publishing the real, current, possibly-unflattering measurement (spec §12, "including unflattering numbers").

- [ ] **Step 3: Verify the README's CLI reference matches the actual commands**

Run: `node --import tsx src/cli/main.ts --help` and cross-check every subcommand and flag listed in the README against the real `--help` output (this catches drift between what Task 12 actually implemented and what got written down — e.g. option names like `--symbol` vs `--symbols`).
Expected: exact match; fix the README, not the CLI, for any mismatch found.

- [ ] **Step 4: Commit**

```bash
git add README.md ORACLE.md
git commit -m "docs: publish README with the oracle accuracy report"
```

---

## Self-review notes

- **Spec coverage:** §6 (`symbol_fts`, file symbols, `IMPORTS`) — Task 1, 2. §7.1 `find_symbols` — Task 5. §7.2 `query_graph`, all 11 patterns — Task 7. §7.3 `get_impact_radius`, `INHERITS` included, `from_git_diff` — Task 8, 10. §7.4 ranking — Task 6. §7.5 token budgeting — Task 10. §7.6 envelope — Task 10. §8 freshness (both guarantees, all five states except `stale`, which needs a per-file read path this plan's tools don't expose individually — noted, not silently dropped) — Task 9. §9 error handling (`NoIndexError`, `SchemaVersionError` handling, never-throw `git.ts`) — Tasks 3, 9, 11. §12 DoD items 1–4 — Tasks 1–13 collectively. Item 5 (benchmark) is explicitly Plan 3, not this plan.
- **Placeholder scan:** no `TBD`/`TODO`/"add appropriate handling" text in any task's code blocks; every step shows real code or a real command.
- **Type consistency, checked across tasks:** `TraverseParams`/`TraverseResult` (Task 7) match their use in Task 11 and Task 12. `ImpactParams`/`ImpactResult`/`ImpactRow` (Task 8) match `packImpactResponse`'s consumption in Task 10. `FindSymbolsParams`/`FindResult` (Task 5) match Task 11/12. `ReadState`/`NoIndexError` (Task 9) match every catch site in Tasks 10, 11. `Envelope<T>` (Task 10) is the one response shape every MCP tool and every `--json` CLI command returns.
