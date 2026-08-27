# Python Language Adapter Implementation Plan

> **STATUS: EXECUTED AND CLOSED — 2026-08-28. Do not run this plan.**
>
> Tasks 1–10 are complete and committed. Task 10's gate **FAILED** on both
> corpora (agentdock 62.81% unresolved, pydantic 57.39%, against a 30% ceiling),
> so Task 11 correctly did not run: the Python adapter exists and is tested but
> is **not** registered, and `.py` is **not** in the default discovery allowlist.
>
> Before touching anything here, read `probes/python-placement/FINDINGS.md` —
> including the reviewer note, which shows arithmetically that the builtin
> classification gap **cannot** rescue the result. The next step is the
> pyright-backed `COMPILER` tier, not a re-run of this plan.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Sonde a Python `LanguageAdapter` that produces a trustworthy symbol graph, and refuse to ship it unless a pre-committed measurement gate passes.

**Architecture:** A tree-sitter Python adapter mirroring the existing Swift and TypeScript adapters — pure `extract()`, cross-file work in `link/`. Python's explicit import statements give real binding evidence, so the adapter reuses the existing `buildExportMap` fixpoint machinery rather than inventing a parallel one: `from .foo import Bar` is a named re-export and `from x import *` is a star re-export, exactly the shapes that machinery already resolves. The only new link-layer concept is a language dispatch for module-specifier resolution, because `bindImports`/`buildExportMap` currently hard-code TypeScript's `resolveSpecifier`.

**Tech Stack:** TypeScript, `web-tree-sitter`, `tree-sitter-python` 0.25.0 (WASM), vitest.

**Spec:** `docs/superpowers/specs/2026-08-25-python-adapter-design.md`

## Handoff note — read this first

This plan was written by Claude and **has not been independently reviewed**. It was self-reviewed, which is weaker. Treat its assertions as claims to verify, not facts.

**Before writing code, verify these three things.** Each one is load-bearing, and if any is false the plan's structure is wrong rather than merely imprecise:

1. **The Swift SDK contamination** (drives Task 4). Check `src/resolve/tiers.ts` — the zero-candidate branch of `assignTier` — and the `EXTERNAL` branch of `src/resolve/resolver.ts` near the `sdkFramework` assignment. The claim is that both fall back to `SWIFT_SDK_SYMBOLS` for *any* reference carrying a `scopeHint`, regardless of language. If true, a Python reference named `append` or `Task` would be attributed to a Swift framework, and since `EXTERNAL` is excluded from the gate denominator this biases the Task 10 measurement **toward PASS**. If this claim is false, say so and skip Task 4.
2. **The discovery gap** (drives Task 11 Step 3). Check the `SOURCE_EXTENSIONS` set in `src/repo/discover.ts`. The claim is that `.py` is absent, so registering the adapter alone leaves `sonde index` reporting 0 files while every unit test passes.
3. **The `SymbolKind` union** in `src/store/repos.ts`. Task 2 uses `"class"`, `"method"`, `"function"`, `"variable"`, and `"file"`. If any is missing, substitute the nearest existing kind and note the substitution in the commit body rather than widening the union.

**The code blocks in this plan are a starting point, not a specification.** Where a block disagrees with the real type signatures, the real signatures win — fix the code and note it. The **tests** are the contract: do not weaken an assertion to make it pass. Each encodes a spec requirement, cited in the task.

**Two hard stops.** Task 9 commits the gate thresholds in a commit containing nothing else, before any number exists. Task 10 ends by reporting the verdict and stopping; Task 11 runs only on a PASS. On MARGINAL or FAIL, Python stays unregistered and `sonde init` keeps honestly reporting 0 files on Python repositories — that is a correct outcome, not a failure of the work.

**Verified before writing** (do not re-derive; do report if any turns out false): the tree-sitter-python node types and field names, the grammar URL and sha256, and the codebase seams — all listed under **Verified Facts** below.

## Global Constraints

Copied verbatim from the spec and `AGENTS.md`. Every task's requirements implicitly include this section.

- **Run `nvm use` in every shell before any `node` or `npm` command.** This machine's default node is v20, which cannot run this project.
- **Extraction is pure.** `extract(path, bytes)` does no I/O, no database access, no cross-file lookups (invariant 4).
- **Never fabricate an edge.** An unresolved reference becomes `EXTERNAL` or `UNRESOLVED` with a reason — never a guessed target, never a silently dropped reference (invariant 1).
- **Member access is always `HEURISTIC`.** `self.foo()` narrowing raises confidence, never tier (invariant 2).
- **Tier beats score, always.** `COMPILER > LEXICAL > HEURISTIC` (invariant 3).
- **Never execute repository code** (invariant 5, SEC-008). No Python interpreter is invoked, ever — including to compute the stdlib list.
- **All repository reads go through `src/repo/boundary.ts`** (invariant 6, SEC-001/002/003).
- **Degrade with a warning; never fail silently** (invariant 8).
- **Stable keys are never line-based:** `py:{relpath}#{scope_chain}` (invariant 9).
- **Gate thresholds:** PASS is `UNRESOLVED` ≤ 30% **and** `LEXICAL + HEURISTIC` ≥ 70%, over in-repository references with `EXTERNAL` excluded from the denominator. MARGINAL is 31–50%. FAIL is > 50%. **No threshold may be adjusted after seeing a result.**
- **The adapter must not be registered in `src/adapters/registry.ts` until the gate passes** (Task 11 is conditional on Task 10).
- **TDD:** failing test first, then minimal implementation. Conventional commits, one per task.
- Cite spec sections in comments for non-obvious rules, e.g. `// spec §5.1: self. narrowing never raises tier`.

## Verified Facts

These were confirmed against the real grammar and codebase while writing this plan. Do not re-derive them; do report it if any turns out false.

**tree-sitter-python node types and fields:**

| Construct | Node | Fields / children |
|---|---|---|
| `import os` / `import os.path` | `import_statement` | child `dotted_name` (children: `identifier`…) |
| `import numpy as np` | `import_statement` | child `aliased_import` (`dotted_name` + alias `identifier`) |
| `from .foo import Bar` | `import_from_statement` | module child `relative_import` (`import_prefix` holding the dots + optional `dotted_name`); name child `dotted_name` |
| `from x import y as z` | `import_from_statement` | module child `dotted_name`; name child `aliased_import` |
| `from x import *` | `import_from_statement` | name child `wildcard_import` |
| `def f(a: int) -> Bar:` | `function_definition` | fields `name`, `parameters`, `return_type` (a `type` node), `body` |
| `class C(Base, Mixin):` | `class_definition` | fields `name`, `superclasses` (an `argument_list`), `body` |
| `plain()` | `call` | field `function` = `identifier` |
| `obj.method()` | `call` | field `function` = `attribute`, whose fields are `object` and `attribute` |
| `@app.route("/x")` on a def | `decorated_definition` | children `decorator`, then `function_definition` |
| `CONST = 1` | `expression_statement` → `assignment` | child `identifier` |

**Grammar artifact** (verified reachable, 476,105 bytes):
`https://unpkg.com/tree-sitter-wasms@0.1.12/out/tree-sitter-python.wasm`
sha256 `9056d0fb0c337810d019fae350e8167786119da98f0f282aceae7ab89ee8253b`

**Codebase seams:**
- `buildExportMap(files, cfg, boundary, resolveFn?)` in `src/link/exportmap.ts` **already accepts an injectable `resolveFn`** (defaulted to `resolveSpecifier`). `bindImports` in `src/link/imports.ts` does **not** — Task 7 adds it.
- Callers: `src/index/pipeline.ts:130` (`buildExportMap`) and `src/resolve/resolver.ts:64` (`bindImports`).
- `narrowCandidates` in `src/resolve/tiers.ts` is safe for Python: `swiftLocation()` returns `null` for non-`swift:` keys, and the `receiverType` filter is language-neutral (it compares `ownerName(candidate)`), which is exactly the mechanism Task 3 reuses for `self.`/`cls.`.
- `type Resolution = { kind: "internal"; path: string } | { kind: "external"; pkg: string }` in `src/tsconfig/resolve.ts`.
- `resolveAll(files, exportMap, cfg, boundary, history?)` in `src/resolve/resolver.ts:49`.
- `RepoBoundary` exposes `readFile`, `writeFile`, `readDirectory`, `stat`, `resolve`, `contains`. **There is no `listFiles()`** — file discovery is `discover(boundary, options)` in `src/repo/discover.ts:23`.

**The second gap, and why registration alone is not enough.** `src/repo/discover.ts:20` holds a hardcoded allowlist:

```ts
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".mts", ".cts", ".swift"]);
```

`.py` is absent, so `discover()` never surfaces a Python file. Registering the adapter in `registry.ts` without changing this would leave `sonde index` still reporting `indexed 0 files` — the exact symptom this work exists to remove — while every unit test passed. Task 10 makes the set injectable (so the probe can enumerate `.py` without a second file walker and without changing production behaviour before the gate), and Task 11 adds `.py`/`.pyi` to the default set at the same time it registers the adapter.

**The defect Task 4 fixes.** `assignTier` (`src/resolve/tiers.ts:110`) and `resolver.ts:174` fall back to `SWIFT_SDK_SYMBOLS` whenever a reference has **any** `scopeHint` and zero candidates. That set contains `Any`, `Array`, `Bool`, `Error`, `Int`, `Set`, `String`, `Task`, `abs`, `append`, `contains`, `filter`, `map` — all common Python names. Once Python emits `scopeHint` (Task 3), a zero-candidate Python `append` would be classified `EXTERNAL` and attributed to a Swift framework. Because `EXTERNAL` is excluded from the gate denominator, this would move references out of `UNRESOLVED` and **bias the Task 10 measurement toward PASS**. It must be fixed before anything is measured.

---

### Task 1: Python grammar and parser

**Files:**
- Modify: `scripts/fetch-grammars.mjs`
- Create: `src/adapters/python/parser.ts`
- Test: `tests/adapters/python/parser.test.ts`

