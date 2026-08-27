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
