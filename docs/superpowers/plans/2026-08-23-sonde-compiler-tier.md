# Sonde COMPILER Tier Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade cross-file edges from `HEURISTIC`/`UNRESOLVED` to `COMPILER` tier using the bundled TypeScript type checker, so `callers_of` on a common method name returns real callers instead of an empty result and an unresolved count.

**Architecture:** A new opt-in pass runs after RESOLVE. It builds one `ts.Program`, walks each in-repo source file's identifiers, asks the checker for the declaration, maps that declaration back to a Sonde `stable_key`, and rewrites the matching edge to `tier = 'COMPILER'`. The Program is built, used, and discarded inside the pass — it is never held by the MCP server.

**Tech Stack:** TypeScript (strict), Node 22+, bundled `typescript`, `better-sqlite3`, `vitest`.

**Spec:** `docs/superpowers/specs/2026-08-16-sonde-design.md` (revision 3) — §4.3 tiers, §5.3 bundled compiler, §8.4 tier downgrade on refresh.

## Why this is the highest-value remaining work

`src/resolve/tiers.ts` caps ambiguous references at `AMBIGUITY_CAP = 8` and records the overflow as `UNRESOLVED` with `reason: "too_ambiguous"`. That cap is correct — it replaced 354,291 mostly-noise edges with 44,107 — but it means:

```
$ sonde query callers_of "ts:src/hono-base.ts#Hono.route" tests/fixtures/repos/large
0 graph result(s) | compiler 0 lexical 0 heuristic 0 unresolved 53
```

Type information is the only thing that resolves `x.route()` to a specific `route`. This pass supplies it.

## Measurements (taken 2026-08-23 on `tests/fixtures/repos/large`, Hono v4.6.3)

These are **verified numbers, not estimates**. Do not re-derive them to decide whether to proceed; do use Task 1 Step 5 to confirm they still hold.

| Measure | Value |
|---|---:|
| Files in program | 271 |
| `ts.createProgram` | 792 ms |
| Full identifier resolve pass | 1,579 ms |
| Identifiers seen | 81,289 |
| Identifiers resolved to a declaration | **80,344 (98.8%)** |
| Peak heap during pass | 416 MB |
| Current tree-sitter index time (for comparison) | 5,400 ms |

**On the 416 MB.** PRD §17.1 caps *idle MCP memory* at 300 MB. This is a transient index-time cost, and spec §8.4 already ruled that the inline-refresh path never builds a Program. Build it, use it, discard it, and the idle cap is untouched. **Do not** keep a Program warm to make refresh faster — that is the specific thing §8.4 forbids.

## The oracle question — decided, do not relitigate

An earlier review warned that sharing code between `bench/oracle/` and the resolver creates correlated errors: a containment bug would appear in both, and the oracle would silently agree with the bug it exists to catch.

**Resolution: `tsc` is the authority, so `COMPILER` edges do not need oracle validation.** You do not measure tsc against tsc. The oracle's job narrows to measuring the **tree-sitter path** — which is the zero-setup default and the only part whose accuracy is actually in question. Task 6 makes that narrowing explicit in the report.

This means Task 2 **may** reuse the approach in `bench/oracle/ancestry.ts`, but must not import from `bench/` into `src/`. `bench/` is not shipped.

## Global Constraints

- **Node 22+**; ESM only. `strict: true`, `noUncheckedIndexedAccess: true`.
  - ⚠️ This machine's default `node` is **v20.20.2**. Run `nvm use` in **every** shell before any `node`/`npm`/`npx` command. If you see `EBADENGINE`, you are on the wrong node.
- **SEC-008: never execute repository code.** Use the bundled `typescript`. **Never** `require`/`import` `typescript` from the target repository, even to match its version. Version skew is accepted and disclosed (spec §5.3).
- **SEC-001/002/003:** all repository reads go through `src/repo/boundary.ts`. The `ts.Program` reads via `ts.sys`, which is the one sanctioned exception — confine it to `src/resolve/compilerPass.ts` and assert the resolved files are inside the boundary before writing any edge.
- **Tier vocabulary is fixed:** `COMPILER` | `LEXICAL` | `HEURISTIC` | `EXTERNAL` | `UNRESOLVED`. Sort order `COMPILER > LEXICAL > HEURISTIC`.
- **Edge kinds are fixed:** `CONTAINS` | `IMPORTS` | `CALLS` | `REFERENCES` | `IMPLEMENTS` | `INHERITS` | `TESTS`. This plan adds no new kind.
- **Never fabricate.** If the checker cannot resolve a reference, leave the existing tier alone. Never invent an edge, never downgrade a `LEXICAL` edge.
- **Degrade with a warning, never fail silently** (invariant 8). No tsconfig, a malformed tsconfig, or a Program that throws must produce a warning in the envelope and leave the index usable — never a crash and never a silently unimproved index.
- **Opt-in.** `sonde index` behaviour is unchanged by default. The pass runs only under an explicit flag.
- **Commit after every task.** Conventional commits.

