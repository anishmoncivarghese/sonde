# Structural Roles — Blind Probe Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **This is an experiment, not a feature.** Its deliverable is a written finding.
> Do not build a query API, an MCP tool, or a CLI command as part of it. If the
> experiment succeeds, a separate plan will scope the feature.

**Goal:** Establish, without fitting the answer, whether structural graph patterns can answer the behavioural queries that embeddings measurably cannot.

**Spec:** `docs/superpowers/specs/2026-08-16-codegraph-design.md` §2.2 (the measured failure of semantic retrieval).

## Background: why this probe exists, and why it must be blind

The benchmark's semantic tasks score 0.00 for CodeGraph. Local embeddings were built and measured against them and do not help — two models across four document configurations, with the wrong answer ranked first in three of them (spec §2.2). Embeddings are a closed question.

A structural hypothesis then looked promising. On the large fixture, the query *"where does this library decide which routing strategy to use at runtime?"* has the answer `SmartRouter`, and this SQL uniquely identified it:

```sql
-- types that both IMPLEMENT an interface and HOLD a member referencing it
SELECT DISTINCT impl.qualified_name
FROM edge e
  JOIN symbol impl  ON impl.id  = e.src_symbol_id
  JOIN symbol iface ON iface.id = e.dst_symbol_id
WHERE e.kind = 'IMPLEMENTS' AND iface.qualified_name = 'Router'
  AND EXISTS (
    SELECT 1 FROM edge r
      JOIN symbol member ON member.id = r.src_symbol_id
      JOIN symbol tgt    ON tgt.id    = r.dst_symbol_id
    WHERE r.kind = 'REFERENCES' AND tgt.qualified_name = 'Router'
      AND member.qualified_name LIKE impl.qualified_name || '.%'
  );
-- returns exactly: SmartRouter
```

**That result is not evidence yet.** The query was written by someone who already knew the answer was `SmartRouter`, and was shaped until it produced `SmartRouter`. Fitting a query to a known answer proves nothing about queries written for unknown ones.

Two earlier confident predictions in this project were wrong when measured: that the small fixture explained the benchmark result (it did not — a real 19k-line repo gave the same outcome), and that embeddings would close the semantic gap (they did not). This probe is designed so a third wrong prediction is *detected* rather than shipped.

## The blinding mechanism

The protocol relies on **git commit order as the audit trail**: predictions are committed before the answer key is opened. A reviewer can verify the sequence with `git log`, so the discipline is checkable rather than merely promised.

- The **human** authors the tasks and the answer key.
- The **implementer** sees only the questions until predictions are committed.
- Success thresholds are fixed in Task 1, before any result exists.

**Do not open `answers.md` before Task 4 says to.** If you open it early, say so in the finding — a disclosed broken blind is recoverable; an undisclosed one makes the whole exercise worthless.

## Global Constraints

- **Node 22+.** Run `nvm use` in every shell before any `node`/`npm`/`npx` command; this machine's default is v20 and will fail with `EBADENGINE`.
- The large fixture must be present: `npm run bench:fixture` (Hono v4.6.3, pinned by tag and sha256).
- Index it first: `npm run build && node dist/cli/main.js index tests/fixtures/repos/large`.
- **Read-only on `src/`.** This probe adds no production code. Everything lives under `probes/structural-roles/`.
- **Record every query verbatim**, including the ones that fail. A probe that reports only its successes is fitting by omission.
- Conventional commits.

---

### Task 1: Fix the success criteria before any data exists

**Files:**
- Create: `probes/structural-roles/PROTOCOL.md`

Thresholds chosen after seeing results are not thresholds. Write them first.

- [ ] **Step 1: Write the protocol document**

Create `probes/structural-roles/PROTOCOL.md` containing exactly these criteria:

```markdown
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
```

- [ ] **Step 2: Commit before anything else happens**

```bash
git add probes/structural-roles/PROTOCOL.md
git commit -m "test: fix structural-probe success criteria before collecting data"
```

---

### Task 2: Obtain the questions (human input required)

**Files:**
- Create: `probes/structural-roles/questions.md`, `probes/structural-roles/answers.md`

- [ ] **Step 1: Request the tasks**

Ask the human for at least five behavioural questions about `tests/fixtures/repos/large` (Hono v4.6.3) — questions phrased the way a developer would ask, whose answers are specific symbols, and whose wording does **not** contain the answer's identifier.

Good shape: *"Which component turns a thrown error into an HTTP response?"*
Bad shape: *"What does HTTPException do?"* — the identifier is in the question.

State explicitly: **do not show the implementer the answers.** They go in `answers.md`, which stays closed until Task 4.

- [ ] **Step 2: Stop and wait**

This task cannot be completed without the human. If they are unavailable, report BLOCKED. **Do not invent the questions** — the implementer authoring both questions and queries reproduces exactly the fitting problem this probe exists to avoid.

- [ ] **Step 3: Commit the questions only**

```bash
git add probes/structural-roles/questions.md
git commit -m "test: add blind structural probe questions"
```

Leave `answers.md` uncommitted and unopened.

---

### Task 3: Write queries and record predictions blind

**Files:**
- Create: `probes/structural-roles/queries.sql`, `probes/structural-roles/predictions.md`

**Interfaces:**
- Consumes: the indexed large fixture. Find the database path with:
  ```bash
  node --import tsx -e "import {indexPathFor} from './src/index/cache.ts'; console.log(indexPathFor('tests/fixtures/repos/large'))"
  ```

