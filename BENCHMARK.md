# Sonde vs. agentic search — 12-task benchmark

Generated: 2026-08-24T09:01:26.332Z

Adversarially selected per spec §10 Layer 3, not drawn uniformly — a uniform sample would show parity on tasks modern agentic search is already good at and invite the wrong conclusion. Selection criteria, disclosed as the spec requires:

- Transitive impact at depth >= 2 (4 tasks)
- `implementations_of` across a wide interface (2 tasks)
- Completeness claims — "what did I miss" (2 tasks)
- Test selection for a change (2 tasks)
- Semantic-disadvantage controls (2 tasks) — behavioral description with no identifier overlap, and a synonym-heavy domain query; these two are the classes v0.1's lexical+structural retrieval is *expected to lose*, per spec §2.1's falsifiable deferral of semantic search.

## Methodology

Recall@k scores only evidence admitted by each task's disclosed context-token budget. Preliminary success requires recall@k = 1, zero distractor hits, and staying inside that budget; it is a deterministic proxy, not a validated semantic success judge. Tier utility is the fraction of all required evidence contributed by HEURISTIC edges. C/L/H/U required hits report compiler, lexical, heuristic, and unranked matches respectively.

**Budget asymmetry, disclosed.** The two arms reach the budget differently, and this changes how the numbers should be read. Sonde's packer truncates evidence TO the budget, so it can never exceed it and its recall already pays for whatever does not fit. The agentic baseline is unconstrained and consumes whatever context it reads. Over-budget baseline runs are therefore reported with their recall intact and an explicit overage rather than discarded or silently credited, and are denied preliminary success because staying inside the budget is the constraint the Sonde arm pays on every task.

**Token comparison caveat.** Baseline input tokens include Claude Code's cached harness prompt — roughly 79k tokens on a probe against 4 tokens of real task input. That fixed overhead is not attributable to the task, so context tokens (measured tool-result bytes) is the arm-comparable figure, not input tokens.

## Summary

| Baseline | Mean recall@k | Preliminary success rate | Mean distractors | Mean helpful | Mean tool calls | Mean input tokens | Mean output tokens | Mean context tokens | Mean latency (ms) | Mean heuristic utility |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Sonde | 0.833 | 0.833 | 0.00 | 0.17 | 1.1 | 17 | 270 | 270 | 12 | 0.422 |
| Agentic search | 1.000 | 0.500 | 0.25 | 0.25 | 10.8 | 60268 | 2676 | 1490 | 40900 | n/a |

## Per-task recall@k

| Task | Category | Sonde recall | Sonde success | C/L/H/U required hits | Agentic recall | Agentic success |
|---|---|---:|:---:|---:|---:|:---:|
| impact-notifier-signature | transitive_impact | 1.00 | yes | 0/5/3/0 | 1.00 | no |
| impact-queue-enqueue | transitive_impact | 1.00 | yes | 0/0/3/0 | 1.00 | no |
| impact-dispatch-two-hop | transitive_impact | 1.00 | yes | 0/0/2/0 | 1.00 | no |
| impact-retry-policy | transitive_impact | 1.00 | yes | 0/4/0/0 | 1.00 | no |
| implementations-of-notifier | wide_interface | 1.00 | yes | 0/5/0/0 | 1.00 | yes |
| implementations-of-notifier-completeness | wide_interface | 1.00 | yes | 0/3/0/0 | 1.00 | yes |
| completeness-queue-callers | completeness | 1.00 | yes | 0/0/2/0 | 1.00 | yes |
| completeness-notifier-references | completeness | 1.00 | yes | 0/2/0/0 | 1.00 | yes |
| tests-for-dispatcher-change | test_selection | 1.00 | yes | 0/0/0/1 | 1.00 | no |
| tests-for-retry-policy-change | test_selection | 1.00 | yes | 0/0/0/1 | 1.00 | yes |
| semantic-backoff-behavior | semantic_disadvantage | 0.00 | no | 0/0/0/0 | 1.00 | yes |
| semantic-alerting-synonym | semantic_disadvantage | 0.00 | no | 0/0/0/0 | 1.00 | no |