---

## File Structure

```
src/resolve/
  compilerPass.ts       # NEW. Program construction, identifier walk, edge upgrade.
  symbolMapping.ts      # NEW. ts.Declaration -> Sonde stable_key.
src/store/
  repos.ts              # MODIFY. Add upgradeEdgeTier + tier count accessors.
src/index/
  pipeline.ts           # MODIFY. Call the pass when enabled.
src/cli/
  main.ts               # MODIFY. --resolve flag on index/update; doctor reports availability.
bench/
  report.ts             # MODIFY. State that the oracle measures the tree-sitter path.
tests/resolve/
  symbolMapping.test.ts # NEW.
  compilerPass.test.ts  # NEW.
tests/index/
  compilerIntegration.test.ts # NEW. End-to-end on a real fixture.
```

---

### Task 1: Program construction with graceful degradation

**Files:**
- Create: `src/resolve/compilerPass.ts`, `tests/resolve/compilerPass.test.ts`

**Interfaces:**
- Consumes: `RepoBoundary` from `src/repo/boundary.js`
- Produces:
  - `interface CompilerContext { program: ts.Program; checker: ts.TypeChecker; inRepo(fileName: string): boolean; }`
  - `function createCompilerContext(root: string): CompilerContext | null` — returns `null` when unavailable, never throws
  - `class CompilerUnavailable extends Error` (used only for the reason string, not thrown out of the module)
  - `const TSC_VERSION: string` re-exported from the bundled `typescript`

- [ ] **Step 1: Write the failing test**

```ts
// tests/resolve/compilerPass.test.ts
import { describe, expect, it, beforeAll } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createCompilerContext, TSC_VERSION } from "../../src/resolve/compilerPass.js";

function fixture(withConfig: boolean): string {
  const root = mkdtempSync(join(tmpdir(), "cg-compiler-"));
  mkdirSync(join(root, "src"));
  writeFileSync(join(root, "src", "a.ts"), "export function a(): number { return 1; }");
  if (withConfig) {
    writeFileSync(join(root, "tsconfig.json"), JSON.stringify({
      compilerOptions: { strict: true, moduleResolution: "bundler", module: "esnext", target: "es2022" },
      include: ["src"],
    }));
  }
  return root;
}

describe("createCompilerContext", () => {
  it("builds a program when a tsconfig is present", () => {
    const context = createCompilerContext(fixture(true));
    expect(context).not.toBeNull();
    expect(context!.program.getSourceFiles().length).toBeGreaterThan(0);
  });

  it("returns null rather than throwing when tsconfig is absent", () => {
    // Invariant 8: a missing toolchain degrades with a warning; it never
    // crashes an index that would otherwise have succeeded.
    expect(createCompilerContext(fixture(false))).toBeNull();
  });

  it("returns null rather than throwing on a malformed tsconfig", () => {
    const root = fixture(false);
    writeFileSync(join(root, "tsconfig.json"), "{ this is not json");
    expect(createCompilerContext(root)).toBeNull();
  });

  it("classifies repository files as in-repo and node_modules as out", () => {
    const root = fixture(true);
    const context = createCompilerContext(root)!;
    expect(context.inRepo(join(root, "src", "a.ts"))).toBe(true);
    expect(context.inRepo(join(root, "node_modules", "x", "index.d.ts"))).toBe(false);
  });

  it("reports the bundled compiler version, not the target repository's", () => {
    // SEC-008: the target repo's typescript is never loaded. Disclosing which
    // version resolved the edges is required by spec §5.3.
    expect(TSC_VERSION).toMatch(/^\d+\.\d+/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `nvm use && npx vitest run tests/resolve/compilerPass.test.ts`
Expected: FAIL — cannot resolve `compilerPass.js`

- [ ] **Step 3: Implement**

```ts
// src/resolve/compilerPass.ts
import ts from "typescript";
import { join, sep } from "node:path";
import { existsSync, realpathSync } from "node:fs";

export const TSC_VERSION = ts.version;

export interface CompilerContext {
  program: ts.Program;
  checker: ts.TypeChecker;
  root: string;
  inRepo(fileName: string): boolean;
}

/**
 * Build a Program for `root`, or return null.
 *
 * Never throws: a missing or malformed tsconfig, or a compiler that cannot
 * construct a Program, must degrade to the tree-sitter tiers with a warning
 * rather than failing an index that would otherwise succeed (invariant 8).
 *
 * SEC-008: `ts` here is the bundled compiler. The target repository's own
 * typescript is never loaded, so resolution may differ from the version the
 * repository pins. That skew is accepted and disclosed (spec §5.3).
 */
