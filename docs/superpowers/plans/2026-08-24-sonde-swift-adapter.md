# Sonde Swift Adapter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Swift language adapter that produces a usefully-resolved graph — not merely a parsing one.

**Architecture:** Swift reuses the existing four-phase pipeline (EXTRACT → LINK → RESOLVE → STORE) and the shared `LanguageAdapter` contract. The work that is *not* shared is narrowing: TypeScript narrows candidates through its import table, and Swift has no equivalent. A `scopeHint` carried on each reference supplies module and file-visibility evidence instead.

**Tech Stack:** TypeScript (strict), Node 22+, `web-tree-sitter`, `alex-pinkus/tree-sitter-swift` 0.7.3.

**Spec:** `docs/superpowers/specs/2026-08-16-sonde-design.md` (revision 4) — §4.1 pure extraction, §4.3 tiers and `AMBIGUITY_CAP`, §5.2 adapter contract.
**Prior findings:** `docs/superpowers/specs/2026-08-16-swift-spike-findings.md`.

---

## Read this before Task 1: the adapter is not the hard part

Parsing Swift is solved. Resolving it is not, and the reason is specific.

TypeScript narrows a reference by its import table: `import { compose } from './compose'` says exactly which `compose` is meant. **Swift's default `internal` visibility means every declaration in a module is visible to every file in that module with no import at all.** There is nothing to narrow with.

The spike measured 20 real references from a production Swift application. Re-scored against `AMBIGUITY_CAP = 8`, which did not exist when the spike ran:

| Outcome | Spike, before the cap | With the cap as it ships today |
|---|---:|---:|
| `LEXICAL` | 1 (5%) | 1 (5%) |
| `HEURISTIC` | 15 (75%) | 6 (30%) |
| **`UNRESOLVED`** | 4 (20%) | **13 (65%)** |

The cap is correct for TypeScript — it removed 88% of a 354,291-edge graph that was 73% noise. Applied to Swift unchanged, it turns two thirds of references into "we could not place this."

**A Swift adapter that ships against that number is not worth shipping.** Task 4 is therefore a measured gate, not a milestone: if narrowing does not move the distribution, stop and report rather than continue to the adapter.

## What is already established — do not re-derive

Measured 2026-08-23/24 on a real Swift application (376 files, 39,136 lines):

| Fact | Value |
|---|---|
| Grammar to use | **`alex-pinkus/tree-sitter-swift` 0.7.3** — release asset `tree-sitter-swift.wasm` |
| Its error rate | **8.0%** of files flagged; **0.08%** of source bytes inside ERROR nodes |
| Declarations recovered | **8,664**, of which **955** live in files flagged `hasError` |
| The grammar Sonde used to vendor | `tree-sitter-wasms` 0.1.12 — **39.1%** error rate, and V8 cannot compile it without `--liftoff-only`. Do not use it. |
| Bumping `tree-sitter-wasms` | Useless — 0.1.12 and 0.1.13 ship byte-identical Swift grammars |
| Known 0.7.3 bugs | `as? T ?? default` and `if let x = try? await …` fail to parse. Confirmed by minimal repro. Report upstream; do not work around. |

Sonde already keeps symbols recovered from files with parse diagnostics, so the 8% file-level flag costs ~0.08% of content rather than 8% of files.

## Global Constraints

