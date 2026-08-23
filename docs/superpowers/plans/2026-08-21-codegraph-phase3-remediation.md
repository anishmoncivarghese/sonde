# Sonde Phase 3 Review Remediation Plan

**Goal:** Correct the benchmark-validity findings from the Task 1–11 review,
then complete the live-baseline and two-client acceptance gates without
publishing unsupported claims.

**Authoritative inputs:**

- `docs/superpowers/specs/2026-08-16-sonde-design.md`, especially §10 and
  §12.
- `docs/superpowers/plans/2026-08-20-sonde-benchmark-harness.md` for the
  original Phase 3 implementation.
- `.whyline/decisions.md` for the review findings and prior tradeoffs.

## Constraints

- TDD: every behavioral correction starts with a failing regression test.
- Commit each remediation checkpoint independently and record its decisions in
  Whyline.
- Keep all fixture and trace reads behind `RepoBoundary`.
- Do not run paid model calls or upload a target repository until the
  deterministic benchmark is valid and the external action is explicitly
  approved.
- Do not mark spec §12 items 2 or 5 complete from a checklist or a `PENDING`
  report.

## Task 1: Repair fixture topology and ground truth

1. Add explicit production call chains so four distinct impact tasks contain
   required evidence at depth 2 or greater.
2. Replace the false `nextDelay` true-negative with a real transitive impact
   task that includes its test caller and production callers.
3. Make the queue completeness task require both readers and writers and allow
   its deterministic Sonde baseline to issue the necessary queries.
4. Attribute `Notifier` type references to their actual enclosing file/class,
   not unrelated functions in the same file.
5. Extend ground-truth tests to validate declared impact depths against the
   indexed graph and lock the corrected evidence sets.

**Commit:** `fix: repair benchmark ground truth and transitive tasks`

## Task 2: Correct benchmark scoring

1. Pack Sonde evidence to each task's `maxContextBudgetTokens` before
   scoring, so recall@k has an enforced context bound.
2. Count distractor hits and publish a deterministic preliminary-success proxy:
   full required recall with zero distractors.
3. Replace free substring trace matching with identifier/path-boundary matching
   so `restart` cannot satisfy required symbol `start`.
4. Enforce a cumulative tool-result context budget in the live agentic runner
   and record its consumed context tokens in `AgentTrace`.
5. Redefine scalar tier utility as marginal required recall contributed by
   `HEURISTIC` evidence, and retain per-tier required-hit counts so the published
   number cannot collapse to an automatic 1.000.

**Commit:** `fix: make benchmark scoring budgeted and auditable`

## Task 3: Harden publication

1. Reject duplicate, missing, wrong-baseline, wrong-category, non-finite, and
   out-of-range results before rendering a report.
2. Reject malformed trace JSON before scoring it.
3. Publish mean distractor hits, preliminary success rate, and the corrected
   tier-utility definition.
4. Regenerate `BENCHMARK.md` and manually inspect every deterministic task row.

**Commit:** `fix: validate and republish benchmark results`

## Task 4: Deterministic acceptance

Run, under Node from `.nvmrc`:

```sh
npm test
npm run typecheck
npm run build
npm run bench:harness
npm audit --omit=dev
```

Review the complete remediation range, run `git diff --check`, and confirm that
only intended files are changed.

## Task 5: External acceptance

Only after Tasks 1–4 pass:

1. Run three live agentic repetitions for each of the 12 tasks using the
   synthetic medium fixture, preserving every repetition and an explicitly
   selected aggregate trace.
2. Regenerate and commit `BENCHMARK.md` with real agentic numbers.
3. Verify all three MCP tools in Claude Code and MCP Inspector against an
   approved target, then fill and commit `docs/mcp-client-verification.md`.
4. Leave either gate visibly open if credentials, budget, client access, or
   source-sharing authorization is unavailable.

**Commit:** `bench: publish the live Phase 3 acceptance results`

## Completion criteria

- All four transitive-impact tasks have verified required evidence at depth
  `>= 2`.
- Every ground-truth field affects validation or scoring.
- Demonstrated false-positive answers no longer receive full recall.
- Tier utility varies with the evidence tiers that actually contribute recall.
- The deterministic suite, typecheck, build, report generation, and production
  dependency audit pass.
- Spec §12 items 2 and 5 are marked complete only after their external evidence
  is recorded.