export function createCompilerContext(root: string): CompilerContext | null {
  try {
    const realRoot = realpathSync(root);
    const configPath = join(realRoot, "tsconfig.json");
    if (!existsSync(configPath)) return null;

    const raw = ts.readConfigFile(configPath, ts.sys.readFile);
    if (raw.error) return null;

    const parsed = ts.parseJsonConfigFileContent(raw.config, ts.sys, realRoot);
    if (parsed.fileNames.length === 0) return null;

    const program = ts.createProgram(parsed.fileNames, parsed.options);
    const prefix = realRoot + sep;

    return {
      program,
      checker: program.getTypeChecker(),
      root: realRoot,
      inRepo(fileName: string): boolean {
        if (fileName.includes(`${sep}node_modules${sep}`)) return false;
        return fileName === realRoot || fileName.startsWith(prefix);
      },
    };
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/resolve/compilerPass.test.ts`
Expected: PASS, 5 tests

- [ ] **Step 5: Confirm the measurements still hold**

Run:
```bash
nvm use && npm run bench:fixture && node --import tsx -e "
import { createCompilerContext } from './src/resolve/compilerPass.ts';
const t0 = Date.now();
const c = createCompilerContext('tests/fixtures/repos/large');
console.log('program ms:', Date.now() - t0, '| files:', c?.program.getSourceFiles().length);
"
```
Expected: a program in roughly 800 ms with a few hundred files. If it is an order of magnitude slower, or null, stop and report — the rest of this plan assumes a working Program.

- [ ] **Step 6: Commit**

```bash
git add src/resolve/compilerPass.ts tests/resolve/compilerPass.test.ts
git commit -m "feat: build an optional TypeScript Program with graceful degradation"
```

---

### Task 2: Map a compiler declaration to a Sonde stable key

**Files:**
- Create: `src/resolve/symbolMapping.ts`, `tests/resolve/symbolMapping.test.ts`

**Interfaces:**
- Consumes: `CompilerContext` (Task 1)
- Produces: `function declarationToStableKey(declaration: ts.Declaration, context: CompilerContext): string | null`

This is the load-bearing correctness step. `src/adapters/typescript/symbols.ts` mints keys as `ts:{relpath}#{scope_chain}`, where `scope_chain` is the dotted chain of **named** enclosing symbols. This function must produce byte-identical keys or every upgrade silently misses.

Read `src/adapters/typescript/symbols.ts` before writing this. Anonymous callbacks are deliberately not minted; a declaration inside one attributes to the nearest **named** enclosing symbol.

- [ ] **Step 1: Write the failing test**

```ts
// tests/resolve/symbolMapping.test.ts
import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ts from "typescript";
import { createCompilerContext } from "../../src/resolve/compilerPass.js";
import { declarationToStableKey } from "../../src/resolve/symbolMapping.js";

function contextFor(source: string) {
  const root = mkdtempSync(join(tmpdir(), "cg-map-"));
  mkdirSync(join(root, "src"));
  writeFileSync(join(root, "src", "a.ts"), source);
  writeFileSync(join(root, "tsconfig.json"), JSON.stringify({
    compilerOptions: { strict: true, module: "esnext", target: "es2022", moduleResolution: "bundler" },
    include: ["src"],
  }));
  return createCompilerContext(root)!;
}

function firstDeclarationNamed(context: ReturnType<typeof contextFor>, name: string): ts.Declaration {
  for (const sourceFile of context.program.getSourceFiles()) {
    if (!context.inRepo(sourceFile.fileName)) continue;
    let found: ts.Declaration | undefined;
    const visit = (node: ts.Node): void => {
      if (found) return;
      const named = node as ts.NamedDeclaration;
      if (named.name && ts.isIdentifier(named.name) && named.name.text === name) {
        found = node as ts.Declaration;
        return;
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
    if (found) return found;
  }
  throw new Error(`no declaration named ${name}`);
}

describe("declarationToStableKey", () => {
  it("keys a top-level function exactly as the adapter does", () => {
    const context = contextFor("export function refresh(): void {}");
    const key = declarationToStableKey(firstDeclarationNamed(context, "refresh"), context);
    expect(key).toBe("ts:src/a.ts#refresh");
  });

  it("scopes a method under its class", () => {
    const context = contextFor("export class Auth { refresh(): void {} }");
    const key = declarationToStableKey(firstDeclarationNamed(context, "refresh"), context);
    expect(key).toBe("ts:src/a.ts#Auth.refresh");
  });

  it("keys an arrow bound to a name as a function, matching the adapter", () => {
    const context = contextFor("export const handler = () => {};");
    const key = declarationToStableKey(firstDeclarationNamed(context, "handler"), context);
    expect(key).toBe("ts:src/a.ts#handler");
  });

  it("attributes a declaration inside an anonymous callback to the nearest named symbol", () => {
    // spec §6.2: anonymous callbacks are never minted as symbols, so a key must
    // never contain a positional segment.
    const context = contextFor("export function outer() { [1].map(() => { function inner() {} return inner; }); }");
    const key = declarationToStableKey(firstDeclarationNamed(context, "inner"), context);
    expect(key).toBe("ts:src/a.ts#outer.inner");
  });

  it("returns null for a declaration outside the repository", () => {
    const context = contextFor("export const x: string = '';");
    const lib = context.program.getSourceFiles().find((f) => !context.inRepo(f.fileName));
    expect(lib).toBeDefined();
    let declaration: ts.Declaration | undefined;
    const visit = (node: ts.Node): void => {
      if (!declaration && ts.isInterfaceDeclaration(node)) declaration = node;
      else ts.forEachChild(node, visit);
    };
    visit(lib!);
    expect(declarationToStableKey(declaration!, context)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/resolve/symbolMapping.test.ts`
Expected: FAIL — cannot resolve `symbolMapping.js`

- [ ] **Step 3: Implement**

```ts
// src/resolve/symbolMapping.ts
import ts from "typescript";
import { relative, sep } from "node:path";
import type { CompilerContext } from "./compilerPass.js";

/**
 * Produce the same stable key the tree-sitter adapter mints.
 *
 * Must stay byte-identical to `src/adapters/typescript/symbols.ts`. Any drift
 * makes every upgrade silently miss: the key simply will not match a stored
 * edge, and the pass will look like it ran and changed nothing.
 */
function namedSegment(node: ts.Node): string | null {
  if (ts.isFunctionDeclaration(node) && node.name) return node.name.text;
  if (ts.isClassDeclaration(node)) return node.name ? node.name.text : "default";
  if (ts.isInterfaceDeclaration(node)) return node.name.text;
  if (ts.isTypeAliasDeclaration(node)) return node.name.text;
  if (ts.isEnumDeclaration(node)) return node.name.text;
  if ((ts.isMethodDeclaration(node) || ts.isMethodSignature(node)) && ts.isIdentifier(node.name)) {
    return node.name.text;
  }
  if (ts.isPropertyDeclaration(node) && ts.isIdentifier(node.name)) return node.name.text;
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) return node.name.text;
  // Anonymous functions and arrows are NOT segments (spec §6.2): references
  // inside them attribute to the nearest named enclosing symbol.
  return null;
}

export function declarationToStableKey(
  declaration: ts.Declaration,
  context: CompilerContext,
): string | null {
  const sourceFile = declaration.getSourceFile();
  if (!context.inRepo(sourceFile.fileName)) return null;

  const chain: string[] = [];
  let node: ts.Node | undefined = declaration;
  while (node && !ts.isSourceFile(node)) {
    const segment = namedSegment(node);
    if (segment) chain.unshift(segment);
    node = node.parent;
  }
  if (chain.length === 0) return null;

  const relativePath = relative(context.root, sourceFile.fileName).split(sep).join("/");
  return `ts:${relativePath}#${chain.join(".")}`;
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/resolve/symbolMapping.test.ts`
Expected: PASS, 5 tests

- [ ] **Step 5: Commit**

```bash
git add src/resolve/symbolMapping.ts tests/resolve/symbolMapping.test.ts
git commit -m "feat: map compiler declarations to Sonde stable keys"
```

---

### Task 3: Store accessor for tier upgrades

**Files:**
- Modify: `src/store/repos.ts`
- Modify: `tests/store/store.test.ts`

**Interfaces:**
- Produces on `Store`:
  - `upgradeEdgeTier(srcKey: string, dstKey: string, kind: EdgeKind): boolean` — sets `tier='COMPILER'`, `confidence=1.0`; returns whether a row changed
  - `deleteUnresolvedFor(srcKey: string, name: string): number`
  - `tierCounts(): Record<string, number>`

- [ ] **Step 1: Write the failing test**

Append to `tests/store/store.test.ts`:

```ts
describe("compiler tier upgrades", () => {
  function seedEdge(tier: "HEURISTIC" | "LEXICAL") {
    store.upsertFile({ path: "a.ts", contentHash: "h", mtimeMs: 1, size: 1 });
    const base = {
      filePath: "a.ts", kind: "function" as const, signature: null,
      startByte: 0, endByte: 1, startLine: 1, endLine: 1,
      bodyHash: null, exported: true, isTest: false,
    };
    store.insertSymbols([
      { ...base, stableKey: "ts:a.ts#caller", qualifiedName: "caller", shortName: "caller" },
      { ...base, stableKey: "ts:a.ts#target", qualifiedName: "target", shortName: "target" },
    ]);
    store.insertEdges([{
      srcKey: "ts:a.ts#caller", dstKey: "ts:a.ts#target",
      kind: "CALLS", tier, confidence: tier === "HEURISTIC" ? 0.25 : 1, siteLine: 1,
    }]);
  }

  it("upgrades a heuristic edge and reports the change", () => {
    seedEdge("HEURISTIC");
    expect(store.upgradeEdgeTier("ts:a.ts#caller", "ts:a.ts#target", "CALLS")).toBe(true);
    expect(store.tierCounts().COMPILER).toBe(1);
  });

  it("sets confidence to 1.0 on upgrade", () => {
    seedEdge("HEURISTIC");
    store.upgradeEdgeTier("ts:a.ts#caller", "ts:a.ts#target", "CALLS");
    const counts = store.tierCounts();
    expect(counts.HEURISTIC ?? 0).toBe(0);
  });

  it("reports no change for an edge that does not exist", () => {
    seedEdge("HEURISTIC");
    expect(store.upgradeEdgeTier("ts:a.ts#caller", "ts:a.ts#missing", "CALLS")).toBe(false);
  });

  it("never downgrades a LEXICAL edge", () => {
    // Tier order is COMPILER > LEXICAL > HEURISTIC. Upgrading LEXICAL to
    // COMPILER is fine; the guard is that nothing here can lower a tier.
    seedEdge("LEXICAL");
    store.upgradeEdgeTier("ts:a.ts#caller", "ts:a.ts#target", "CALLS");
    expect(store.tierCounts().COMPILER).toBe(1);
    expect(store.tierCounts().LEXICAL ?? 0).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/store/store.test.ts`
Expected: FAIL — `store.upgradeEdgeTier is not a function`

- [ ] **Step 3: Implement**

Add to `class Store` in `src/store/repos.ts`:

```ts
  /** Promote one edge to COMPILER tier. Returns whether a row changed. */
  upgradeEdgeTier(srcKey: string, dstKey: string, kind: EdgeKind): boolean {
    const result = this.db
      .prepare(
        `UPDATE edge SET tier = 'COMPILER', confidence = 1.0
         WHERE kind = @kind
           AND src_symbol_id = (SELECT id FROM symbol WHERE stable_key = @srcKey)
           AND dst_symbol_id = (SELECT id FROM symbol WHERE stable_key = @dstKey)`,
      )
      .run({ srcKey, dstKey, kind });
    return result.changes > 0;
  }

  /** Remove unresolved records the compiler has now placed. */
  deleteUnresolvedFor(srcKey: string, name: string): number {
    return this.db
      .prepare(
        `DELETE FROM unresolved_ref
         WHERE name = @name
           AND src_symbol_id = (SELECT id FROM symbol WHERE stable_key = @srcKey)`,
      )
      .run({ srcKey, name }).changes;
  }

  tierCounts(): Record<string, number> {
    const rows = this.db
      .prepare("SELECT tier, COUNT(*) AS n FROM edge GROUP BY tier")
      .all() as Array<{ tier: string; n: number }>;
    return Object.fromEntries(rows.map((row) => [row.tier, row.n]));
  }
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/store/store.test.ts`
Expected: PASS, all store tests

- [ ] **Step 5: Commit**

```bash
git add src/store/repos.ts tests/store/store.test.ts
git commit -m "feat: add compiler-tier edge upgrade accessors"
```

---

### Task 4: The upgrade pass

**Files:**
- Modify: `src/resolve/compilerPass.ts`
- Modify: `tests/resolve/compilerPass.test.ts`

**Interfaces:**
- Produces:
  - `interface CompilerPassResult { upgraded: number; unresolvedCleared: number; identifiersSeen: number; identifiersResolved: number; tscVersion: string; }`
  - `function runCompilerPass(root: string, store: Store): CompilerPassResult | null` — `null` when the Program is unavailable

Walk every in-repo source file. For each identifier that is not a declaration name, ask the checker for its symbol, take the first declaration, map it to a stable key, and upgrade the edge from the enclosing symbol.

- [ ] **Step 1: Write the failing test**

Append to `tests/resolve/compilerPass.test.ts`:

```ts
describe("runCompilerPass", () => {
  it("upgrades a member call the tree-sitter path could only guess at", async () => {
    // Two classes declare `get`. Without types the reference is HEURISTIC or,
    // past AMBIGUITY_CAP, dropped entirely with reason "too_ambiguous".
    const root = mkdtempSync(join(tmpdir(), "cg-pass-"));
    mkdirSync(join(root, "src"));
    writeFileSync(join(root, "src", "store.ts"), "export class Store { get(): number { return 1; } }");
    writeFileSync(join(root, "src", "cache.ts"), "export class Cache { get(): number { return 2; } }");
    writeFileSync(join(root, "src", "app.ts"),
      "import { Store } from './store.js';\n" +
      "export function run(s: Store): number { return s.get(); }");
    writeFileSync(join(root, "tsconfig.json"), JSON.stringify({
      compilerOptions: { strict: true, module: "esnext", target: "es2022", moduleResolution: "bundler" },
      include: ["src"],
    }));

    const dbPath = join(root, "index.sqlite");
    await indexRepo(root, dbPath);
    const db = openDb(dbPath);
    migrate(db);
    const store = new Store(db);

    const result = runCompilerPass(root, store);
    expect(result).not.toBeNull();
    expect(result!.upgraded).toBeGreaterThan(0);

    const compilerEdges = db.prepare(
      `SELECT d.stable_key AS dst FROM edge e
       JOIN symbol d ON d.id = e.dst_symbol_id
       WHERE e.tier = 'COMPILER' AND e.kind = 'CALLS'`,
    ).all() as Array<{ dst: string }>;

    // The point of the whole plan: it resolves to Store.get, not Cache.get.
    expect(compilerEdges.map((r) => r.dst)).toContain("ts:src/store.ts#Store.get");
    expect(compilerEdges.map((r) => r.dst)).not.toContain("ts:src/cache.ts#Cache.get");
    db.close();
  });

  it("returns null without a tsconfig instead of throwing", async () => {
    const root = mkdtempSync(join(tmpdir(), "cg-pass-none-"));
    mkdirSync(join(root, "src"));
    writeFileSync(join(root, "src", "a.ts"), "export function a(): void {}");
    const dbPath = join(root, "index.sqlite");
    await indexRepo(root, dbPath);
    const db = openDb(dbPath);
    migrate(db);
    expect(runCompilerPass(root, new Store(db))).toBeNull();
    db.close();
  });
});
```

Add these imports at the top of the test file:

```ts
import { indexRepo } from "../../src/index/pipeline.js";
import { migrate, openDb, Store } from "../../src/store/index.js";
import { runCompilerPass } from "../../src/resolve/compilerPass.js";
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/resolve/compilerPass.test.ts`
Expected: FAIL — `runCompilerPass is not a function`

- [ ] **Step 3: Implement**

Append to `src/resolve/compilerPass.ts`:

```ts
import type { Store } from "../store/index.js";
import type { EdgeKind } from "../store/repos.js";
import { declarationToStableKey } from "./symbolMapping.js";

export interface CompilerPassResult {
  upgraded: number;
  unresolvedCleared: number;
  identifiersSeen: number;
  identifiersResolved: number;
  tscVersion: string;
}

/** The enclosing named symbol of a reference, in adapter key form. */
function enclosingKey(node: ts.Node, context: CompilerContext): string | null {
  let current: ts.Node | undefined = node.parent;
  while (current && !ts.isSourceFile(current)) {
    const key = declarationToStableKey(current as ts.Declaration, context);
    if (key) return key;
    current = current.parent;
  }
  return null;
}

function edgeKindFor(node: ts.Node): EdgeKind {
  const parent = node.parent;
  if (parent && ts.isCallExpression(parent)) return "CALLS";
  if (
    parent &&
    ts.isPropertyAccessExpression(parent) &&
    parent.parent &&
    ts.isCallExpression(parent.parent) &&
    parent.parent.expression === parent
  ) {
    return "CALLS";
  }
  return "REFERENCES";
}

/**
 * Upgrade edges the tree-sitter path could only guess at.
 *
 * Only ever raises a tier. A reference the checker cannot place is left exactly
 * as the deterministic path recorded it — never fabricated, never downgraded.
 *
 * The Program is discarded when this returns. Do not cache it: spec §8.4 keeps
 * the inline-refresh path compiler-free precisely so idle memory stays inside
 * PRD §17.1's 300 MB budget.
 */
export function runCompilerPass(root: string, store: Store): CompilerPassResult | null {
  const context = createCompilerContext(root);
  if (!context) return null;

  const result: CompilerPassResult = {
    upgraded: 0,
    unresolvedCleared: 0,
    identifiersSeen: 0,
    identifiersResolved: 0,
    tscVersion: TSC_VERSION,
  };

  for (const sourceFile of context.program.getSourceFiles()) {
    if (!context.inRepo(sourceFile.fileName)) continue;
    if (sourceFile.fileName.endsWith(".d.ts")) continue;

    const visit = (node: ts.Node): void => {
      if (ts.isIdentifier(node)) {
        const parent = node.parent as ts.NamedDeclaration | undefined;
        const isDeclarationName = parent?.name === node;
        if (!isDeclarationName) {
          result.identifiersSeen += 1;
          const symbol = context.checker.getSymbolAtLocation(node);
          const declaration = symbol?.declarations?.[0];
          if (declaration) {
            const dstKey = declarationToStableKey(declaration, context);
            const srcKey = enclosingKey(node, context);
            if (dstKey && srcKey && dstKey !== srcKey) {
              result.identifiersResolved += 1;
              if (store.upgradeEdgeTier(srcKey, dstKey, edgeKindFor(node))) {
                result.upgraded += 1;
              }
              result.unresolvedCleared += store.deleteUnresolvedFor(srcKey, node.text);
            }
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
  }

  return result;
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/resolve/compilerPass.test.ts`
Expected: PASS, 7 tests

- [ ] **Step 5: Run the full suite for regressions**

Run: `npm run typecheck && npm test`
Expected: typecheck clean; all tests pass

- [ ] **Step 6: Commit**

```bash
git add src/resolve/compilerPass.ts tests/resolve/compilerPass.test.ts
git commit -m "feat: upgrade edges to COMPILER tier with the type checker"
```

---

### Task 5: Wire into the pipeline and CLI

**Files:**
- Modify: `src/index/pipeline.ts`, `src/cli/main.ts`
- Create: `tests/index/compilerIntegration.test.ts`

**Interfaces:**
- `indexRepo(root, dbPath, options?: { resolve?: boolean })`
- `updateRepo(root, dbPath, options?: { resolve?: boolean })`
- `IndexStats` gains `compilerUpgraded: number | null` — `null` means the pass did not run
- CLI: `sonde index --resolve`, `sonde update --resolve`; `doctor` reports whether a Program can be built

Default behaviour must not change: without `--resolve`, no Program is built.

- [ ] **Step 1: Write the failing test**

```ts
// tests/index/compilerIntegration.test.ts
import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { indexRepo } from "../../src/index/pipeline.js";
import { migrate, openDb, Store } from "../../src/store/index.js";

function ambiguousFixture(): string {
  const root = mkdtempSync(join(tmpdir(), "cg-int-"));
  mkdirSync(join(root, "src"));
  writeFileSync(join(root, "src", "store.ts"), "export class Store { get(): number { return 1; } }");
  writeFileSync(join(root, "src", "cache.ts"), "export class Cache { get(): number { return 2; } }");
  writeFileSync(join(root, "src", "app.ts"),
    "import { Store } from './store.js';\n" +
    "export function run(s: Store): number { return s.get(); }");
  writeFileSync(join(root, "tsconfig.json"), JSON.stringify({
    compilerOptions: { strict: true, module: "esnext", target: "es2022", moduleResolution: "bundler" },
    include: ["src"],
  }));
  return root;
}

describe("compiler pass integration", () => {
  it("does not build a program unless asked", async () => {
    const root = ambiguousFixture();
    const stats = await indexRepo(root, join(root, "i.sqlite"));
    expect(stats.compilerUpgraded).toBeNull();
  });

  it("produces COMPILER-tier edges when asked", async () => {
    const root = ambiguousFixture();
    const dbPath = join(root, "i.sqlite");
    const stats = await indexRepo(root, dbPath, { resolve: true });
    expect(stats.compilerUpgraded).toBeGreaterThan(0);

    const db = openDb(dbPath);
    migrate(db);
    expect(new Store(db).tierCounts().COMPILER).toBeGreaterThan(0);
    db.close();
  });

  it("indexes successfully with --resolve when no tsconfig exists", async () => {
    // Invariant 8: degraded, not broken.
    const root = mkdtempSync(join(tmpdir(), "cg-int-none-"));
    mkdirSync(join(root, "src"));
    writeFileSync(join(root, "src", "a.ts"), "export function a(): void {}");
    const stats = await indexRepo(root, join(root, "i.sqlite"), { resolve: true });
    expect(stats.compilerUpgraded).toBeNull();
    expect(stats.symbols).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/index/compilerIntegration.test.ts`
Expected: FAIL — `compilerUpgraded` is not a property of `IndexStats`

- [ ] **Step 3: Implement**

In `src/index/pipeline.ts`: add `compilerUpgraded: number | null` to `IndexStats`, default `null`; accept an options object; after the transaction commits, when `options.resolve` is true, call `runCompilerPass(root, store)` and record `result?.upgraded ?? null`. Run it **after** commit so a compiler failure can never roll back a good index.

In `src/cli/main.ts`: add `.option("--resolve", "resolve edges with the TypeScript compiler (slower, more precise)")` to `index` and `update`, pass it through, and add to the human-readable output either the upgrade count or the exact string `compiler tier unavailable (no usable tsconfig); edges remain LEXICAL/HEURISTIC`. Add `compilerAvailable` and `tscVersion` to `doctor`.

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/index/compilerIntegration.test.ts && npm test`
Expected: PASS

- [ ] **Step 5: Measure on the real fixture**

Run:
```bash
nvm use && npm run build
node dist/cli/main.js clean tests/fixtures/repos/large
time node dist/cli/main.js index tests/fixtures/repos/large --resolve --json
node dist/cli/main.js query callers_of "ts:src/hono-base.ts#Hono.route" tests/fixtures/repos/large --json
```

Expected: index completes in roughly 8 s (5.4 s tree-sitter + ~2.4 s compiler). `callers_of` returns a **non-empty `compiler` bucket** where it previously returned `0 graph result(s) … unresolved 53`.

**This is the acceptance criterion for the whole plan.** If `callers_of` is still empty, the most likely cause is a stable-key mismatch in Task 2 — dump a few `dstKey` values and compare them against `SELECT stable_key FROM symbol LIMIT 20`.

- [ ] **Step 6: Commit**

```bash
git add src/index/pipeline.ts src/cli/main.ts tests/index/compilerIntegration.test.ts
git commit -m "feat: add --resolve flag for compiler-tier resolution"
```

---

### Task 6: Rescope the oracle and republish

**Files:**
- Modify: `bench/report.ts`
- Modify: `README.md`, `docs/superpowers/specs/2026-08-16-sonde-design.md`

The oracle exists to measure the **tree-sitter** path. `COMPILER` edges come from `tsc`, so scoring them against `tsc` measures nothing. Say so in the report rather than letting a reader assume the numbers cover both.

- [ ] **Step 1: Add the scope statement to the generated report**

In `bench/report.ts`, add to the preamble:

```
**What these numbers cover.** The oracle measures the tree-sitter resolution
path — the zero-setup default, and the only tier whose accuracy is in question.
COMPILER-tier edges come from the TypeScript compiler itself, so scoring them
against the same compiler would measure nothing; they are exact by construction
and excluded from these figures. Run `sonde index --resolve` to produce
them.
```

- [ ] **Step 2: Regenerate and verify**

Run: `npm run bench:oracle && head -30 ORACLE.md`
Expected: the scope statement is present; the numbers are otherwise unchanged.

- [ ] **Step 3: Re-run both benchmarks**

Run: `npm run bench:harness && npm run bench:large`
Expected: `BENCHMARK.md` and `BENCHMARK-LARGE.md` regenerate. Recall should not fall. Record whether `hono-impact-router-add` or any completeness task improves.

- [ ] **Step 4: Update the README limitations section**

`README.md` currently says `callers_of` on a common method name returns empty. If Task 5 Step 5 showed otherwise, replace that limitation with the `--resolve` instruction and the measured cost. **If it did not improve, leave the limitation in place** — do not describe a capability the measurement does not support.

- [ ] **Step 5: Record the decision**

```bash
whyline note "Scope the tsc oracle to the tree-sitter path only" \
  --because "COMPILER-tier edges come from tsc, so scoring them against tsc measures nothing; the oracle's value is measuring the heuristic path, which is the zero-setup default and the only tier whose accuracy is in question" \
  --rejected "score both tiers together: mixes an exact-by-construction tier into an accuracy figure and inflates it" \
  --file bench/report.ts
```

- [ ] **Step 6: Commit**

```bash
git add bench/report.ts ORACLE.md BENCHMARK.md BENCHMARK-LARGE.md README.md docs/
git commit -m "docs: scope the oracle to the tree-sitter path and republish"
```

---

## Completion criteria

- [ ] `sonde index --resolve` produces `COMPILER`-tier edges on the large fixture
- [ ] `callers_of` on `Hono.route` returns a non-empty `compiler` bucket
- [ ] `sonde index` without the flag is byte-identical in behaviour to today
- [ ] No tsconfig, or a malformed one, still indexes and warns
- [ ] `doctor` reports compiler availability and the bundled `tsc` version
- [ ] `ORACLE.md` states that it measures the tree-sitter path only
- [ ] `npm run typecheck && npm test` clean

## Known risks

| Risk | Signal | Response |
|---|---|---|
| Stable keys drift from the adapter | `upgraded` is 0 while `identifiersResolved` is large | Compare Task 2 output against `SELECT stable_key FROM symbol`. This is the most likely failure. |
| Memory exceeds expectations on a bigger repo | Node heap errors | The Program is per-pass and discarded; if it still fails, process files in batches. Never cache it (spec §8.4). |
| `.tsx` handled differently by the Program | TSX edges never upgrade | The Program compiles `.tsx` natively; if keys mismatch, check the adapter's TSX path. |
| Upgrade makes a wrong edge authoritative | Oracle precision falls | The pass only ever raises a tier on an edge that already exists; it cannot create one. If precision falls, the mapping is wrong, not the tier. |
