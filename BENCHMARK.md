# CodeGraph vs. agentic search — 12-task benchmark

Generated: 2026-08-20T21:49:03.368Z

Adversarially selected per spec §10 Layer 3, not drawn uniformly — a uniform sample would show parity on tasks modern agentic search is already good at and invite the wrong conclusion. Selection criteria, disclosed as the spec requires:

- Transitive impact at depth >= 2 (4 tasks)
- `implementations_of` across a wide interface (2 tasks)
- Completeness claims — "what did I miss" (2 tasks)
- Test selection for a change (2 tasks)
- Semantic-disadvantage controls (2 tasks) — behavioral description with no identifier overlap, and a synonym-heavy domain query; these two are the classes v0.1's lexical+structural retrieval is *expected to lose*, per spec §2.1's falsifiable deferral of semantic search.

## Methodology

Recall@k scores only evidence admitted by each task's disclosed context-token budget. Preliminary success requires recall@k = 1 and zero distractor hits; it is a deterministic proxy, not a validated semantic success judge. Tier utility is the fraction of all required evidence contributed by HEURISTIC edges. C/L/H/U required hits report compiler, lexical, heuristic, and unranked matches respectively.

## Summary

| Baseline | Mean recall@k | Preliminary success rate | Mean distractors | Mean helpful | Mean tool calls | Mean input tokens | Mean output tokens | Mean context tokens | Mean latency (ms) | Mean heuristic utility |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| CodeGraph | 0.698 | 0.667 | 0.00 | 0.17 | 1.1 | 17 | 222 | 222 | 2 | 0.302 |
| Agentic search | PENDING — live baseline not yet run (0/12 traces) | | | | | | | | | |

## Per-task recall@k

| Task | Category | CodeGraph recall | CodeGraph success | C/L/H/U required hits | Agentic recall | Agentic success |
|---|---|---:|:---:|---:|---:|:---:|
| impact-notifier-signature | transitive_impact | 0.38 | no | 0/1/2/0 | PENDING | PENDING |
| impact-queue-enqueue | transitive_impact | 1.00 | yes | 0/1/2/0 | PENDING | PENDING |
| impact-dispatch-two-hop | transitive_impact | 1.00 | yes | 0/1/1/0 | PENDING | PENDING |
| impact-retry-policy | transitive_impact | 1.00 | yes | 0/4/0/0 | PENDING | PENDING |
| implementations-of-notifier | wide_interface | 1.00 | yes | 0/5/0/0 | PENDING | PENDING |
| implementations-of-notifier-completeness | wide_interface | 1.00 | yes | 0/3/0/0 | PENDING | PENDING |
| completeness-queue-callers | completeness | 1.00 | yes | 0/0/2/0 | PENDING | PENDING |
| completeness-notifier-references | completeness | 0.00 | no | 0/0/0/0 | PENDING | PENDING |
| tests-for-dispatcher-change | test_selection | 1.00 | yes | 0/0/0/1 | PENDING | PENDING |
| tests-for-retry-policy-change | test_selection | 1.00 | yes | 0/0/0/1 | PENDING | PENDING |
| semantic-backoff-behavior | semantic_disadvantage | 0.00 | no | 0/0/0/0 | PENDING | PENDING |
| semantic-alerting-synonym | semantic_disadvantage | 0.00 | no | 0/0/0/0 | PENDING | PENDING |
