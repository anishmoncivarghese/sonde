# CodeGraph vs. agentic search — 12-task benchmark

Generated: 2026-08-20T21:12:06.709Z

Adversarially selected per spec §10 Layer 3, not drawn uniformly — a uniform sample would show parity on tasks modern agentic search is already good at and invite the wrong conclusion. Selection criteria, disclosed as the spec requires:

- Transitive impact at depth >= 2 (4 tasks)
- `implementations_of` across a wide interface (2 tasks)
- Completeness claims — "what did I miss" (2 tasks)
- Test selection for a change (2 tasks)
- Semantic-disadvantage controls (2 tasks) — behavioral description with no identifier overlap, and a synonym-heavy domain query; these two are the classes v0.1's lexical+structural retrieval is *expected to lose*, per spec §2.1's falsifiable deferral of semantic search.

## Summary

| Baseline | Mean recall@k | Mean tool calls | Mean input tokens | Mean output tokens | Mean latency (ms) | Mean tier utility |
|---|---:|---:|---:|---:|---:|---:|
| CodeGraph | 0.681 | 1.0 | 17 | 211 | 2 | 1.000 |
| Agentic search | PENDING — live baseline not yet run (0/12 traces) | | | | | |

## Per-task recall@k

| Task | Category | CodeGraph | Agentic search |
|---|---|---:|---:|
| impact-notifier-signature | transitive_impact | 0.17 | PENDING |
| impact-queue-enqueue | transitive_impact | 1.00 | PENDING |
| impact-dispatch-two-hop | transitive_impact | 1.00 | PENDING |
| impact-retry-policy | transitive_impact | 1.00 | PENDING |
| implementations-of-notifier | wide_interface | 1.00 | PENDING |
| implementations-of-notifier-completeness | wide_interface | 1.00 | PENDING |
| completeness-queue-callers | completeness | 1.00 | PENDING |
| completeness-notifier-references | completeness | 0.00 | PENDING |
| tests-for-dispatcher-change | test_selection | 1.00 | PENDING |
| tests-for-retry-policy-change | test_selection | 1.00 | PENDING |
| semantic-backoff-behavior | semantic_disadvantage | 0.00 | PENDING |
| semantic-alerting-synonym | semantic_disadvantage | 0.00 | PENDING |
