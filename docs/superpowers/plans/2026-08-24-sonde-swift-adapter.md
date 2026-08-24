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

## Addendum, added 2026-08-24: Task 4 conflated EXTERNAL and UNRESOLVED

Task 4 returned **FAIL** (65.09% unresolved). That verdict stands and is not
being revisited here. But a controller review of the same data
(`probes/swift-narrowing/FINDINGS.md`, "Controller note added after scoring")
found that **86.1% of the 12,591 `UNRESOLVED` references had zero candidates**,
and sampling those names shows why: `String`, `Date`, `UUID`, `View`, `Button`,
`VStack`, `HStack`, `Image`, `ForEach`, `Color` — Swift standard library,
SwiftUI, Foundation, and CloudKit vocabulary. None of it is declared anywhere
in the corpus, and the Swift adapter has no `EXTERNAL` outcome (spec §4.4), so
every SDK reference falls through to `UNRESOLVED` alongside genuine same-module
ambiguity. Only 13.9% (1,750 references) is the kind of over-the-cap ambiguity
narrowing was built to address.

Recomputed with zero-candidate references correctly excluded as `EXTERNAL`:
18.2% unresolved / 81.8% placed — a PASS under the same fixed thresholds. That
number is a retroactive estimate over already-collected data, explicitly not
authoritative. Tasks 5 and 6 below build the real classification and get a
fresh, honest number.

**This does not change AMBIGUITY_CAP, `narrowCandidates`, or the Task 4
thresholds.** It adds the tier outcome that was missing from the plan.

---

### Task 5: Swift SDK symbol table and EXTERNAL classification

**Files:**
- Create: `src/adapters/swift/sdkSymbols.ts`, `tests/adapters/swift/sdkSymbols.test.ts`
- Modify: `src/resolve/tiers.ts`, `tests/resolve/tiers.test.ts`
- Modify: `src/resolve/resolver.ts` (the `tier === "EXTERNAL"` branch currently
  casts `binding as { external: string; name: string }` — see
  `src/resolve/resolver.ts` around the comment `// EXTERNAL is separate from
  genuinely unplaceable references`. That cast assumes a TypeScript import
  `Binding`. An SDK-table match has no `Binding` — `binding` is `null` for
  Swift references today. Handle both sources of `EXTERNAL` explicitly rather
  than relying on the cast silently producing `undefined`.)

**Interfaces:**
- Consumes: `AMBIGUITY_CAP`, `assignTier` (§4.3, already in `tiers.ts`)
- Produces:
  - `const SWIFT_SDK_SYMBOLS: ReadonlyMap<string, string>` — symbol name to a
    short framework label (e.g. `"View" -> "SwiftUI"`, `"Date" -> "Foundation"`).
    The label becomes `packageOrLib` on the `external_ref` row, the same field
    TypeScript populates from an import specifier.
  - `assignTier` gains an `EXTERNAL` outcome for a zero-candidate Swift
    reference whose name is in the table. A Swift reference is any reference
    carrying `scopeHint` — TypeScript references never set it, so this is a
    safe discriminator without adding a language field.

**Why a name-only table cannot hide a real local declaration.** This
classification only ever runs when `candidates.length === 0` — nothing in the
indexed corpus declares that name. So a name landing in the table can only
affect references that already have no local candidate; it can never cause a
genuinely-local symbol to be misclassified, because a local symbol always
produces at least one candidate first. Coverage does not need to be exhaustive
or perfectly precise: an unmatched zero-candidate reference simply stays
`UNRESOLVED`, exactly as today.

**Seed table — corpus-derived, not guessed.** These are the 256 names (of ~500
distinct zero-candidate names, covering 97.1% of all zero-candidate
references) that appeared at least 3 times as a zero-candidate reference on a
real 376-file Swift application. Verify each before adding — a handful look
like they could be project-defined (`ZoneConfiguration`, `NotificationInfo`,
`Reference`, `component`, `ID`, `set`, `add`, `max`, `min`, `range`,
`component`, `write`, `object`, `dictionary`, `prepare`, `submit`,
`invalidate`, `unlock`, `resume`, `unhandled`) — drop any that are not
confidently system vocabulary rather than guess:

