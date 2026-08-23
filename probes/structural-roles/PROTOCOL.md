# Structural roles probe — protocol

Fixed 2026-08-23, before any query was run or any answer seen.

## Task format
The human supplies `questions.md` (N >= 5 behavioural questions about
tests/fixtures/repos/large) and `answers.md` (the qualified name of the symbol
that answers each). The implementer may not read answers.md until predictions
are committed.

## What counts as a hit
A question is a HIT when the answer symbol appears in the **top 3** results of a
structural query written without knowledge of that answer.

## Success thresholds
- **PASS (build the feature):** >= 60% of questions are hits, AND at least one
  reusable query shape accounts for >= 2 hits. A collection of one-off queries,
  each tailored to its question, is NOT a pass — it is fitting.
- **INCONCLUSIVE:** 30-59% hits. Record and stop; do not build.
- **FAIL (close the question):** < 30% hits. Record alongside the embeddings
  finding in spec §2.2 and stop.

## Anti-fitting rules
1. Predictions are committed BEFORE answers.md is opened. `git log` is the audit trail.
2. Every query attempted is recorded, including failures.
3. A query may not name the expected answer symbol in its text.
4. Query shapes are described in words before being written in SQL.
5. If a query is revised after seeing its own results, that revision is recorded
   and the question is marked TUNED and excluded from the hit count.
