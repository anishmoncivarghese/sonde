## Gate (fixed before measurement)

Baseline, from the spike's 20 references re-scored against AMBIGUITY_CAP=8:
LEXICAL 5%, HEURISTIC 30%, UNRESOLVED 65%.

- PASS: UNRESOLVED <= 30% AND LEXICAL + HEURISTIC >= 70%. Continue to Task 5.
- MARGINAL: UNRESOLVED 31-50%. Record and stop; report to the human.
- FAIL: UNRESOLVED > 50%. Swift needs compiler-grade evidence
  (SourceKit-LSP / IndexStoreDB), which is out of scope. Record and stop.

No threshold may be adjusted after seeing a result.

## Measurement

Measured 2026-08-24 on a real Swift application: **376 Swift files / 39,136
lines**. The corpus name and filesystem path are deliberately omitted.

The probe used `alex-pinkus/tree-sitter-swift` 0.7.3 and the Task 2/3
extractors. It recovered 7,979 symbols and emitted 18,914 call, type-reference,
and conformance references. Thirty files (7.98%) carried parse diagnostics;
recovered declarations from those files remained in the measurement.

For each reference, the baseline candidate set contained every declaration
with the same short name. The after-narrowing set applied only the three rules
fixed by the plan, before `AMBIGUITY_CAP=8`. No compiler, language server,
Xcode project metadata, or inferred receiver type was consulted.

### Tier distribution

| Tier | Before | Before share | After | After share |
|---|---:|---:|---:|---:|
| `LEXICAL` | 2,950 | 15.60% | 2,949 | 15.59% |
| `HEURISTIC` | 3,373 | 17.83% | 3,654 | 19.32% |
| `UNRESOLVED` | 12,591 | 66.57% | 12,311 | **65.09%** |
| **Placed (`LEXICAL + HEURISTIC`)** | **6,323** | **33.43%** | **6,603** | **34.91%** |

Narrowing reduced total candidate instances from 52,339 to 42,761. It affected
1,801 references and removed 9,578 candidates, but moved only 280 references
out of `UNRESOLVED`.

### Evidence available to each rule

| Rule | Signal | Effect |
|---|---|---|
| 1 — cross-file `private` / `fileprivate` | Available | Removed 9,332 candidates across 1,768 references |
| 2 — SwiftPM target boundary | **No signal** | 0 references carried a module hint; removed 0 candidates |
| 3 — explicit local receiver annotation | Available on 298 references | Removed 246 candidates across 76 references |

Rule 2 was not tested. This corpus is an Xcode project, not a SwiftPM package:
it has no `Package.swift` or `Sources/<Target>/` layout, and target membership
lives in Xcode project metadata. The probe deliberately did not parse that
metadata, because doing so would change the evidence source after the gate was
fixed.

## Verdict: FAIL with rule 2 untested

The unchanged gate says `UNRESOLVED > 50%` is FAIL. The observed after-narrowing
share is **65.09%**, while placed references total only **34.91%**. Tasks 5 and
6 stop here; the adapter is not assembled or routed.

This result proves that rules 1 and 3 alone are insufficient on this corpus. It
does **not** prove that Swift requires SourceKit-LSP or IndexStoreDB, because the
SwiftPM-target rule had no opportunity to fire. A representative SwiftPM
corpus is required before that stronger conclusion is safe.

Strict typechecking and the complete 368-test suite passed after the narrowing
change, including the contract that references without `scopeHint` preserve
the TypeScript candidate list and tier behavior.

---

## Controller note added after scoring: the measurement conflates two categories

The verdict above is correct given how the measurement was built, and it is
**not overridden here** — Task 4's own thresholds were fixed before the run and
apply as recorded. This note identifies a gap in the *plan*, not a re-judging
of the result.

The gap: the plan's Task 3 never gave Swift an `EXTERNAL` outcome. Spec §4.4
requires one — a reference resolving outside the indexed repository must be
classified `EXTERNAL`, never counted toward `UNRESOLVED`, because otherwise the
completeness signal the tier system exists to provide becomes meaningless
(this is the exact failure §4.4 was written to prevent for TypeScript, where
`node_modules` references would otherwise flood the unresolved count). Swift's
adapter has no equivalent: every reference to the standard library, SwiftUI,
Foundation, or any other SDK falls through to zero candidates and is scored
`UNRESOLVED`, identically to a genuine same-module ambiguity.

A read-only breakdown of the already-recorded 18,914 references (recomputed
from the committed extractors, not from a new run) splits the 12,591
`UNRESOLVED` count:

| Cause | Count | Share of UNRESOLVED |
|---|---:|---:|
| Zero candidates anywhere in the corpus | 10,841 | 86.1% |
| More than `AMBIGUITY_CAP` (8) same-named candidates | 1,750 | 13.9% |

The zero-candidate names were sampled, not assumed. The 30 most frequent are
`String`, `font`, `Date`, `foregroundStyle`, `UUID`, `View`, `fetch`, `insert`,
`Button`, `frame`, `VStack`, `HStack`, `Data`, `append`, `Bool`, `Spacer`,
`Image`, `ID`, `Int`, `Sendable`, `Task`, `RoundedRectangle`, `opacity`,
`NSNumber`, `contains`, `CKRecord`, `ForEach`, `Color`, `trimmingCharacters`,
`Section` — Swift standard library, SwiftUI, Foundation, and CloudKit
vocabulary. None of these are declared anywhere in the corpus, and none of the
three narrowing rules could ever have addressed them: narrowing only removes
candidates from a non-empty set.

Recomputing the gate with zero-candidate references excluded from the
denominator (i.e. correctly treated as `EXTERNAL`, matching TypeScript's
treatment of `node_modules`) rather than counted as `UNRESOLVED`:

| | Value |
|---|---:|
| In-repo references (18,914 − 10,841) | 8,073 |
| Still over the ambiguity cap after narrowing | 1,470 |
| `UNRESOLVED` share | 18.2% |
| Placed (`LEXICAL` + `HEURISTIC`) share | 81.8% |

That would be a **PASS** under the thresholds fixed in this file.

**This is not a re-score and it does not change the recorded verdict.** It is
a retroactive count over already-collected data, not a fresh, honestly-run
measurement against a rule that did not exist when Task 4 ran — the same
category of thing as recomputing an oracle report after fixing a scoring bug,
not as loosening a threshold after seeing a result. Treat it as a hypothesis:
build a real `EXTERNAL` classifier for Swift (a curated table of standard
library and major SDK symbol names — Foundation, SwiftUI, UIKit, CloudKit,
SwiftData, Combine — not a guess dressed as one), then re-run Task 4 fresh
against the fixed thresholds already committed here. Only that re-run is
authoritative.
