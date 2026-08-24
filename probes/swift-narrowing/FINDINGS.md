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