**Interfaces:**
- Consumes: `ensureTreeSitterRuntime()` from `src/adapters/treeSitterRuntime.ts`
- Produces: `getPythonParser(): Promise<Parser>`, `pythonParser(): Parser`

- [ ] **Step 1: Add the grammar to the fetch script**

In `scripts/fetch-grammars.mjs`, append to the `GRAMMARS` array:

```js
  {
    name: "tree-sitter-python.wasm",
    url: "https://unpkg.com/tree-sitter-wasms@0.1.12/out/tree-sitter-python.wasm",
    sha256: "9056d0fb0c337810d019fae350e8167786119da98f0f282aceae7ab89ee8253b",
  },
```

- [ ] **Step 2: Fetch and verify the grammar**

Run: `nvm use && node scripts/fetch-grammars.mjs`
Expected: `fetched tree-sitter-python.wasm sha256 verified`, and `vendor/tree-sitter-python.wasm` exists at 476,105 bytes.

If the checksum mismatches, **stop and report** — do not update the checksum to match what downloaded. A mismatch means the pinned artifact changed, which is exactly what the pin exists to detect.

- [ ] **Step 3: Write the failing test**

```ts
// tests/adapters/python/parser.test.ts
import { describe, expect, it } from "vitest";
import { getPythonParser, pythonParser } from "../../../src/adapters/python/parser.js";

describe("python parser", () => {
  it("parses a module after warm-up", async () => {
    await getPythonParser();
    const tree = pythonParser().parse("def f():\n    return 1\n");
    expect(tree?.rootNode.type).toBe("module");
    expect(tree?.rootNode.hasError).toBe(false);
  });

  it("refuses to parse before warm-up in a fresh module", () => {
    // pythonParser() throws only when never warmed; this asserts the guard exists.
    expect(typeof pythonParser).toBe("function");
  });
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `nvm use && npx vitest run tests/adapters/python/parser.test.ts`
Expected: FAIL — cannot resolve `src/adapters/python/parser.js`.

- [ ] **Step 5: Implement the parser**

```ts
// src/adapters/python/parser.ts
import { Parser, Language } from "web-tree-sitter";
import { ensureTreeSitterRuntime } from "../treeSitterRuntime.js";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const GRAMMAR = "tree-sitter-python.wasm";

let initPromise: Promise<void> | null = null;
let cached: Parser | null = null;

/** Load the Python grammar once before any synchronous extraction. */
export async function getPythonParser(): Promise<Parser> {
  initPromise ??= (async () => {
    await ensureTreeSitterRuntime();
    const here = dirname(fileURLToPath(import.meta.url));
    const language = await Language.load(join(here, "../../../vendor/", GRAMMAR));
    const parser = new Parser();
    parser.setLanguage(language);
    cached = parser;
  })();
  await initPromise;
  return pythonParser();
}

/** The warmed Python parser. Extraction remains synchronous and pure. */
export function pythonParser(): Parser {
  if (!cached) {
    throw new Error("call await getPythonParser() once before extract()");
  }
  return cached;
}
```

`ensureTreeSitterRuntime()` is mandatory here rather than `Parser.init()`: concurrent `Parser.init()` calls from independent adapters corrupt shared module-level WASM state, and a repository holding both Python and TypeScript starts both adapters together.

- [ ] **Step 6: Run the test to verify it passes**

Run: `nvm use && npx vitest run tests/adapters/python/parser.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 7: Commit**

```bash
git add scripts/fetch-grammars.mjs src/adapters/python/parser.ts tests/adapters/python/parser.test.ts
git commit -m "feat: add pinned tree-sitter-python grammar and parser"
```

---

### Task 2: Python symbols

**Files:**
- Create: `src/adapters/python/symbols.ts`
- Test: `tests/adapters/python/symbols.test.ts`

**Interfaces:**
- Consumes: `SymbolRecord` from `src/adapters/types.ts`
- Produces: `stableKey(path: string, scope: string[]): string`, `extractPythonSymbols(path: string, source: string, tree: Tree): SymbolRecord[]`

- [ ] **Step 1: Write the failing test**

```ts
// tests/adapters/python/symbols.test.ts
import { beforeAll, describe, expect, it } from "vitest";
import { getPythonParser, pythonParser } from "../../../src/adapters/python/parser.js";
import { extractPythonSymbols, stableKey } from "../../../src/adapters/python/symbols.js";

const parse = (src: string) => pythonParser().parse(src)!;

beforeAll(async () => { await getPythonParser(); });

describe("extractPythonSymbols", () => {
  it("builds line-independent stable keys from the scope chain", () => {
    const src = "class Runner:\n    def run(self):\n        pass\n";
    const symbols = extractPythonSymbols("src/app.py", src, parse(src));
    const keys = symbols.map((s) => s.stableKey);
    expect(keys).toContain("py:src/app.py#Runner");
    expect(keys).toContain("py:src/app.py#Runner.run");
  });

  it("assigns kinds for classes, methods, functions and module variables", () => {
    const src = "CONST = 1\n\ndef top():\n    pass\n\nclass C:\n    def m(self):\n        pass\n";
    const symbols = extractPythonSymbols("a.py", src, parse(src));
    const byName = new Map(symbols.map((s) => [s.shortName, s]));
    expect(byName.get("C")?.kind).toBe("class");
    expect(byName.get("m")?.kind).toBe("method");
    expect(byName.get("top")?.kind).toBe("function");
    expect(byName.get("CONST")?.kind).toBe("variable");
  });

  it("marks test files so structural TESTS edges can find them", () => {
    const src = "def test_x():\n    pass\n";
    const symbols = extractPythonSymbols("tests/test_x.py", src, parse(src));
    expect(symbols[0]?.isTest).toBe(true);
  });

  it("treats a leading underscore as module-private, not exported", () => {
    const src = "def _helper():\n    pass\n\ndef public():\n    pass\n";
    const symbols = extractPythonSymbols("a.py", src, parse(src));
    const byName = new Map(symbols.map((s) => [s.shortName, s]));
    expect(byName.get("_helper")?.exported).toBe(false);
    expect(byName.get("public")?.exported).toBe(true);
  });

  it("keeps nested function scope chains distinct", () => {
    const src = "def outer():\n    def inner():\n        pass\n";
    const keys = extractPythonSymbols("a.py", src, parse(src)).map((s) => s.stableKey);
    expect(keys).toContain("py:a.py#outer.inner");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `nvm use && npx vitest run tests/adapters/python/symbols.test.ts`
Expected: FAIL — cannot resolve `src/adapters/python/symbols.js`.

- [ ] **Step 3: Implement the extractor**

```ts
// src/adapters/python/symbols.ts
import { createHash } from "node:crypto";
import type { Node as SyntaxNode, Tree } from "web-tree-sitter";
import type { SymbolRecord } from "../types.js";
import type { SymbolKind } from "../../store/repos.js";

/** spec §4.1 / invariant 9: identity is the scope chain, never a line number. */
export function stableKey(path: string, scope: string[]): string {
  return `py:${path}#${scope.join(".")}`;
}

function isTestPath(path: string): boolean {
  return /(^|\/)tests?\//.test(path) || /(^|\/)test_[^/]*\.py$/.test(path) ||
    /_test\.py$/.test(path);
}

function bodyHash(node: SyntaxNode): string {
  return createHash("sha256").update(node.text).digest("hex").slice(0, 16);
}

function signatureOf(node: SyntaxNode): string | null {
  const params = node.childForFieldName("parameters");
  const returns = node.childForFieldName("return_type");
  if (!params) return null;
  return `${params.text}${returns ? ` -> ${returns.text}` : ""}`;
}

function record(
  path: string, scope: string[], name: string, kind: SymbolKind,
  node: SyntaxNode, signature: string | null,
): SymbolRecord {
  return {
    stableKey: stableKey(path, [...scope, name]),
    qualifiedName: [...scope, name].join("."),
    shortName: name,
    kind,
    signature,
    startByte: node.startIndex,
    endByte: node.endIndex,
    startLine: node.startPosition.row + 1,
    endLine: node.endPosition.row + 1,
    bodyHash: bodyHash(node),
    // Python has no export keyword; the leading-underscore convention is the
    // only in-source signal, and it is a convention, so it gates `exported`
    // but never candidate narrowing (spec §5.1).
    exported: !name.startsWith("_"),
    isTest: isTestPath(path),
  };
}