```
String, font, Date, foregroundStyle, UUID, View, fetch, insert, Button, frame,
VStack, HStack, Data, append, Bool, Spacer, Image, ID, Int, Sendable, Task,
RoundedRectangle, opacity, NSNumber, contains, CKRecord, ForEach, Color,
trimmingCharacters, Section, navigationTitle, ToolbarItem, ModelContainer,
weight, Capsule, Void, navigationBarTitleDisplayMode, set, Equatable, overlay,
ModelConfiguration, buttonStyle, Array, addingTimeInterval, listRowBackground,
stroke, Double, dateComponents, flatMap, Label, max, print, Circle, disabled,
lineLimit, toolbar, fontWeight, URL, sheet, multilineTextAlignment, CGFloat,
Error, NavigationStack, Divider, CKContainer, removeObject, environment,
TextField, Set, resume, ScrollView, ZStack, modifyRecordZones, CKRecordZone,
ModelContext, Calendar, deleteRecord, PrivateKey, component, TimeZone,
Rectangle, min, clipShape, CaseIterable, add, forEach, defer, enumerated,
uppercased, removeValue, reduce, onChange, Picker, Logger, CKDatabase,
Reference, scrollContentBackground, Form, DateFormatter, UInt8, stringArray,
DateComponents, pickerStyle, isDateInToday, Codable, compactMap, month,
NotificationInfo, Identifiable, system, isDate, contentShape, abs, Binding,
Any, withCheckedThrowingContinuation, Group, alert, modifyRecords, appending,
strokeBorder, ZoneConfiguration, CKFetchRecordZoneChangesOperation,
ProgressView, hasPrefix, CKRecordValue, unarchivedObject, archivedData,
CKRecordZoneSubscription, Toggle, List, UNMutableNotificationContent,
animation, CKShare, SymmetricKey, split, UNNotificationRequest,
setTaskCompleted, year, accessibilityLabel, ContentUnavailableView,
TimeInterval, unlock, withUnsafeBytes, SecItemDelete, joined, fatalError,
JSONDecoder, removeAll, withAnimation, listRowInsets, EdgeInsets,
confirmationDialog, NavigationLink, StrokeStyle, CLLocationCoordinate2D,
Never, JSONEncoder, DatePicker, onTapGesture, GeometryReader, NumberFormatter,
Dictionary, timeIntervalSince, write, removeFirst, prepare, submit,
presentationDetents, navigationDestination, LinearGradient, UInt64,
keyboardType, rotationEffect, CLLocation, SortDescriptor, kerning, Query,
checkCancellation, Float, object, BGAppRefreshTaskRequest, rounded, UIImage,
fixedSize, Hashable, bold, suffix, lineSpacing, minimumScaleFactor, italic,
resizable, textInputAutocapitalization, async, tabItem, SecItemAdd, unhandled,
Curve25519, KeyAgreement, shadow, range, EKEventStore,
requestFullAccessToEvents, jpegData, CGSize, Stepper, swipeActions,
LazyVGrid, GridItem, trim, HKHealthStore, isHealthDataAvailable, TabView,
sharedInstance, UInt32, scaledToFit, Slider, completionHandler,
notificationOccurred, requestAuthorization, CFTypeRef, SecItemCopyMatching,
EmptyView, URLComponents, URLQueryItem, dictionary, EKEvent,
UNCalendarNotificationTrigger, removePendingNotificationRequests,
subtracting, NSPredicate, CKQuerySubscription, TextEditor, ScrollViewReader,
scrollTo, UIGraphicsImageRenderer, draw, CGRect, LazyVStack, strikethrough,
safeAreaInset, focused, withCheckedContinuation, ignoresSafeArea, canOpenURL,
HKQuantityType, tabViewStyle, SFSpeechRecognizer, setActive, invalidate,
SealedBox, NSLock, base64EncodedString, textSelection, Menu, allSatisfy
```

- [ ] **Step 1: Write the failing test**