- [ ] **Step 1: Describe the query shapes in words first**

In `predictions.md`, before writing SQL, describe the structural patterns you expect to be discriminating. Start from these, which are hypotheses rather than answers:

- **Delegator** — a type that implements interface `X` and holds a member typed `X`
- **Facade** — a type with high outbound `CALLS` fan-out to distinct files but few inbound callers
- **Entry point** — an exported symbol with inbound `IMPORTS` from many files and no inbound `CALLS`
- **Terminal handler** — a symbol that `REFERENCES` an error or exception type and is called from many places
- **Policy holder** — a symbol containing several sibling members that all `REFERENCE` the same interface

- [ ] **Step 2: Write the queries**

Put every query in `queries.sql` with a comment naming which question it targets. **No query may contain the identifier you believe is the answer.** Useful schema notes:

- `edge(src_symbol_id, dst_symbol_id, kind, tier, confidence)`
- `symbol(id, stable_key, qualified_name, short_name, kind, file_id)`
- `file(id, path)`
- Edge kinds: `CONTAINS`, `IMPORTS`, `CALLS`, `REFERENCES`, `IMPLEMENTS`, `INHERITS`, `TESTS`
- Member-level `IMPLEMENTS` edges exist (`RegExpRouter.add` → `Router.add`)
- `IMPORTS` edges are **file→file**; seed them with a file symbol (`ts:path#`), not a symbol key
- Exclude `benchmarks/` and `perf-measures/` — they are not library source and dominated an earlier semantic run

- [ ] **Step 3: Record the top 3 for every question**

For each question, run its query and record the top 3 results verbatim in `predictions.md`, plus the query shape used and how confident you are. Record questions you could not write a query for as `NO QUERY` — those count as misses, not as skips.

- [ ] **Step 4: Commit predictions before opening the answer key**

```bash
git add probes/structural-roles/queries.sql probes/structural-roles/predictions.md
git commit -m "test: record blind structural predictions before revealing answers"
```

**This commit is the audit trail. It must land before Task 4.**

---

### Task 4: Score against the answer key

**Files:**
- Create: `probes/structural-roles/RESULTS.md`

- [ ] **Step 1: Verify the blind held**

Run `git log --oneline -3` and confirm the predictions commit exists. If it does not, the blind is broken — say so at the top of `RESULTS.md` and mark every result as untrustworthy.

- [ ] **Step 2: Open `answers.md` and score**

For each question record: the answer, whether it appeared in the predicted top 3, at what rank, and which query shape found it.

- [ ] **Step 3: Apply the Task 1 thresholds without adjusting them**

Compute the hit rate. Check the reusability condition: does at least one query shape account for two or more hits? A set of one-off queries is a FAIL even at a high hit rate — that is fitting with extra steps.

Write the verdict as one of PASS / INCONCLUSIVE / FAIL exactly as Task 1 defined it. **Do not soften a FAIL into "promising."**

- [ ] **Step 4: Write the finding**

`RESULTS.md` must contain: the verdict, the per-question table, every query attempted including failures, which shapes generalised, and — if FAIL — the most plausible reason.

- [ ] **Step 5: Commit**

```bash
git add probes/structural-roles/RESULTS.md probes/structural-roles/answers.md
git commit -m "test: score the blind structural probe"
```

---

### Task 5: Record the outcome where it will be read

**Files:**
- Modify: `docs/superpowers/specs/2026-08-16-codegraph-design.md` (§2.2)

- [ ] **Step 1: Add the finding to the spec**

Append to §2.2, next to the embeddings result, so a future reader sees both attempts at the same gap and does not repeat either.

- [ ] **Step 2: Record the decision**

On PASS:
```bash
whyline note "Answer behavioural queries with structural role patterns rather than embeddings" \
  --because "a blind probe with success criteria fixed in advance found the answer in the top 3 for <N>% of questions using reusable query shapes, where two embedding models across four document configurations had ranked the wrong symbol first" \
  --rejected "further embedding models: measured dead end, spec section 2.2" \
  --file probes/structural-roles/RESULTS.md
```

On FAIL or INCONCLUSIVE:
```bash
whyline note "Close the behavioural-query gap as unsolved for v0.1" \
  --because "both candidate remedies were measured and failed: embeddings ranked the wrong symbol first across two models and four configurations, and structural role queries hit only <N>% under a blind protocol with criteria fixed in advance" \
  --rejected "ship a structural role feature anyway: the probe was designed to prevent exactly this" \
  --file probes/structural-roles/RESULTS.md
```

- [ ] **Step 3: Update the README only if the verdict is PASS**

The README currently states that behavioural queries score 0.00 and that an agentic loop is the better tool for them. **Change that sentence only on a PASS**, and only to describe what the probe measured.

- [ ] **Step 4: Commit**

```bash
git add docs/ README.md
git commit -m "docs: record the structural roles probe outcome"
```

---

## Completion criteria

- [ ] `PROTOCOL.md` committed before any query was run
- [ ] Questions authored by the human, not the implementer
- [ ] Predictions committed before `answers.md` was opened, provable from `git log`
- [ ] Every query recorded, failures included
- [ ] Verdict applies the Task 1 thresholds unchanged
- [ ] Outcome recorded in spec §2.2 and whyline whichever way it went
- [ ] No production code under `src/` changed

## Expected effort

Half a day, most of it waiting on the human for Task 2. The point is not the size of the experiment — it is that a negative result costs an afternoon instead of a sprint.
