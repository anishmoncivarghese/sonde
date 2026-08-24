## Gate (fixed before measurement)

Baseline, from the spike's 20 references re-scored against AMBIGUITY_CAP=8:
LEXICAL 5%, HEURISTIC 30%, UNRESOLVED 65%.

- PASS: UNRESOLVED <= 30% AND LEXICAL + HEURISTIC >= 70%. Continue to Task 5.
- MARGINAL: UNRESOLVED 31-50%. Record and stop; report to the human.
- FAIL: UNRESOLVED > 50%. Swift needs compiler-grade evidence
  (SourceKit-LSP / IndexStoreDB), which is out of scope. Record and stop.

No threshold may be adjusted after seeing a result.