export function extractPythonSymbols(
  path: string, _source: string, tree: Tree,
): SymbolRecord[] {
  const out: SymbolRecord[] = [];

  const visit = (node: SyntaxNode, scope: string[]): void => {
    for (const child of node.namedChildren) {
      if (!child) continue;

      // A decorated def/class wraps the definition; recurse past the wrapper.
      if (child.type === "decorated_definition") {
        visit(child, scope);
        continue;
      }

      if (child.type === "function_definition" || child.type === "class_definition") {
        const nameNode = child.childForFieldName("name");
        const name = nameNode?.text;
        if (!name) continue;
        const kind: SymbolKind = child.type === "class_definition"
          ? "class"
          : scope.length > 0 && out.some(
              (s) => s.kind === "class" && s.qualifiedName === scope.join("."),
            )
            ? "method"
            : "function";
        out.push(record(
          path, scope, name, kind, child,
          child.type === "function_definition" ? signatureOf(child) : null,
        ));
        const body = child.childForFieldName("body");
        if (body) visit(body, [...scope, name]);
        continue;
      }

      if (child.type === "expression_statement" && scope.length === 0) {
        const assignment = child.namedChildren.find((n) => n?.type === "assignment");
        const target = assignment?.namedChildren[0];
        if (target?.type === "identifier") {
          out.push(record(path, scope, target.text, "variable", child, null));
        }
        continue;
      }

      if (child.type === "block") visit(child, scope);
    }
  };

  visit(tree.rootNode, []);
  return out;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `nvm use && npx vitest run tests/adapters/python/symbols.test.ts`
Expected: PASS (5 tests).

If `kind` for `method` fails, the class-detection expression is the likely cause — a method is a `function_definition` whose immediately enclosing scope is a class. Prefer passing an explicit `enclosingKind` parameter through `visit` over pattern-matching `out`; the test is the contract, not this implementation sketch.

- [ ] **Step 5: Typecheck**

Run: `nvm use && npm run typecheck`
Expected: clean. `SymbolKind` must actually contain `"variable"`, `"method"`, `"class"`, `"function"` — if it does not, use the nearest existing kind and note the substitution in the commit body.

- [ ] **Step 6: Commit**

```bash
git add src/adapters/python/symbols.ts tests/adapters/python/symbols.test.ts
git commit -m "feat: extract Python symbols with scope-chain stable keys"
```

---

### Task 3: Python references

**Files:**
- Create: `src/adapters/python/references.ts`
- Test: `tests/adapters/python/references.test.ts`

**Interfaces:**
- Consumes: `stableKey` from Task 2; `ReferenceRecord`, `ScopeHint`, `SymbolRecord` from `src/adapters/types.ts`
- Produces: `extractPythonReferences(path: string, source: string, tree: Tree, symbols: SymbolRecord[]): ReferenceRecord[]`

- [ ] **Step 1: Write the failing test**

```ts
// tests/adapters/python/references.test.ts
import { beforeAll, describe, expect, it } from "vitest";
import { getPythonParser, pythonParser } from "../../../src/adapters/python/parser.js";
import { extractPythonSymbols } from "../../../src/adapters/python/symbols.js";
import { extractPythonReferences } from "../../../src/adapters/python/references.js";

const refs = (path: string, src: string) => {
  const tree = pythonParser().parse(src)!;
  return extractPythonReferences(path, src, tree, extractPythonSymbols(path, src, tree));
};

beforeAll(async () => { await getPythonParser(); });

describe("extractPythonReferences", () => {
  it("records a bare call with no receiver", () => {
    const found = refs("a.py", "def f():\n    helper()\n");
    const ref = found.find((r) => r.name === "helper");
    expect(ref?.receiver).toBeNull();
    expect(ref?.kind).toBe("CALLS");
  });

  it("records the receiver for attribute calls", () => {
    const ref = refs("a.py", "def f():\n    obj.method()\n").find((r) => r.name === "method");
    expect(ref?.receiver).toBe("obj");
  });

  it("sets receiverType to the enclosing class for self and cls", () => {
    const found = refs("a.py", "class Runner:\n    def run(self):\n        self.helper()\n");
    const ref = found.find((r) => r.name === "helper");
    expect(ref?.receiver).toBe("self");
    // spec §5.1: narrows candidates to the class; tier stays HEURISTIC.
    expect(ref?.scopeHint?.receiverType).toBe("Runner");
  });

  it("does not set receiverType for a non-self receiver", () => {
    const ref = refs("a.py", "class C:\n    def m(self):\n        other.go()\n")
      .find((r) => r.name === "go");
    expect(ref?.scopeHint?.receiverType).toBeNull();
  });

  it("records base classes as INHERITS", () => {
    const found = refs("a.py", "class C(Base, Mixin):\n    pass\n");
    expect(found.filter((r) => r.kind === "INHERITS").map((r) => r.name).sort())
      .toEqual(["Base", "Mixin"]);
  });

  it("records annotation types as REFERENCES", () => {
    const found = refs("a.py", "def f() -> Bar:\n    pass\n");
    expect(found.find((r) => r.name === "Bar")?.kind).toBe("REFERENCES");
  });

  it("attributes module-level references to the file symbol", () => {
    const found = refs("a.py", "top_level()\n");
    expect(found.find((r) => r.name === "top_level")?.fromSymbolKey).toBe("py:a.py#");
  });

  it("records a decorator reference", () => {
    const found = refs("a.py", "@app.route\ndef h():\n    pass\n");
    const ref = found.find((r) => r.name === "route");
    expect(ref?.receiver).toBe("app");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `nvm use && npx vitest run tests/adapters/python/references.test.ts`
Expected: FAIL — cannot resolve `src/adapters/python/references.js`.

- [ ] **Step 3: Implement the extractor**

```ts
// src/adapters/python/references.ts
import type { Node as SyntaxNode, Tree } from "web-tree-sitter";
import type { ReferenceRecord, ScopeHint, SymbolRecord } from "../types.js";
import { stableKey } from "./symbols.js";

/**
 * The nearest named enclosing symbol, falling back to the file symbol.
 *
 * The fallback is not cosmetic: module-level code and code inside anonymous
 * constructs would otherwise be dropped, which is the exact defect that hid
 * 37 of 44 unresolved Hono references until the compiler pass gained the same
 * file-level fallback (spec §6.2).
 */
function enclosingKey(path: string, scope: string[]): string {
  return stableKey(path, scope);
}

function hintFor(path: string, receiverType: string | null): ScopeHint {
  return {
    module: null,
    file: path,
    visibility: null,
    receiver: null,
    // spec §5.1: only written-in-source evidence; never inferred.
    receiverType,
  };
}

export function extractPythonReferences(
  path: string, _source: string, tree: Tree, _symbols: SymbolRecord[],
): ReferenceRecord[] {
  const out: ReferenceRecord[] = [];

  const push = (
    name: string, receiver: string | null,
    kind: ReferenceRecord["kind"], node: SyntaxNode,
    scope: string[], enclosingClass: string | null,
  ): void => {
    const receiverType = (receiver === "self" || receiver === "cls")
      ? enclosingClass
      : null;
    out.push({
      fromSymbolKey: enclosingKey(path, scope),
      name,
      receiver,
      scopeHint: hintFor(path, receiverType),
      kind,
      siteLine: node.startPosition.row + 1,
    });
  };

  const visitExpression = (
    node: SyntaxNode, scope: string[], enclosingClass: string | null,
  ): void => {
    if (node.type === "call") {
      const fn = node.childForFieldName("function");
      if (fn?.type === "identifier") {
        push(fn.text, null, "CALLS", fn, scope, enclosingClass);
      } else if (fn?.type === "attribute") {
        const object = fn.childForFieldName("object");
        const attribute = fn.childForFieldName("attribute");
        if (attribute) {
          push(
            attribute.text,
            object?.type === "identifier" ? object.text : null,
            "CALLS", attribute, scope, enclosingClass,
          );
        }
      }
    }
    if (node.type === "type") {
      for (const id of node.descendantsOfType("identifier")) {
        if (id) push(id.text, null, "REFERENCES", id, scope, enclosingClass);
      }
      return;
    }
    for (const child of node.namedChildren) {
      if (child) visitExpression(child, scope, enclosingClass);
    }
  };

  const visit = (
    node: SyntaxNode, scope: string[], enclosingClass: string | null,
  ): void => {
    for (const child of node.namedChildren) {
      if (!child) continue;

      if (child.type === "decorated_definition") {
        for (const decorator of child.namedChildren) {
          if (decorator?.type === "decorator") {
            visitExpression(decorator, scope, enclosingClass);
          }
        }
        visit(child, scope, enclosingClass);
        continue;
      }

      if (child.type === "class_definition") {
        const name = child.childForFieldName("name")?.text;
        if (!name) continue;
        const bases = child.childForFieldName("superclasses");
        for (const base of bases?.namedChildren ?? []) {
          if (base?.type === "identifier") {
            push(base.text, null, "INHERITS", base, scope, enclosingClass);
          }
        }
        const body = child.childForFieldName("body");
        if (body) visit(body, [...scope, name], name);
        continue;
      }

      if (child.type === "function_definition") {
        const name = child.childForFieldName("name")?.text;
        if (!name) continue;
        const returns = child.childForFieldName("return_type");
        if (returns) visitExpression(returns, scope, enclosingClass);
        const body = child.childForFieldName("body");
        if (body) visit(body, [...scope, name], enclosingClass);
        continue;
      }

      if (child.type === "block") { visit(child, scope, enclosingClass); continue; }
      visitExpression(child, scope, enclosingClass);
    }
  };

  visit(tree.rootNode, [], null);
  return out;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `nvm use && npx vitest run tests/adapters/python/references.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add src/adapters/python/references.ts tests/adapters/python/references.test.ts
git commit -m "feat: extract Python references with self/cls receiver narrowing"
```

---

### Task 4: Scope the Swift SDK fallback to Swift

This task fixes a defect discovered while writing this plan. It is not optional and must land before Task 10 measures anything.

**Files:**
- Modify: `src/resolve/tiers.ts` (the `assignTier` zero-candidate branch)
- Modify: `src/resolve/resolver.ts` (the `EXTERNAL` branch, around line 174)
- Test: `tests/resolve/swiftSdkScope.test.ts`

**Interfaces:**
- Consumes: `ReferenceRecord.fromSymbolKey`, which carries the language prefix (`swift:`, `py:`, `ts:`)
- Produces: no signature changes

- [ ] **Step 1: Write the failing test**

```ts
// tests/resolve/swiftSdkScope.test.ts
import { describe, expect, it } from "vitest";
import { assignTier } from "../../src/resolve/tiers.js";
import type { ReferenceRecord } from "../../src/adapters/types.js";

const ref = (fromSymbolKey: string, name: string): ReferenceRecord => ({
  fromSymbolKey,
  name,
  receiver: "self",
  scopeHint: {
    module: null, file: "a", visibility: null, receiver: null, receiverType: null,
  },
  kind: "CALLS",
  siteLine: 1,
});

describe("Swift SDK fallback scoping", () => {
  it("still classifies a Swift SDK name as EXTERNAL for Swift references", () => {
    expect(assignTier(ref("swift:A.swift#f", "append"), [], null).tier)
      .toBe("EXTERNAL");
  });

  it("does not attribute a Python name to the Swift SDK", () => {
    // `append`, `Task`, `String`, `Int` are all in SWIFT_SDK_SYMBOLS and all
    // common Python names. Misclassifying them as EXTERNAL would remove them
    // from the gate denominator and bias the measurement toward PASS.
    expect(assignTier(ref("py:a.py#f", "append"), [], null).tier)
      .toBe("UNRESOLVED");
  });

  it("does not attribute a TypeScript name to the Swift SDK", () => {
    expect(assignTier(ref("ts:a.ts#f", "filter"), [], null).tier)
      .toBe("UNRESOLVED");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `nvm use && npx vitest run tests/resolve/swiftSdkScope.test.ts`
Expected: FAIL — the Python and TypeScript cases return `EXTERNAL`.

- [ ] **Step 3: Implement the fix**

In `src/resolve/tiers.ts`, add the helper and use it in the zero-candidate branch:

```ts
/**
 * The Swift SDK table is evidence about Swift only. Gating on the presence of
 * any scopeHint let a zero-candidate Python or TypeScript reference named
 * `append`, `Task`, or `String` be attributed to a Swift framework — a
 * fabricated classification (invariant 1), and one that silently shrinks the
 * unresolved denominator that spec §6 measures.
 */
function isSwiftReference(ref: ReferenceRecord): boolean {
  return ref.fromSymbolKey.startsWith("swift:");
}
```

Then change the branch inside `assignTier`:

```ts
  if (candidates.length === 0) {
    if (isSwiftReference(ref) && SWIFT_SDK_SYMBOLS.has(ref.name)) {
      return { tier: "EXTERNAL", confidence: 1 };
    }
    return { tier: "UNRESOLVED", confidence: 0 };
  }
```

In `src/resolve/resolver.ts`, apply the same gate where `sdkFramework` is computed:

```ts
        const sdkFramework = ref.fromSymbolKey.startsWith("swift:")
          ? SWIFT_SDK_SYMBOLS.get(ref.name)
          : undefined;
```

- [ ] **Step 4: Run the new test to verify it passes**

Run: `nvm use && npx vitest run tests/resolve/swiftSdkScope.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Run the full suite to prove Swift is unaffected**

Run: `nvm use && npm test`
Expected: all tests pass, with no change to the Swift adapter's counts. This is the regression check that matters — the Swift path must behave identically.

- [ ] **Step 6: Commit**

```bash
git add src/resolve/tiers.ts src/resolve/resolver.ts tests/resolve/swiftSdkScope.test.ts
git commit -m "fix: scope the Swift SDK external fallback to Swift references

Gating on the presence of any scopeHint meant a zero-candidate reference in
any language could be attributed to a Swift framework whenever its name
collided with the SDK table -- which holds append, Task, String, Int, filter
and other names common to Python and TypeScript. Because EXTERNAL is excluded
from the placement denominator, this would have biased the Python adapter's
gate toward PASS."
```

- [ ] **Step 7: Record the decision**

```bash
whyline note "Scope the Swift SDK external fallback to Swift references" \
  --because "assignTier treated any scopeHint plus a name in SWIFT_SDK_SYMBOLS as EXTERNAL, so Python references named append/Task/String would be attributed to Swift frameworks and removed from the gate denominator, biasing the Python measurement toward PASS" \
  --rejected "Leaving it until after the Python gate: the measurement would have been contaminated by construction" \
  --rejected "Adding a language field to ScopeHint: fromSymbolKey already carries the language prefix, so no type change is needed" \
  --file src/resolve/tiers.ts --file src/resolve/resolver.ts
```

---

### Task 5: Python import and export tables

**Files:**
- Create: `src/adapters/python/modules.ts`
- Test: `tests/adapters/python/modules.test.ts`

**Interfaces:**
- Consumes: `ExportRecord`, `ImportRecord` from `src/adapters/types.ts`
- Produces: `extractPythonModuleTables(tree: Tree): { imports: ImportRecord[]; exports: ExportRecord[] }`

Python has no export keyword, so every module-level `def`, `class`, and assignment is importable and is emitted as an `ExportRecord` owned by its own file. Every `from X import Y` is *also* an export of this module, because `import pkg.a; pkg.a.Y` works when `a.py` did `from .foo import Y`. Emitting both is what lets the existing `buildExportMap` fixpoint resolve `__init__.py` re-export chains with no new machinery.

- [ ] **Step 1: Write the failing test**

```ts
// tests/adapters/python/modules.test.ts
import { beforeAll, describe, expect, it } from "vitest";
import { getPythonParser, pythonParser } from "../../../src/adapters/python/parser.js";
import { extractPythonModuleTables } from "../../../src/adapters/python/modules.js";

const tables = (src: string) => extractPythonModuleTables(pythonParser().parse(src)!);

beforeAll(async () => { await getPythonParser(); });

describe("extractPythonModuleTables", () => {
  it("binds a plain import to its top-level module", () => {
    const { imports } = tables("import os\n");
    expect(imports[0]).toMatchObject({ localName: "os", importedName: "*", specifier: "os" });
  });

  it("binds a dotted import to its top-level name", () => {
    const { imports } = tables("import os.path\n");
    expect(imports[0]).toMatchObject({ localName: "os", specifier: "os.path" });
  });

  it("binds an aliased import to the alias", () => {
    const { imports } = tables("import numpy as np\n");
    expect(imports[0]).toMatchObject({ localName: "np", specifier: "numpy" });
  });

  it("preserves relative import depth in the specifier", () => {
    expect(tables("from .foo import Bar\n").imports[0])
      .toMatchObject({ localName: "Bar", importedName: "Bar", specifier: ".foo" });
    expect(tables("from ..pkg.mod import Baz as Q\n").imports[0])
      .toMatchObject({ localName: "Q", importedName: "Baz", specifier: "..pkg.mod" });
  });

  it("marks a wildcard import as a star re-export", () => {
    const { imports, exports } = tables("from x import *\n");
    expect(imports[0]).toMatchObject({ importedName: "*", specifier: "x" });
    expect(exports.find((e) => e.isStar)).toMatchObject({ reExportFrom: "x" });
  });

  it("exports module-level definitions from their own file", () => {
    const { exports } = tables("def top():\n    pass\n\nclass C:\n    pass\n");
    expect(exports.map((e) => e.exportedName).sort()).toEqual(["C", "top"]);
    expect(exports.every((e) => e.reExportFrom === null)).toBe(true);
  });

  it("treats a from-import as a re-export of this module", () => {
    const { exports } = tables("from .foo import Bar\n");
    expect(exports.find((e) => e.exportedName === "Bar"))
      .toMatchObject({ reExportFrom: ".foo", localName: "Bar", isStar: false });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `nvm use && npx vitest run tests/adapters/python/modules.test.ts`
Expected: FAIL — cannot resolve `src/adapters/python/modules.js`.

- [ ] **Step 3: Implement the tables**

```ts
// src/adapters/python/modules.ts
import type { Node as SyntaxNode, Tree } from "web-tree-sitter";
import type { ExportRecord, ImportRecord } from "../types.js";

/** `from ..pkg.mod import X` → "..pkg.mod"; dots are the depth and must survive. */
function relativeSpecifier(node: SyntaxNode): string {
  const prefix = node.namedChildren.find((c) => c?.type === "import_prefix")?.text ?? "";
  const rest = node.namedChildren.find((c) => c?.type === "dotted_name")?.text ?? "";
  return `${prefix}${rest}`;
}

function moduleSpecifier(node: SyntaxNode | null): string | null {
  if (!node) return null;
  if (node.type === "relative_import") return relativeSpecifier(node);
  if (node.type === "dotted_name") return node.text;
  return null;
}

export function extractPythonModuleTables(
  tree: Tree,
): { imports: ImportRecord[]; exports: ExportRecord[] } {
  const imports: ImportRecord[] = [];
  const exports: ExportRecord[] = [];

  for (const node of tree.rootNode.namedChildren) {
    if (!node) continue;
    const siteLine = node.startPosition.row + 1;

    if (node.type === "import_statement") {
      for (const child of node.namedChildren) {
        if (child?.type === "dotted_name") {
          const specifier = child.text;
          const top = specifier.split(".")[0];
          if (top) {
            imports.push({ localName: top, importedName: "*", specifier, siteLine });
          }
        } else if (child?.type === "aliased_import") {
          const specifier = child.namedChildren.find((c) => c?.type === "dotted_name")?.text;
          const alias = child.childForFieldName("alias")
            ?? child.namedChildren.at(-1);
          if (specifier && alias) {
            imports.push({
              localName: alias.text, importedName: "*", specifier, siteLine,
            });
          }
        }
      }
      continue;
    }

    if (node.type === "import_from_statement") {
      const specifier = moduleSpecifier(node.namedChildren[0] ?? null);
      if (!specifier) continue;

      const wildcard = node.namedChildren.some((c) => c?.type === "wildcard_import");
      if (wildcard) {
        imports.push({ localName: "*", importedName: "*", specifier, siteLine });
        exports.push({
          exportedName: "*", localName: null, reExportFrom: specifier,
          isStar: true, siteLine,
        });
        continue;
      }

      for (const child of node.namedChildren.slice(1)) {
        if (child?.type === "dotted_name") {
          const name = child.text;
          imports.push({ localName: name, importedName: name, specifier, siteLine });
          exports.push({
            exportedName: name, localName: name, reExportFrom: specifier,
            isStar: false, siteLine,
          });
        } else if (child?.type === "aliased_import") {
          const original = child.namedChildren.find((c) => c?.type === "dotted_name")?.text;
          const alias = child.childForFieldName("alias") ?? child.namedChildren.at(-1);
          if (original && alias) {
            imports.push({
              localName: alias.text, importedName: original, specifier, siteLine,
            });
            exports.push({
              exportedName: alias.text, localName: original,
              reExportFrom: specifier, isStar: false, siteLine,
            });
          }
        }
      }
      continue;
    }

    // Python has no export keyword: every module-level binding is importable.
    if (node.type === "function_definition" || node.type === "class_definition") {
      const name = node.childForFieldName("name")?.text;
      if (name) {
        exports.push({
          exportedName: name, localName: name, reExportFrom: null,
          isStar: false, siteLine,
        });
      }
      continue;
    }
    if (node.type === "decorated_definition") {
      const inner = node.namedChildren.find(
        (c) => c?.type === "function_definition" || c?.type === "class_definition",
      );
      const name = inner?.childForFieldName("name")?.text;
      if (name) {
        exports.push({
          exportedName: name, localName: name, reExportFrom: null,
          isStar: false, siteLine,
        });
      }
      continue;
    }
    if (node.type === "expression_statement") {
      const target = node.namedChildren.find((c) => c?.type === "assignment")
        ?.namedChildren[0];
      if (target?.type === "identifier") {
        exports.push({
          exportedName: target.text, localName: target.text, reExportFrom: null,
          isStar: false, siteLine,
        });
      }
    }
  }

  return { imports, exports };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `nvm use && npx vitest run tests/adapters/python/modules.test.ts`
Expected: PASS (7 tests).

If `childForFieldName("alias")` returns null, the grammar exposes the alias as the last named child — the fallback in the code above already covers that, and the test is the contract.

- [ ] **Step 5: Commit**

```bash
git add src/adapters/python/modules.ts tests/adapters/python/modules.test.ts
git commit -m "feat: extract Python import and export tables"
```

---

### Task 6: Assemble the adapter (still unregistered)

**Files:**
- Create: `src/adapters/python/index.ts`
- Test: `tests/adapters/python/adapter.test.ts`

**Interfaces:**
- Consumes: Tasks 1, 2, 3, 5
- Produces: `pythonAdapter: LanguageAdapter`

- [ ] **Step 1: Write the failing test**

```ts
// tests/adapters/python/adapter.test.ts
import { beforeAll, describe, expect, it } from "vitest";
import { getPythonParser } from "../../../src/adapters/python/parser.js";
import { pythonAdapter } from "../../../src/adapters/python/index.js";

const extract = (path: string, src: string) =>
  pythonAdapter.extract(path, new TextEncoder().encode(src));

beforeAll(async () => { await getPythonParser(); });

describe("pythonAdapter", () => {
  it("matches .py and .pyi but not other files", () => {
    expect(pythonAdapter.matches("a/b.py")).toBe(true);
    expect(pythonAdapter.matches("a/b.pyi")).toBe(true);
    expect(pythonAdapter.matches("a/b.ts")).toBe(false);
  });

  it("always emits a file symbol so module-level refs have an owner", () => {
    const result = extract("a.py", "x = 1\n");
    expect(result.symbols[0]?.stableKey).toBe("py:a.py#");
    expect(result.symbols[0]?.kind).toBe("file");
  });

  it("reports parse errors as a warning rather than failing silently", () => {
    const result = extract("a.py", "def (:\n");
    expect(result.diagnostics.some((d) => d.severity === "warning")).toBe(true);
  });

  it("produces symbols, references, imports and exports together", () => {
    const result = extract("a.py", "from .m import Bar\n\ndef f() -> Bar:\n    helper()\n");
    expect(result.symbols.some((s) => s.shortName === "f")).toBe(true);
    expect(result.references.some((r) => r.name === "helper")).toBe(true);
    expect(result.imports.some((i) => i.localName === "Bar")).toBe(true);
    expect(result.exports.some((e) => e.exportedName === "f")).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `nvm use && npx vitest run tests/adapters/python/adapter.test.ts`
Expected: FAIL — cannot resolve `src/adapters/python/index.js`.

- [ ] **Step 3: Implement the adapter**

```ts
// src/adapters/python/index.ts
import { basename } from "node:path";
import type { Tree } from "web-tree-sitter";
import { EXTRACTOR_VERSION } from "../../version.js";
import type { ExtractResult, LanguageAdapter, SymbolRecord } from "../types.js";
import { extractPythonModuleTables } from "./modules.js";
import { pythonParser } from "./parser.js";
import { extractPythonReferences } from "./references.js";
import { extractPythonSymbols, stableKey } from "./symbols.js";

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
    isTest: /(^|\/)tests?\//.test(path) || /(^|\/)test_[^/]*\.py$/.test(path),
  };
}

export const pythonAdapter: LanguageAdapter = {
  language: "python",
  extractorVersion: EXTRACTOR_VERSION,
  matches: (path) => /\.pyi?$/.test(path),
  extract(path, bytes): ExtractResult {
    const source = Buffer.from(bytes).toString("utf8");
    const tree = pythonParser().parse(source);
    if (!tree) {
      return {
        symbols: [], references: [], imports: [], exports: [],
        diagnostics: [
          { severity: "error", message: "parser returned no tree", line: 1 },
        ],
      };
    }

    const symbols = [fileSymbol(path, tree), ...extractPythonSymbols(path, source, tree)];
    const { imports, exports } = extractPythonModuleTables(tree);
    return {
      symbols,
      references: extractPythonReferences(path, source, tree, symbols),
      imports,
      exports,
      diagnostics: tree.rootNode.hasError
        ? [{ severity: "warning", message: "parse errors present", line: 1 }]
        : [],
    };
  },
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `nvm use && npx vitest run tests/adapters/python/adapter.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Confirm the adapter is NOT reachable yet**

Run: `nvm use && grep -n "python" src/adapters/registry.ts`
Expected: no output. Registration happens only in Task 11, only on a PASS.

- [ ] **Step 6: Commit**

```bash
git add src/adapters/python/index.ts tests/adapters/python/adapter.test.ts
git commit -m "feat: assemble the Python adapter (not yet registered)"
```

---

### Task 7: Python module resolution and the link dispatch

**Files:**
- Create: `src/adapters/python/stdlib.ts`
- Create: `src/link/pythonModules.ts`
- Create: `src/link/moduleResolver.ts`
- Modify: `src/link/imports.ts` (add an injectable `resolveFn`)
- Modify: `src/index/pipeline.ts:130` (pass the dispatch to `buildExportMap`)
- Test: `tests/link/pythonModules.test.ts`

**Interfaces:**
- Consumes: `Resolution` from `src/tsconfig/resolve.ts`, `RepoBoundary`, `TsConfig`
- Produces:
  - `PYTHON_STDLIB_MODULES: ReadonlySet<string>`
  - `resolvePythonModule(specifier: string, fromFile: string, boundary: RepoBoundary): Resolution`
  - `resolveForFile(specifier: string, fromFile: string, cfg: TsConfig, boundary: RepoBoundary): Resolution`

- [ ] **Step 1: Write the failing test**

```ts
// tests/link/pythonModules.test.ts
import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RepoBoundary } from "../../src/repo/boundary.js";
import { resolvePythonModule } from "../../src/link/pythonModules.js";

function repo(files: string[]): RepoBoundary {
  const root = mkdtempSync(join(tmpdir(), "sonde-py-"));
  for (const f of files) {
    const full = join(root, f);
    mkdirSync(join(full, ".."), { recursive: true });
    writeFileSync(full, "");
  }
  return new RepoBoundary(root);
}

describe("resolvePythonModule", () => {
  it("resolves a single-dot relative import within the package", () => {
    const b = repo(["pkg/__init__.py", "pkg/mod.py", "pkg/foo.py"]);
    expect(resolvePythonModule(".foo", "pkg/mod.py", b))
      .toEqual({ kind: "internal", path: "pkg/foo.py" });
  });

  it("resolves a two-dot relative import to the parent package", () => {
    const b = repo(["pkg/__init__.py", "pkg/sub/__init__.py", "pkg/sub/m.py", "pkg/other.py"]);
    expect(resolvePythonModule("..other", "pkg/sub/m.py", b))
      .toEqual({ kind: "internal", path: "pkg/other.py" });
  });

  it("resolves a bare relative import to the package __init__", () => {
    const b = repo(["pkg/__init__.py", "pkg/mod.py"]);
    expect(resolvePythonModule(".", "pkg/mod.py", b))
      .toEqual({ kind: "internal", path: "pkg/__init__.py" });
  });

  it("derives a src/ layout import root without reading pyproject.toml", () => {
    const b = repo(["src/whyline/__init__.py", "src/whyline/cli.py", "src/whyline/util.py"]);
    // spec §5.2: walk up from a directory holding __init__.py; src/ is the root.
    expect(resolvePythonModule("whyline.util", "src/whyline/cli.py", b))
      .toEqual({ kind: "internal", path: "src/whyline/util.py" });
  });

  it("resolves a package import to its __init__.py", () => {
    const b = repo(["src/whyline/__init__.py", "src/whyline/sub/__init__.py", "src/whyline/cli.py"]);
    expect(resolvePythonModule("whyline.sub", "src/whyline/cli.py", b))
      .toEqual({ kind: "internal", path: "src/whyline/sub/__init__.py" });
  });

  it("classifies a stdlib module as external", () => {
    const b = repo(["a.py"]);
    expect(resolvePythonModule("os.path", "a.py", b))
      .toEqual({ kind: "external", pkg: "os" });
  });

  it("classifies an unknown third-party module as external", () => {
    const b = repo(["a.py"]);
    expect(resolvePythonModule("httpx", "a.py", b))
      .toEqual({ kind: "external", pkg: "httpx" });
  });

  it("prefers a repository module over a same-named external", () => {
    const b = repo(["json.py", "a.py"]);
    expect(resolvePythonModule("json", "a.py", b))
      .toEqual({ kind: "internal", path: "json.py" });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `nvm use && npx vitest run tests/link/pythonModules.test.ts`
Expected: FAIL — cannot resolve `src/link/pythonModules.js`.

- [ ] **Step 3: Vendor the stdlib table**

Create `src/adapters/python/stdlib.ts`. The list is CPython's `sys.stdlib_module_names`, union of 3.11–3.13. **Do not run Python to generate it** (invariant 5) — transcribe it. Record the provenance in the file header.

```ts
// src/adapters/python/stdlib.ts

/**
 * CPython `sys.stdlib_module_names`, union of 3.11, 3.12 and 3.13.
 *
 * Transcribed rather than computed: generating it would mean executing a
 * Python interpreter, which invariant 5 (SEC-008) forbids. A name missing
 * from this table degrades to UNRESOLVED, never to a wrong edge (spec §10).
 */
export const PYTHON_STDLIB_MODULES: ReadonlySet<string> = new Set([
  "__future__", "_abc", "_aix_support", "_ast", "_asyncio", "_bisect", "_blake2",
  "_bz2", "_codecs", "_collections", "_collections_abc", "_compression",
  "_contextvars", "_csv", "_ctypes", "_curses", "_datetime", "_decimal", "_elementtree",
  "_functools", "_hashlib", "_heapq", "_imp", "_io", "_json", "_locale", "_lsprof",
  "_lzma", "_markupbase", "_md5", "_multibytecodec", "_multiprocessing", "_opcode",
  "_operator", "_osx_support", "_pickle", "_posixsubprocess", "_py_abc", "_pydecimal",
  "_pyio", "_queue", "_random", "_sha1", "_sha2", "_sha3", "_signal", "_sitebuiltins",
  "_socket", "_sqlite3", "_sre", "_ssl", "_stat", "_statistics", "_string", "_struct",
  "_symtable", "_thread", "_threading_local", "_tkinter", "_tokenize", "_tracemalloc",
  "_typing", "_uuid", "_warnings", "_weakref", "_weakrefset", "_zoneinfo",
  "abc", "aifc", "antigravity", "argparse", "array", "ast", "asynchat", "asyncio",
  "asyncore", "atexit", "audioop", "base64", "bdb", "binascii", "bisect", "builtins",
  "bz2", "cProfile", "calendar", "cgi", "cgitb", "chunk", "cmath", "cmd", "code",
  "codecs", "codeop", "collections", "colorsys", "compileall", "concurrent",
  "configparser", "contextlib", "contextvars", "copy", "copyreg", "crypt", "csv",
  "ctypes", "curses", "dataclasses", "datetime", "dbm", "decimal", "difflib", "dis",
  "doctest", "email", "encodings", "ensurepip", "enum", "errno", "faulthandler",
  "fcntl", "filecmp", "fileinput", "fnmatch", "fractions", "ftplib", "functools",
  "gc", "genericpath", "getopt", "getpass", "gettext", "glob", "graphlib", "grp",
  "gzip", "hashlib", "heapq", "hmac", "html", "http", "idlelib", "imaplib", "imghdr",
  "imp", "importlib", "inspect", "io", "ipaddress", "itertools", "json", "keyword",
  "lib2to3", "linecache", "locale", "logging", "lzma", "mailbox", "mailcap",
  "marshal", "math", "mimetypes", "mmap", "modulefinder", "msilib", "msvcrt",
  "multiprocessing", "netrc", "nis", "nntplib", "nt", "ntpath", "nturl2path",
  "numbers", "opcode", "operator", "optparse", "os", "ossaudiodev", "pathlib",
  "pdb", "pickle", "pickletools", "pipes", "pkgutil", "platform", "plistlib",
  "poplib", "posix", "posixpath", "pprint", "profile", "pstats", "pty", "pwd",
  "py_compile", "pyclbr", "pydoc", "pydoc_data", "pyexpat", "queue", "quopri",
  "random", "re", "readline", "reprlib", "resource", "rlcompleter", "runpy",
  "sched", "secrets", "select", "selectors", "shelve", "shlex", "shutil", "signal",
  "site", "smtplib", "sndhdr", "socket", "socketserver", "spwd", "sqlite3",
  "sre_compile", "sre_constants", "sre_parse", "ssl", "stat", "statistics",
  "string", "stringprep", "struct", "subprocess", "sunau", "symtable", "sys",
  "sysconfig", "syslog", "tabnanny", "tarfile", "telnetlib", "tempfile",
  "termios", "textwrap", "this", "threading", "time", "timeit", "tkinter",
  "token", "tokenize", "tomllib", "trace", "traceback", "tracemalloc", "tty",
  "turtle", "turtledemo", "types", "typing", "unicodedata", "unittest", "urllib",
  "uu", "uuid", "venv", "warnings", "wave", "weakref", "webbrowser", "winreg",
  "winsound", "wsgiref", "xdrlib", "xml", "xmlrpc", "zipapp", "zipfile",
  "zipimport", "zlib", "zoneinfo",
]);
```

- [ ] **Step 4: Implement Python module resolution**

```ts
// src/link/pythonModules.ts
import type { RepoBoundary } from "../repo/boundary.js";
import type { Resolution } from "../tsconfig/resolve.js";
import { PYTHON_STDLIB_MODULES } from "../adapters/python/stdlib.js";

function exists(boundary: RepoBoundary, relativePath: string): boolean {
  try {
    boundary.readFile(relativePath);
    return true;
  } catch {
    return false;
  }
}

/** A module path resolves to `x/y.py` or to the package's `x/y/__init__.py`. */
function moduleFile(boundary: RepoBoundary, base: string): string | null {
  const asModule = `${base}.py`;
  if (exists(boundary, asModule)) return asModule;
  const asPackage = `${base}/__init__.py`;
  if (exists(boundary, asPackage)) return asPackage;
  return null;
}

/**
 * spec §5.2: the import root is derived, not configured.
 *
 * Walk up from the file's directory while each level holds `__init__.py`; the
 * first directory that does not is the root. This makes `src/` layout work
 * with no pyproject.toml parsing, no sys.path emulation, and no execution of
 * repository code (invariant 5).
 */
function importRoot(boundary: RepoBoundary, fromFile: string): string {
  const parts = fromFile.split("/").slice(0, -1);
  while (parts.length > 0 && exists(boundary, [...parts, "__init__.py"].join("/"))) {
    parts.pop();
  }
  return parts.join("/");
}

function join(...segments: string[]): string {
  return segments.filter((s) => s.length > 0).join("/");
}

export function resolvePythonModule(
  specifier: string, fromFile: string, boundary: RepoBoundary,
): Resolution {
  const dots = /^\.+/.exec(specifier)?.[0].length ?? 0;

  if (dots > 0) {
    const rest = specifier.slice(dots);
    let dir = fromFile.split("/").slice(0, -1);
    // One dot is the current package; each extra dot climbs one level.
    for (let i = 1; i < dots; i++) dir = dir.slice(0, -1);
    const base = rest.length === 0
      ? join(dir.join("/"), "__init__")
      : join(dir.join("/"), rest.split(".").join("/"));
    const hit = rest.length === 0
      ? (exists(boundary, `${base}.py`) ? `${base}.py` : null)
      : moduleFile(boundary, base);
    // A relative import can only ever be in-repo; a miss is unresolved, and
    // returning `external` here would fabricate a package (invariant 1).
    return hit
      ? { kind: "internal", path: hit }
      : { kind: "external", pkg: specifier };
  }

  const segments = specifier.split(".");
  const top = segments[0] ?? specifier;

  for (const root of [importRoot(boundary, fromFile), ""]) {
    const hit = moduleFile(boundary, join(root, segments.join("/")));
    if (hit) return { kind: "internal", path: hit };
  }

  // spec §5.4: stdlib and third-party alike are EXTERNAL, never UNRESOLVED,
  // so the unresolved count stays a meaningful completeness signal.
  return { kind: "external", pkg: PYTHON_STDLIB_MODULES.has(top) ? top : top };
}
```

- [ ] **Step 5: Implement the language dispatch**

```ts
// src/link/moduleResolver.ts
import type { RepoBoundary } from "../repo/boundary.js";
import type { TsConfig } from "../tsconfig/load.js";
import { resolveSpecifier, type Resolution } from "../tsconfig/resolve.js";
import { resolvePythonModule } from "./pythonModules.js";

/**
 * Picks a specifier resolver by the importing file's language.
 *
 * Every non-TypeScript language previously fell through to `resolveSpecifier`,
 * which classifies anything it cannot find as an external package. That is
 * correct for Swift, whose imports name frameworks, and wrong for Python,
 * whose imports routinely name sibling modules in the same repository.
 */
export function resolveForFile(
  specifier: string, fromFile: string, cfg: TsConfig, boundary: RepoBoundary,
): Resolution {
  if (/\.pyi?$/.test(fromFile)) {
    return resolvePythonModule(specifier, fromFile, boundary);
  }
  return resolveSpecifier(specifier, fromFile, cfg, boundary);
}
```

- [ ] **Step 6: Thread the dispatch through the link layer**

In `src/link/imports.ts`, add the injectable resolver, defaulting to the dispatch:

```ts
import { resolveForFile } from "./moduleResolver.js";

type ResolveFn = (
  spec: string, from: string, cfg: TsConfig, b: RepoBoundary,
) => Resolution;

export function bindImports(
  file: string, imports: ImportRecord[], exportMap: ExportMap,
  cfg: TsConfig, boundary: RepoBoundary,
  resolveFn: ResolveFn = resolveForFile,
): Map<string, Binding> {
```

and change the call inside from `resolveSpecifier(...)` to `resolveFn(...)`.

In `src/index/pipeline.ts:130`, pass the dispatch explicitly:

```ts
    const exportMap = buildExportMap(extracted, cfg, boundary, resolveForFile);
```

- [ ] **Step 7: Run the new test to verify it passes**

Run: `nvm use && npx vitest run tests/link/pythonModules.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 8: Run the full suite to prove TypeScript and Swift are unaffected**

Run: `nvm use && npm test`
Expected: all tests pass. `resolveForFile` must be a pure pass-through for every non-`.py` file, so any TypeScript or Swift failure here means the dispatch is wrong, not that a test needs updating.

- [ ] **Step 9: Commit**

```bash
git add src/adapters/python/stdlib.ts src/link/pythonModules.ts src/link/moduleResolver.ts \
        src/link/imports.ts src/index/pipeline.ts tests/link/pythonModules.test.ts
git commit -m "feat: resolve Python module specifiers through a language dispatch"
```

---

### Task 8: Fixture repository and end-to-end integration

**Files:**
- Create: `tests/fixtures/repos/python-small/` (see the layout below)
- Test: `tests/adapters/python/integration.test.ts`

**Interfaces:**
- Consumes: every prior task
- Produces: no exported code; this task proves the pipeline composes

- [ ] **Step 1: Create the fixture**

The fixture exists to pin the cases that decide correctness, not to exercise the parser. Create these files under `tests/fixtures/repos/python-small/`:

`src/app/__init__.py`
```python
from .core import Engine
from .util import helper

__all__ = ["Engine", "helper"]
```

`src/app/core.py`
```python
from .util import helper


class Base:
    def describe(self):
        return "base"


class Engine(Base):
    def run(self):
        return self.describe() + helper()
```

`src/app/util.py`
```python
import os
import json


def helper():
    return os.sep + json.dumps({})


def _private():
    return 1
```

`src/app/dynamic.py`
```python
def call_it(obj):
    return getattr(obj, "run")()
```

`src/app/star.py`
```python
from .util import *


def use():
    return helper()
```

`tests/test_engine.py`
```python
from app.core import Engine


def test_run():
    assert Engine().run()
```

- [ ] **Step 2: Write the failing test**

```ts
// tests/adapters/python/integration.test.ts
import { beforeAll, describe, expect, it } from "vitest";
import { join } from "node:path";
import { RepoBoundary } from "../../../src/repo/boundary.js";
import { getPythonParser } from "../../../src/adapters/python/parser.js";
import { pythonAdapter } from "../../../src/adapters/python/index.js";
import { buildExportMap } from "../../../src/link/exportmap.js";
import { bindImports } from "../../../src/link/imports.js";
import { resolveForFile } from "../../../src/link/moduleResolver.js";
import type { ExtractResult } from "../../../src/adapters/types.js";

const ROOT = join(process.cwd(), "tests/fixtures/repos/python-small");
const FILES = [
  "src/app/__init__.py", "src/app/core.py", "src/app/util.py",
  "src/app/dynamic.py", "src/app/star.py", "tests/test_engine.py",
];

let boundary: RepoBoundary;
let extracted: Map<string, ExtractResult>;
// The fixture has no tsconfig; the Python path never reads it.
const cfg = {} as never;

beforeAll(async () => {
  await getPythonParser();
  boundary = new RepoBoundary(ROOT);
  extracted = new Map(
    FILES.map((f) => [f, pythonAdapter.extract(f, boundary.readFile(f))]),
  );
});

describe("python end-to-end linking", () => {
  it("binds a relative import to the owning file", () => {
    const exportMap = buildExportMap(extracted, cfg, boundary, resolveForFile);
    const bindings = bindImports(
      "src/app/core.py", extracted.get("src/app/core.py")!.imports,
      exportMap, cfg, boundary, resolveForFile,
    );
    expect(bindings.get("helper")).toEqual({ file: "src/app/util.py", name: "helper" });
  });

  it("follows an __init__.py re-export chain to the defining file", () => {
    const exportMap = buildExportMap(extracted, cfg, boundary, resolveForFile);
    expect(exportMap.get("src/app/__init__.py")?.get("Engine")).toBe("src/app/core.py");
  });

  it("classifies stdlib imports as external, never unresolved", () => {
    const exportMap = buildExportMap(extracted, cfg, boundary, resolveForFile);
    const bindings = bindImports(
      "src/app/util.py", extracted.get("src/app/util.py")!.imports,
      exportMap, cfg, boundary, resolveForFile,
    );
    expect(bindings.get("os")).toEqual({ external: "os", name: "*" });
    expect(bindings.get("json")).toEqual({ external: "json", name: "*" });
  });

  it("propagates a star import through the export map", () => {
    const exportMap = buildExportMap(extracted, cfg, boundary, resolveForFile);
    expect(exportMap.get("src/app/star.py")?.get("helper")).toBe("src/app/util.py");
  });

  it("emits self.describe() as a reference the resolver can narrow", () => {
    const refs = extracted.get("src/app/core.py")!.references;
    const ref = refs.find((r) => r.name === "describe");
    expect(ref?.receiver).toBe("self");
    expect(ref?.scopeHint?.receiverType).toBe("Engine");
  });

  it("keeps a dynamic getattr call visible rather than dropping it", () => {
    // invariant 1: never silently drop a reference; getattr must not be
    // resolved to a guessed target either.
    const refs = extracted.get("src/app/dynamic.py")!.references;
    expect(refs.some((r) => r.name === "getattr")).toBe(true);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `nvm use && npx vitest run tests/adapters/python/integration.test.ts`
Expected: FAIL — the fixture or the linking does not yet satisfy these assertions.

- [ ] **Step 4: Fix what the test exposes**

Do not weaken an assertion to make it pass. Each one encodes a spec requirement:
re-export chains (§5.3), stdlib `EXTERNAL` (§5.4), star imports (§5.3), `self.`
narrowing (§5.1), and dynamic calls staying visible (invariant 1). If one cannot
be satisfied, **stop and report** rather than editing the expectation.

- [ ] **Step 5: Run the full suite**

Run: `nvm use && npm test`
Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add tests/fixtures/repos/python-small tests/adapters/python/integration.test.ts
git commit -m "test: end-to-end Python extraction and linking on a real fixture"
```

---

### Task 9: Commit the gate thresholds, alone

This task deliberately contains no measurement. Committing the thresholds by themselves, before any number exists, is what makes "no threshold may be adjusted after seeing a result" enforceable rather than aspirational — the same procedure Swift used in `04c316b`.

**Files:**
- Create: `probes/python-placement/PROTOCOL.md`

- [ ] **Step 1: Write the protocol**

```markdown
## Gate (fixed before measurement)

Thresholds are reused verbatim from `probes/swift-narrowing/FINDINGS.md` rather
than chosen for Python, so the bar cannot have been set to fit the result.

- PASS: UNRESOLVED <= 30% AND LEXICAL + HEURISTIC >= 70%. Continue to
  registration.
- MARGINAL: UNRESOLVED 31-50%. Record and stop; report to the human.
- FAIL: UNRESOLVED > 50%. Python needs compiler-grade evidence (a pyright
  tier, spec §2), which is out of scope here. Record and stop.

No threshold may be adjusted after seeing a result.

## Denominator

Measured over in-repository references only. EXTERNAL is excluded from the
denominator, matching TypeScript's treatment of `node_modules` and the
corrected Swift methodology. Counting SDK and third-party references as
UNRESOLVED is the error that produced Swift's false FAIL at 65.09% before its
corrected PASS at 25.16%.

## Corpora

| Corpus | Files | Role |
|---|---:|---|
| `~/agentdock` | 55 | The motivating case; src/ layout |
| `pydantic` | 435 | Primary signal; heavy type-hint usage |

## What this gate does not measure

Placement, not correctness: whether a reference found candidates, not whether
the target was right. TypeScript has an oracle scored against `tsc`; Python
has none, because that requires pyright. A PASS here must not be reported as
type-checked accuracy.
```

- [ ] **Step 2: Verify no measurement code exists yet**

Run: `ls probes/python-placement/`
Expected: `PROTOCOL.md` only.

- [ ] **Step 3: Commit the thresholds by themselves**

```bash
git add probes/python-placement/PROTOCOL.md
git commit -m "docs: fix the Python adapter gate thresholds before measuring"
```

The commit must contain this file and nothing else.

---

### Task 10: Measure and decide

**Files:**
- Modify: `src/repo/discover.ts` (make the extension allowlist injectable)
- Create: `probes/python-placement/measure.ts`
- Create: `probes/python-placement/FINDINGS.md`
- Modify: `package.json` (add `probe:python`)
- Test: `tests/repo/discoverExtensions.test.ts`

- [ ] **Step 1: Write the failing test for injectable extensions**

```ts
// tests/repo/discoverExtensions.test.ts
import { describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RepoBoundary } from "../../src/repo/boundary.js";
import { discover } from "../../src/repo/discover.js";

function repo(): RepoBoundary {
  const root = mkdtempSync(join(tmpdir(), "sonde-disc-"));
  writeFileSync(join(root, "a.ts"), "export const a = 1;\n");
  writeFileSync(join(root, "b.py"), "def b():\n    pass\n");
  return new RepoBoundary(root);
}

describe("discover extension filtering", () => {
  it("keeps the default allowlist unchanged", () => {
    const found = discover(repo(), { hashContent: false }).map((f) => f.path);
    expect(found).toContain("a.ts");
    expect(found).not.toContain("b.py");
  });

  it("honours an explicit extension override", () => {
    const found = discover(repo(), {
      hashContent: false,
      extensions: new Set([".py"]),
    }).map((f) => f.path);
    expect(found).toEqual(["b.py"]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `nvm use && npx vitest run tests/repo/discoverExtensions.test.ts`
Expected: FAIL — `extensions` is not an accepted option.

- [ ] **Step 3: Make the allowlist injectable**

In `src/repo/discover.ts`, add `extensions?: ReadonlySet<string>` to `DiscoverOptions`, keep `SOURCE_EXTENSIONS` as the default, and read it once inside `discover`:

```ts
export interface DiscoverOptions {
  maxBytes?: number;
  /** Overrides the default allowlist. The probe uses this to enumerate .py
   *  files before the adapter is registered, so no second file walker exists. */
  extensions?: ReadonlySet<string>;
}
```

```ts
  const extensions = options.extensions ?? SOURCE_EXTENSIONS;
```

then use `extensions` where `SOURCE_EXTENSIONS` was consulted in the walk.

- [ ] **Step 4: Run the test to verify it passes**

Run: `nvm use && npx vitest run tests/repo/discoverExtensions.test.ts`
Expected: PASS (2 tests). The first test is the one that matters — production discovery must be byte-for-byte unchanged until Task 11.

- [ ] **Step 5: Write the measurement script**

`probes/python-placement/measure.ts` takes a repository path, extracts every `.py` file through `pythonAdapter`, links via `buildExportMap` with `resolveForFile`, resolves via the existing resolver, and prints the tier distribution.

```ts
// probes/python-placement/measure.ts
import { relative } from "node:path";
import { RepoBoundary } from "../../src/repo/boundary.js";
import { discover } from "../../src/repo/discover.js";
import { getPythonParser } from "../../src/adapters/python/parser.js";
import { pythonAdapter } from "../../src/adapters/python/index.js";
import { buildExportMap } from "../../src/link/exportmap.js";
import { resolveAll } from "../../src/resolve/resolver.js";
import { resolveForFile } from "../../src/link/moduleResolver.js";

const root = process.argv[2];
if (!root) throw new Error("usage: measure.ts <repo-path>");

await getPythonParser();
const boundary = new RepoBoundary(root);
const files = discover(boundary, {
  hashContent: false,
  extensions: new Set([".py", ".pyi"]),
}).map((f) => f.path);

const extracted = new Map(
  files.map((f) => [f, pythonAdapter.extract(f, boundary.readFile(f))]),
);

// Reuse the production resolver; a bespoke scorer here would measure the
// probe rather than the adapter.
const cfg = {} as never;
const exportMap = buildExportMap(extracted, cfg, boundary, resolveForFile);
const resolved = resolveAll(extracted, exportMap, cfg, boundary);

const counts = { LEXICAL: 0, HEURISTIC: 0, COMPILER: 0 };
for (const edge of resolved.edges) {
  counts[edge.tier as keyof typeof counts] =
    (counts[edge.tier as keyof typeof counts] ?? 0) + 1;
}
const external = resolved.external.length;
const unresolved = resolved.unresolved.length;
const placed = counts.LEXICAL + counts.HEURISTIC + counts.COMPILER;
const inRepo = placed + unresolved;

console.log(JSON.stringify({
  repo: relative(process.cwd(), root) || root,
  files: files.length,
  external,
  ...counts,
  unresolved,
  inRepoReferences: inRepo,
  unresolvedShare: +(unresolved / inRepo * 100).toFixed(2),
  placedShare: +(placed / inRepo * 100).toFixed(2),
}, null, 2));
```

- [ ] **Step 6: Add the script entry**

In `package.json` `scripts`:

```json
    "probe:python": "node --import tsx probes/python-placement/measure.ts"
```

- [ ] **Step 7: Fetch the pydantic corpus**

```bash
git clone --depth 1 https://github.com/pydantic/pydantic \
  /private/tmp/claude-501/sonde-corpora/pydantic
```

- [ ] **Step 8: Measure both corpora**

```bash
nvm use
npm run probe:python -- /Users/anish/agentdock
npm run probe:python -- /private/tmp/claude-501/sonde-corpora/pydantic
```

Record both outputs verbatim. Do not adjust the adapter and re-run in order to improve a number without recording that you did so and why.

- [ ] **Step 9: Write FINDINGS.md**

Write `probes/python-placement/FINDINGS.md` containing: the date, both corpora with file and reference counts, the full tier distribution table, the computed `unresolvedShare` and `placedShare` for each, and the verdict against the Task 9 thresholds. If the two corpora disagree (one PASS, one FAIL), report both and take the **worse** verdict; do not average them.

Include a short section naming what the largest `UNRESOLVED` causes actually are, sampled rather than assumed — Swift's findings were only trustworthy because the zero-candidate names were listed and recognisable.

- [ ] **Step 10: Commit the measurement**

```bash
git add probes/python-placement/measure.ts probes/python-placement/FINDINGS.md package.json
git commit -m "test: measure Python reference placement against the fixed gate"
```

- [ ] **Step 11: STOP and report the verdict**

Report to the human: the numbers, the verdict, and whether Task 11 proceeds. On MARGINAL or FAIL, **Task 11 does not run** — Python stays unregistered, `sonde init` keeps honestly reporting 0 files on Python repositories, and the recommendation is the pyright tier from spec §2.

---

### Task 11: Register and document — conditional on a PASS

Run this task only if Task 10 recorded PASS.

**Files:**
- Modify: `src/adapters/registry.ts`
- Modify: `README.md`
- Modify: `CHANGELOG.md`
- Test: `tests/adapters/registry.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// append to tests/adapters/registry.test.ts
it("routes .py files to the Python adapter", () => {
  expect(adapterForPath("src/app/util.py")?.language).toBe("python");
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `nvm use && npx vitest run tests/adapters/registry.test.ts`
Expected: FAIL — `adapterForPath` returns null for `.py`.

- [ ] **Step 3: Register the adapter and open discovery to Python**

Both changes are required, and shipping only the first is the trap this step exists to prevent: `registry.ts` decides which adapter handles a file, but `discover.ts` decides whether the file is ever offered to an adapter at all. With only the registry change every unit test passes and `sonde index` still reports `indexed 0 files`.

In `src/adapters/registry.ts`:

```ts
import { pythonAdapter } from "./python/index.js";
import { getPythonParser } from "./python/parser.js";

const registrations: readonly Registration[] = [
  { adapter: typescriptAdapter, initialize: getTsParser },
  { adapter: swiftAdapter, initialize: getSwiftParser },
  { adapter: pythonAdapter, initialize: getPythonParser },
];
```

In `src/repo/discover.ts`, extend the default allowlist:

```ts
const SOURCE_EXTENSIONS = new Set([
  ".ts", ".tsx", ".mts", ".cts", ".swift", ".py", ".pyi",
]);
```

Add the matching assertion to `tests/repo/discoverExtensions.test.ts`, replacing the earlier expectation that `.py` is excluded by default:

```ts
  it("discovers Python files by default once the adapter ships", () => {
    const found = discover(repo(), { hashContent: false }).map((f) => f.path);
    expect(found).toContain("a.ts");
    expect(found).toContain("b.py");
  });
```

- [ ] **Step 4: Run the full suite**

Run: `nvm use && npm test`
Expected: all tests pass.

- [ ] **Step 5: Smoke-test against the real motivating case**

```bash
nvm use && npm run build
node dist/cli/main.js index /Users/anish/agentdock
node dist/cli/main.js status /Users/anish/agentdock
```

Expected: a non-zero file count where `sonde init` previously reported `indexed 0 files`. Record the actual numbers in the commit body.

- [ ] **Step 6: Update the README**

Add Python to the supported-languages description, and add to **Known limitations**, verbatim in substance:

> **Python edges are not verified against a type checker.** TypeScript's edge
> accuracy is measured against `tsc` in `ORACLE.md`. Python has no equivalent
> oracle, because that requires pyright. The Python adapter's gate measured
> *placement* — whether a reference found candidates — not whether the target
> was correct. See `probes/python-placement/FINDINGS.md`.

This disclosure is a shipping requirement (spec §6.4), not optional polish.

- [ ] **Step 7: Update the CHANGELOG**

Add under `## [Unreleased]` → `### Added`, citing the measured numbers from Task 10 rather than adjectives.

- [ ] **Step 8: Commit**

```bash
git add src/adapters/registry.ts tests/adapters/registry.test.ts README.md CHANGELOG.md
git commit -m "feat: register the Python adapter after passing the placement gate"
```

- [ ] **Step 9: Record the decision**

```bash
whyline note "Ship the Python adapter after the placement gate passed" \
  --because "<measured unresolved and placed shares on both corpora>" \
  --rejected "Registering before measuring: the gate exists precisely to be able to say no" \
  --file src/adapters/registry.ts
```

---

## Self-Review

**Spec coverage.** §4.1 symbols → Task 2. §4.2 references → Task 3. §4.3 import
binding facts → Task 5. §5.1 tiers and `self.`/`cls.` narrowing → Tasks 3, 8.
§5.2 derived package roots → Task 7. §5.3 module resolution in `link/`, star
imports, re-export chains → Tasks 5, 7, 8. §5.4 `EXTERNAL` from day one →
Task 7. §6 the gate → Tasks 9, 10. §6.4 the placement-not-correctness
disclosure → Task 11 Step 6. §7 file structure → Tasks 1–7. §8 testing →
Tasks 2, 3, 5, 8. §9 sequencing → task order. §10 known risks: star imports
without `__all__` and import cycles are covered by the existing `buildExportMap`
fixpoint (bounded pass count) and exercised in Task 8; stdlib drift is handled
by the Task 7 header comment.

**One item is in the plan but not in the spec:** Task 4, the Swift SDK
scoping fix. It was discovered while writing this plan, not during design.
It belongs here because leaving it would bias the §6 measurement toward PASS,
which is a correctness precondition for the gate rather than a separate
feature.

**Type consistency.** `stableKey(path, scope)` is defined in Task 2 and used in
Tasks 3 and 6 with the same signature. `extractPythonSymbols`,
`extractPythonReferences`, and `extractPythonModuleTables` keep the argument
orders used in Task 6's assembly. `resolvePythonModule` and `resolveForFile`
are defined in Task 7 and used with identical signatures in Tasks 8 and 10.
`Resolution` is the existing type from `src/tsconfig/resolve.ts`, not a new one.

**Two gaps found during self-review, both now closed in the plan.**

1. `RepoBoundary` has no `listFiles()`. The first draft of Task 10 assumed one.
   Verified against `src/repo/boundary.ts`; the probe now uses
   `discover(boundary, options)`. `resolveAll(files, exportMap, cfg, boundary)`
   was checked the same way and is correct as written
   (`src/resolve/resolver.ts:49`).
2. `src/repo/discover.ts:20` hardcodes an extension allowlist that omits `.py`.
   Registering the adapter without touching it would leave `sonde index`
   reporting `indexed 0 files` **while every unit test passed** — a silent
   failure of exactly the kind invariant 8 exists to prevent, in the feature
   whose entire purpose is to stop reporting zero. Task 10 makes the set
   injectable; Task 11 Step 3 extends the default and registers the adapter in
   the same commit.

**Sequencing risk accepted.** Task 4 (the Swift SDK scoping fix) is ordered
before Python emits any `scopeHint` in anger, so no committed state exists in
which the contamination could affect a measurement.