```ts
// tests/adapters/swift/sdkSymbols.test.ts
import { describe, expect, it } from "vitest";
import { SWIFT_SDK_SYMBOLS } from "../../../src/adapters/swift/sdkSymbols.js";

describe("SWIFT_SDK_SYMBOLS", () => {
  it("classifies well-known SwiftUI and Foundation vocabulary", () => {
    expect(SWIFT_SDK_SYMBOLS.get("View")).toBe("SwiftUI");
    expect(SWIFT_SDK_SYMBOLS.get("Date")).toBe("Foundation");
    expect(SWIFT_SDK_SYMBOLS.get("String")).toBeDefined();
  });

  it("does not claim an obviously project-shaped name", () => {
    expect(SWIFT_SDK_SYMBOLS.has("NotificationInfo")).toBe(false);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

- [ ] **Step 3: Build the table**, grouping by framework, dropping any name you
  could not confidently verify as system vocabulary during Step 1's review.

- [ ] **Step 4: Extend `assignTier`**

```ts
// tiers.ts — inside the candidates.length === 0 branch, before the plain
// UNRESOLVED return. ref.scopeHint is the Swift discriminator: TypeScript
// references never set it.
if (ref.scopeHint) {
  const framework = SWIFT_SDK_SYMBOLS.get(ref.name);
  if (framework) {
    return { tier: "EXTERNAL", confidence: 1 };
    // resolver.ts must set packageOrLib from this table lookup, not from
    // `binding`, when binding is null — see the Files note above.
  }
}
```

Match this to `assignTier`'s actual current shape rather than pasting
verbatim; the important part is the discriminator (`ref.scopeHint` present)
and that it runs only in the zero-candidate branch.

- [ ] **Step 5: Fix the resolver's EXTERNAL branch** so `packageOrLib` is
  sourced correctly for both origins — a TypeScript import binding, and a
  Swift SDK-table match — instead of relying on an unchecked cast.

- [ ] **Step 6: Add resolver-level tests** confirming a zero-candidate Swift
  reference to `"View"` produces an `external_ref` row with `packageOrLib:
  "SwiftUI"`, not an `unresolved_ref` row.

- [ ] **Step 7: Run the full suite** — TypeScript behaviour and both benchmark
  suites must be unaffected; this only changes the zero-candidate path and only
  when `scopeHint` is present.

- [ ] **Step 8: Commit** — `feat: classify known Swift SDK references as EXTERNAL`

### Task 6: Re-run the Task 4 gate

**Files:** Modify `probes/swift-narrowing/FINDINGS.md`

This must be a fresh, honest run with `probes/swift-narrowing/measure.ts` (or
its logical successor after Task 5's changes) against the same corpus at the
same size (376 files / 39,136 lines) — not a recomputation from Task 4's
stored numbers, and not the retroactive 18.2% estimate above, which was never
more than a hypothesis for why this task exists.

- [ ] **Step 1: Run the measurement** and record the real tier distribution.
  Expect it to land somewhere better than 65.09% and worse than the 18.2%
  estimate — the estimate assumed perfect table coverage, and Step 3 of Task 5
  deliberately dropped uncertain names.

- [ ] **Step 2: Append the result to `FINDINGS.md`** as a new dated section.
  **Do not edit or remove the original Task 4 verdict or the controller note**
  — this is a new measurement under a corrected adapter, not a correction of
  the old one.

- [ ] **Step 3: Apply the Task 4 thresholds, unchanged**, exactly as committed
  in `04c316b`. No threshold may move because Task 5 happened.

- [ ] **Step 4: Commit** — `test: re-run the Swift narrowing gate with EXTERNAL classification`

**If this returns PASS:** continue to Task 7. **If MARGINAL or FAIL:** stop and
report — the same rule Task 4 followed the first time.

---


### Task 7: Assemble the adapter and route `.swift`

**Only if Task 6 returned PASS.**

**Files:** Create `src/adapters/swift/index.ts`, `tests/adapters/swift/adapter.test.ts`; modify `src/adapters/registry.ts`, `src/index/pipeline.ts`

- [ ] **Step 1: Write the failing test** — a fixture Swift package indexes end to end, produces symbols and edges, and `implementations_of` on a protocol returns its conformers
- [ ] **Step 2: Run it and confirm it fails**
- [ ] **Step 3: Implement** — assemble `LanguageAdapter`, route `.swift` in the registry, and make the pipeline select an adapter by path rather than assuming TypeScript
- [ ] **Step 4: Run the full suite plus both benchmarks** — TypeScript results must be byte-identical
- [ ] **Step 5: Commit** — `feat: add the Swift language adapter`

---


---

### Task 8: Report the upstream grammar bugs

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
- [ ] **Task 5: zero-candidate SDK references classified EXTERNAL, not UNRESOLVED**
- [ ] **Task 6: gate re-run fresh against the unchanged Task 4 thresholds, appended not overwritten**
- [ ] If Task 6 PASS: `.swift` indexes end to end and `implementations_of` works on protocols
- [ ] TypeScript tier distribution and both benchmarks unchanged
- [ ] `npm run typecheck && npm test` clean

## Known risks

| Risk | Signal | Response |
|---|---|---|
| Narrowing is insufficient | Task 4 returns FAIL | Stop. Swift needs SourceKit-LSP; that is a different plan. |
| Narrowing removes a correct candidate | Recall falls on a Swift fixture | Rules 1 and 2 follow language rules, not preference. If a correct target is removed, the rule is wrong — fix it, do not loosen the cap. |
| TypeScript regresses | TS tier counts or benchmarks move | `scopeHint` is optional; absent it, behaviour must be identical. Treat any movement as a bug in this plan. |
| Stable keys drift from TypeScript's scheme | Cross-language queries behave oddly | Keys are `{lang}:{relpath}#{scope_chain}` in both. The prefix differs; the shape does not. |