- **Node 22+.** Run `nvm use` in every shell; the machine default is v20 and fails with `EBADENGINE`.
- **Extraction stays pure** (spec §4.1). `extract(path, bytes)` does no I/O, no database access, no cross-file lookups. Everything cross-file belongs in `link/` and `resolve/`.
- **Tier vocabulary is fixed:** `COMPILER` | `LEXICAL` | `HEURISTIC` | `EXTERNAL` | `UNRESOLVED`.
- **A scope hint narrows candidates; it never promotes a tier.** Member access without compiler evidence stays `HEURISTIC` no matter how confident the narrowing is (spec §4.3, and the spike's own verdict).
- **Never fabricate.** Fewer candidates must come from evidence in the source, never from a heuristic preference among equals.
- **Do not change TypeScript behaviour.** The TS tier distribution and both benchmark suites must be identical before and after. A regression there is a failed task, not a tradeoff.
- Conventional commits; commit per task.

---

## File Structure

```
scripts/fetch-grammars.mjs        # MODIFY: add swift 0.7.3 (pinned + checksummed)
src/adapters/types.ts             # MODIFY: scopeHint on ReferenceRecord
src/adapters/swift/
  parser.ts                       # NEW: swift grammar loader
  symbols.ts                      # NEW: declarations -> SymbolRecord, stable keys
  references.ts                   # NEW: references + scopeHint
  modules.ts                      # NEW: import declarations (module-level only)
  index.ts                        # NEW: assembles the LanguageAdapter
src/adapters/registry.ts          # MODIFY: route .swift
src/resolve/tiers.ts              # MODIFY: consume scopeHint before the cap
tests/adapters/swift/*.test.ts    # NEW
tests/resolve/scopeHint.test.ts   # NEW
probes/swift-narrowing/           # NEW: Task 4 gate measurement + findings
```

---

### Task 1: Vendor the 0.7.3 grammar

**Files:** Modify `scripts/fetch-grammars.mjs`; create `tests/adapters/swift/parser.test.ts`, `src/adapters/swift/parser.ts`

**Interfaces:** Produces `async function getSwiftParser(): Promise<Parser>`, `function swiftParser(): Parser`

Pin by URL **and** checksum, matching how the benchmark fixture is pinned, so a re-cut release cannot change the grammar under a published measurement.

- [ ] **Step 1: Write the failing test**

```ts
// tests/adapters/swift/parser.test.ts
import { beforeAll, describe, expect, it } from "vitest";
import { getSwiftParser, swiftParser } from "../../../src/adapters/swift/parser.js";

beforeAll(async () => { await getSwiftParser(); });

describe("swift parser", () => {
  it("parses a class with a method", () => {
    const tree = swiftParser().parse("class A { func f() -> Int { return 1 } }");
    expect(tree?.rootNode.hasError).toBe(false);
  });

  it("parses Swift 5.9 macros, which the previously vendored grammar could not", () => {
    // tree-sitter-wasms 0.1.12 failed on #Preview/#Predicate/#expect and drove a
    // 39.1% file error rate on a real application.
    const tree = swiftParser().parse("#Preview { Text(\"hi\") }");
    expect(tree?.rootNode.hasError).toBe(false);
  });

  it("loads without V8 WASM compiler flags", () => {
    // The old grammar could only be loaded under --liftoff-only.
    expect(swiftParser()).toBeDefined();
  });

  it("recovers declarations either side of a known-bad expression", () => {
    // `as? T ?? default` is an upstream 0.7.3 bug. Error recovery is local, so
    // the surrounding declarations must survive.
    const source = [
      "func healthy() -> Int { return 1 }",
      "func damaged() { let x = d.get() as? Bool ?? true }",
      "func alsoHealthy() -> Int { return 2 }",
    ].join("\n");
    const tree = swiftParser().parse(source);
    const names: string[] = [];
    const visit = (n: any): void => {
      if (n.type === "function_declaration") {
        const nm = n.childForFieldName("name");
        if (nm) names.push(nm.text);
      }
      for (let i = 0; i < n.childCount; i += 1) visit(n.child(i));
    };
    visit(tree!.rootNode);
    expect(names).toContain("healthy");
    expect(names).toContain("alsoHealthy");
  });
});
```

- [ ] **Step 2: Run it and confirm it fails** — `nvm use && npx vitest run tests/adapters/swift/parser.test.ts` → cannot resolve `parser.js`

- [ ] **Step 3: Add the grammar to the fetch script**

In `scripts/fetch-grammars.mjs`, replace the "Swift is deliberately absent" comment with an entry pinned by URL and `sha256`:

```js
{
  name: "tree-sitter-swift.wasm",
  url: "https://github.com/alex-pinkus/tree-sitter-swift/releases/download/0.7.3/tree-sitter-swift.wasm",
  sha256: "<compute with: shasum -a 256 vendor/tree-sitter-swift.wasm>",
},
```

If the script does not yet verify checksums, add verification for all grammars and fail loudly on mismatch — an unverified grammar silently changes every published accuracy figure.

- [ ] **Step 4: Implement the loader**

Follow `src/adapters/typescript/parser.ts`: initialise once, cache the parser, expose an async warm-up plus a synchronous accessor so `extract` stays pure and synchronous.

- [ ] **Step 5: Run tests** — expect 4 passing

- [ ] **Step 6: Commit** — `feat: vendor tree-sitter-swift 0.7.3`

---

### Task 2: Extract Swift symbols and stable keys

**Files:** Create `src/adapters/swift/symbols.ts`, `tests/adapters/swift/symbols.test.ts`

**Interfaces:** Produces `function extractSwiftSymbols(path, source, tree): SymbolRecord[]`

Stable keys follow spec §6.2 — `swift:{relpath}#{scope_chain}`, never line-based. Swift adds one case TypeScript does not have: **extensions**. `extension Foo { func bar() }` declares `Foo.bar`, not `extension.bar`. The spike measured 21 of 21 extensions exposing a named declaring type, so this is reliable.

- [ ] **Step 1: Write the failing test**

```ts
// tests/adapters/swift/symbols.test.ts
import { beforeAll, describe, expect, it } from "vitest";
import { getSwiftParser, swiftParser } from "../../../src/adapters/swift/parser.js";
import { extractSwiftSymbols } from "../../../src/adapters/swift/symbols.js";

beforeAll(async () => { await getSwiftParser(); });
const run = (src: string, path = "Sources/A.swift") =>
  extractSwiftSymbols(path, src, swiftParser().parse(src)!);

describe("extractSwiftSymbols", () => {
  it("keys a top-level function", () => {
    expect(run("func refresh() {}")[0]!.stableKey).toBe("swift:Sources/A.swift#refresh");
  });

  it("scopes a method under its type", () => {
    const keys = run("class Auth { func refresh() {} }").map((s) => s.stableKey);
    expect(keys).toContain("swift:Sources/A.swift#Auth.refresh");
  });

  it("attributes an extension member to the type it extends, not to the extension", () => {
    // 21/21 extensions in the spike exposed a named declaring type.
    const keys = run("extension Auth { func retry() {} }").map((s) => s.stableKey);
    expect(keys).toContain("swift:Sources/A.swift#Auth.retry");
  });

  it("records protocol requirements as members of the protocol", () => {
    const keys = run("protocol Gateway { func save() }").map((s) => s.stableKey);
    expect(keys).toContain("swift:Sources/A.swift#Gateway.save");
  });

  it("captures declared visibility, which resolution needs for narrowing", () => {
    const symbols = run("private func hidden() {}\nfunc open() {}");
    expect(symbols.find((s) => s.shortName === "hidden")?.visibility).toBe("private");
    expect(symbols.find((s) => s.shortName === "open")?.visibility).toBe("internal");
  });

  it("does not mint closures as symbols", () => {
    // spec §6.2: anonymous callables are never symbols; references inside them
    // attribute to the nearest named enclosing symbol.
    const symbols = run("func outer() { [1].map { x in x + 1 } }");
    expect(symbols).toHaveLength(1);
    expect(symbols[0]!.shortName).toBe("outer");
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

- [ ] **Step 3: Implement.** Add `visibility?: "private" | "fileprivate" | "internal" | "public" | "open"` to `SymbolRecord` in `src/adapters/types.ts`, defaulting to `internal` when no modifier is present — that default is Swift's rule and is what makes narrowing possible at all.

- [ ] **Step 4: Run tests** — expect 6 passing

- [ ] **Step 5: Commit** — `feat: extract Swift symbols with extension attribution`

---

### Task 3: Extract references with scope hints

**Files:** Create `src/adapters/swift/references.ts`, `src/adapters/swift/modules.ts`, `tests/adapters/swift/references.test.ts`; modify `src/adapters/types.ts`

**Interfaces:**
- `interface ScopeHint { module: string | null; file: string; visibility: SymbolVisibility | null; receiver: string | null; }`
- `ReferenceRecord.scopeHint?: ScopeHint`
- `function extractSwiftReferences(path, source, tree, symbols): ReferenceRecord[]`

The hint records **evidence found in the source**, not a guess: which SwiftPM target the file belongs to, which file the reference is in, and the receiver expression when there is one. Task 4 decides whether that evidence is enough.

- [ ] **Step 1: Write the failing test**

```ts
// tests/adapters/swift/references.test.ts
import { beforeAll, describe, expect, it } from "vitest";
import { getSwiftParser, swiftParser } from "../../../src/adapters/swift/parser.js";
import { extractSwiftSymbols } from "../../../src/adapters/swift/symbols.js";
import { extractSwiftReferences } from "../../../src/adapters/swift/references.js";

beforeAll(async () => { await getSwiftParser(); });
const run = (src: string, path = "Sources/App/A.swift") => {
  const tree = swiftParser().parse(src)!;
  return extractSwiftReferences(path, src, tree, extractSwiftSymbols(path, src, tree));
};

describe("extractSwiftReferences", () => {
  it("records a bare call with no receiver", () => {
    const r = run("func a() { helper() }").find((x) => x.name === "helper")!;
    expect(r.kind).toBe("CALLS");
    expect(r.receiver).toBeNull();
  });

  it("records a member call with its receiver, which stays HEURISTIC later", () => {
    const r = run("func a() { gateway.save() }").find((x) => x.name === "save")!;
    expect(r.receiver).toBe("gateway");
  });

  it("carries the declaring file in the scope hint", () => {
    const r = run("func a() { helper() }").find((x) => x.name === "helper")!;
    expect(r.scopeHint?.file).toBe("Sources/App/A.swift");
  });

  it("carries the SwiftPM target inferred from the path", () => {
    // Sources/<Target>/... is the SwiftPM convention and is the only
    // module signal available without building the package.
    const r = run("func a() { helper() }").find((x) => x.name === "helper")!;
    expect(r.scopeHint?.module).toBe("App");
  });

  it("records protocol conformance", () => {
    const r = run("class A: Gateway {}").find((x) => x.name === "Gateway")!;
    expect(["IMPLEMENTS", "INHERITS"]).toContain(r.kind);
  });

  it("attributes a reference inside a closure to the nearest named symbol", () => {
    const r = run("func outer() { [1].map { _ in helper() } }").find((x) => x.name === "helper")!;
    expect(r.fromSymbolKey).toBe("swift:Sources/App/A.swift#outer");
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

- [ ] **Step 3: Implement.** `scopeHint` is optional on `ReferenceRecord`; TypeScript omits it and must be unaffected.

- [ ] **Step 4: Run the FULL suite** — TypeScript tests must be untouched

- [ ] **Step 5: Commit** — `feat: extract Swift references with scope hints`

---

### Task 4: THE GATE — measure whether narrowing works

**Files:** Create `probes/swift-narrowing/measure.ts`, `probes/swift-narrowing/FINDINGS.md`; modify `src/resolve/tiers.ts`

**This task decides whether the rest of the plan is worth doing.** Do not proceed to Task 5 without recording a verdict.

Narrowing rules, applied in order, each justified by source evidence:

1. A `private` or `fileprivate` candidate declared in a **different file** cannot be the target — Swift forbids it. Remove it.
2. A candidate in a **different SwiftPM target** cannot be the target of an unqualified reference unless that target is imported. Remove it.
3. If the receiver is a known local whose declared type is recoverable **syntactically** (`let g: Gateway = …`), keep only members of that type. If it is not recoverable, do not guess.

Rule 3 must not become type inference by another name: only an explicit written annotation counts.

- [ ] **Step 1: Fix the success criteria before measuring**

Write `probes/swift-narrowing/FINDINGS.md` with these thresholds, committed before any number exists:

```markdown
## Gate (fixed before measurement)

Baseline, from the spike's 20 references re-scored against AMBIGUITY_CAP=8:
LEXICAL 5%, HEURISTIC 30%, UNRESOLVED 65%.

- PASS: UNRESOLVED <= 30% AND LEXICAL + HEURISTIC >= 70%. Continue to Task 5.
- MARGINAL: UNRESOLVED 31-50%. Record and stop; report to the human.
- FAIL: UNRESOLVED > 50%. Swift needs compiler-grade evidence
  (SourceKit-LSP / IndexStoreDB), which is out of scope. Record and stop.

No threshold may be adjusted after seeing a result.
```

- [ ] **Step 2: Commit the criteria before running anything**

- [ ] **Step 3: Implement narrowing in `src/resolve/tiers.ts`**

Narrowing filters the candidate list **before** `AMBIGUITY_CAP` is applied. It must not change TypeScript behaviour: with no `scopeHint`, the candidate list is returned untouched.

- [ ] **Step 4: Measure on the real corpus**

Point `probes/swift-narrowing/measure.ts` at a real Swift application (376 files / 39,136 lines is the reference size; ask the human for a path — do not assume one). Report the tier distribution over all resolved references, before and after narrowing.

- [ ] **Step 5: Record the verdict** — apply the Step 1 thresholds unchanged. Do not soften a FAIL into "promising."

- [ ] **Step 6: Commit** — `test: measure Swift narrowing against the fixed gate`

**If the verdict is MARGINAL or FAIL, stop here and report.** The remaining tasks assume a resolvable graph, and the honest outcome is that Swift needs SourceKit-LSP — which is a different plan, not a harder version of this one.

---

### Task 5: Assemble the adapter and route `.swift`

**Only if Task 4 returned PASS.**

**Files:** Create `src/adapters/swift/index.ts`, `tests/adapters/swift/adapter.test.ts`; modify `src/adapters/registry.ts`, `src/index/pipeline.ts`

- [ ] **Step 1: Write the failing test** — a fixture Swift package indexes end to end, produces symbols and edges, and `implementations_of` on a protocol returns its conformers
- [ ] **Step 2: Run it and confirm it fails**
- [ ] **Step 3: Implement** — assemble `LanguageAdapter`, route `.swift` in the registry, and make the pipeline select an adapter by path rather than assuming TypeScript
- [ ] **Step 4: Run the full suite plus both benchmarks** — TypeScript results must be byte-identical
- [ ] **Step 5: Commit** — `feat: add the Swift language adapter`

---

### Task 6: Report the upstream grammar bugs

**Files:** Create `docs/upstream-issues.md`

Two 0.7.3 bugs are isolated with minimal repros. Reporting them is cheap and benefits every tree-sitter consumer.

- [ ] **Step 1: Record both with minimal repros**

```swift
// 1. `as?` combined with `??` fails; either alone parses.
let x = d.get() as? Bool ?? true

// 2. `try await` inside an optional binding fails; `while c, await f()` parses.
func f() async { if let r = try? await g() { print(r) } }
```

- [ ] **Step 2: File them at `alex-pinkus/tree-sitter-swift`** — ask the human first; this posts publicly under their account
- [ ] **Step 3: Commit** — `docs: record upstream tree-sitter-swift issues`

---

## Completion criteria

- [ ] Grammar 0.7.3 vendored, pinned by URL and checksum
- [ ] Swift symbols carry visibility; extension members attribute to the extended type
- [ ] References carry `scopeHint`; TypeScript is unaffected
- [ ] **Task 4 verdict recorded against thresholds fixed beforehand**
- [ ] If PASS: `.swift` indexes end to end and `implementations_of` works on protocols
- [ ] TypeScript tier distribution and both benchmarks unchanged
- [ ] `npm run typecheck && npm test` clean

## Known risks

| Risk | Signal | Response |
|---|---|---|
| Narrowing is insufficient | Task 4 returns FAIL | Stop. Swift needs SourceKit-LSP; that is a different plan. |
| Narrowing removes a correct candidate | Recall falls on a Swift fixture | Rules 1 and 2 follow language rules, not preference. If a correct target is removed, the rule is wrong — fix it, do not loosen the cap. |
| TypeScript regresses | TS tier counts or benchmarks move | `scopeHint` is optional; absent it, behaviour must be identical. Treat any movement as a bug in this plan. |
| Stable keys drift from TypeScript's scheme | Cross-language queries behave oddly | Keys are `{lang}:{relpath}#{scope_chain}` in both. The prefix differs; the shape does not. |
