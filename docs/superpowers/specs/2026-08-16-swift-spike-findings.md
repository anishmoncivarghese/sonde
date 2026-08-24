# Swift adapter spike findings

Date: 2026-08-17  
Target: a real Swift application (376 files, 39,136 lines), referred to below as the Swift corpus  
Grammar: `tree-sitter-wasms@0.1.12/tree-sitter-swift.wasm`

## Method

Part A parsed the lexicographically first 200 of 376 Swift files in the corpus. The
probe used only file bytes and Tree-sitter syntax, matching the proposed pure
adapter boundary. Node 24.15.0 exhausted memory while V8 optimized the 3 MB
Swift WASM grammar, before parsing began. Re-running with `node --liftoff-only`
used V8's baseline WASM compiler and completed against the same grammar and
source bytes.

Part B sampled 20 real call references from the same 200-file slice. The sample
is stratified across bare calls, ordinary member calls, and protocol-gateway
method calls in Calendar, Journal, Friction, and Expenses. Candidate counts are
the number of same-short-name declarations in that slice's module-wide symbol
table. Tiers apply the planned Task 12 rules with no same-module import binding:
one bare candidate is `LEXICAL`; ambiguous bare calls and every member call with
candidates are `HEURISTIC`; zero candidates are `UNRESOLVED`.

## Part A — pure extraction

| Metric | Result |
|---|---:|
| Files attempted | 200 |
| Clean parses | 153 |
| Parses with errors | 47 |
| Parse-error rate | 23.5% |
| Type declarations | 337 |
| Extensions | 21 |
| Extensions with named type | 21 |
| Conformances | 215 |
| Function declarations | 658 |
| Result-builder bodies detected | 921 |
| Property-wrapper modifier groups detected | 366 |

### Criteria

1. **PASS — extension attribution:** 21/21 extensions (100%) expose a named
   declaring type, above the 95% threshold.
2. **FAIL — parse reliability:** the 23.5% error rate exceeds the 5% threshold.
   Result builders and property wrappers were still detected in large numbers,
   so those constructs do not erase symbol boundaries wholesale, but this
   pinned grammar is not reliable enough for production Swift indexing.
3. **PASS, narrowly — extraction shape:** symbols, references, imports, exports,
   and diagnostics can represent the observed per-file syntax. The resolution
   exercise below finds missing scope evidence rather than a missing syntax
   record.

Part A verdict: pure per-file extraction remains viable as an architecture, but
the pinned Swift grammar/runtime combination fails the production accuracy gate
and must be upgraded or repaired before the v0.2 adapter.

## Part B — resolution paper exercise

`candidate_count` is computed from declarations in the same deterministic
200-file slice, not from framework type information.

| # | Kind | Real reference | Location | Candidates | Planned tier |
|---:|---|---|---|---:|---|
| 1 | bare | `envelope(for: event)` | `CalendarCoordinator.swift:49` | 12 | `HEURISTIC` |
| 2 | bare | `envelope(for: entry)` | `JournalCoordinator.swift:92` | 12 | `HEURISTIC` |
| 3 | bare | `envelope(for: c)` | `FrictionCoordinator.swift:48` | 12 | `HEURISTIC` |
| 4 | bare | `envelope(for: expense)` | `ExpensesCoordinator.swift:30` | 12 | `HEURISTIC` |
| 5 | bare | `CalendarEvent()` | `CalendarCoordinator.swift:221` | 1 | `LEXICAL` |
| 6 | member | `modelContext.save()` | `CalendarCoordinator.swift:47` | 7 | `HEURISTIC` |
| 7 | member | `modelContext.fetch(...)` | `CalendarCoordinator.swift:82` | 0 | `UNRESOLVED` |
| 8 | member | `modelContext.insert(entry)` | `JournalCoordinator.swift:67` | 0 | `UNRESOLVED` |
| 9 | member | `modelContext.delete(event)` | `CalendarCoordinator.swift:70` | 0 | `UNRESOLVED` |
| 10 | member | `decryptedBodies.removeAll()` | `JournalCoordinator.swift:174` | 0 | `UNRESOLVED` |
| 11 | protocol member | `gateway.saveEvent(...)` | `CalendarCoordinator.swift:49` | 5 | `HEURISTIC` |
| 12 | protocol member | `gateway.deleteEvent(...)` | `CalendarCoordinator.swift:73` | 6 | `HEURISTIC` |
| 13 | protocol member | `gateway.fetchChanges(...)` | `CalendarCoordinator.swift:96` | 24 | `HEURISTIC` |
| 14 | protocol member | `gateway.ensureSubscription()` | `CalendarCoordinator.swift:178` | 28 | `HEURISTIC` |
| 15 | protocol member | `gateway.saveEntry(...)` | `JournalCoordinator.swift:92` | 6 | `HEURISTIC` |
| 16 | protocol member | `gateway.fetchChanges(...)` | `JournalCoordinator.swift:157` | 24 | `HEURISTIC` |
| 17 | protocol member | `gateway.ensureSubscription()` | `JournalCoordinator.swift:45` | 28 | `HEURISTIC` |
| 18 | protocol member | `gateway.saveExpense(...)` | `ExpensesCoordinator.swift:30` | 4 | `HEURISTIC` |
| 19 | protocol member | `gateway.saveBudget(...)` | `ExpensesCoordinator.swift:44` | 4 | `HEURISTIC` |
| 20 | protocol member | `gateway.fetchChanges(...)` | `ExpensesCoordinator.swift:61` | 24 | `HEURISTIC` |

### Distribution

| Outcome | Count | Share |
|---|---:|---:|
| `LEXICAL` | 1 | 5% |
| `HEURISTIC`, `candidate_count > 3` | 15 | 75% |
| `UNRESOLVED` | 4 | 20% |

The decision threshold is more than 60% high-fanout heuristic references. The
observed 75% crosses it. Swift's module-wide `internal` visibility gives the
import table no signal for these same-module calls; receiver type, SwiftPM
target, and `private`/`fileprivate` scope are the missing narrowing evidence.

## Verdict and contract amendment

The import-centric resolver is insufficient for Swift. `ReferenceRecord` now
accepts an optional `scopeHint: string | null`. A Swift adapter can populate it
with SwiftPM target and file/access-control scope; TypeScript may omit it. This
keeps extraction pure while allowing the shared resolver to narrow candidates
before assigning evidence tiers.

The amendment does not relax the core tier rule: member access remains
`HEURISTIC` without compiler evidence. A scope hint narrows the candidate set;
it does not promote a member call to `LEXICAL`.
