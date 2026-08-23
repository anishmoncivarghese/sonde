# CodeGraph vs. agentic search — large fixture

Generated: 2026-08-23T12:30:06.089Z

Fixture: Hono v4.6.3 (MIT) — 346 files indexed, 9031 symbols, 44107 edges, 8 parse failures.

The medium-fixture benchmark is reported separately in BENCHMARK.md and the
two are never averaged. That corpus is 198 lines — about 1,400 tokens — so
the agentic baseline read all of it, which cannot test whether structural
retrieval beats exhaustive reading. This corpus is two orders of magnitude
beyond any task budget, so neither arm can read it exhaustively.

Ground truth was verified by reading the fixture source, not generated from
CodeGraph's own output: an oracle derived from the tool under test would
agree with its own bugs.

## Summary

| Baseline | Mean recall@k | Success rate | Mean distractors | Mean tool calls | Mean input tokens | Mean context tokens | Mean latency (ms) |
|---|---:|---:|---:|---:|---:|---:|---:|
| CodeGraph | 0.767 | 0.667 | 0.00 | 1.0 | 14 | 1256 | 264 |
| Agentic search | PENDING — 1/6 traces | | | | | | |

## Per-task

| Task | Category | CodeGraph recall | Agentic recall | CodeGraph ctx | Agentic ctx |
|---|---|---:|---:|---:|---:|
| hono-implementations-of-router | wide_interface | 1.00 | 1.00 | 337 | 332 |
| hono-impact-router-add | transitive_impact | 0.60 | PENDING | 3957 | PENDING |
| hono-imported-by-compose | completeness | 1.00 | PENDING | 198 | PENDING |
| hono-references-to-httpexception | completeness | 1.00 | PENDING | 1077 | PENDING |
| hono-tests-for-compose | test_selection | 1.00 | PENDING | 1967 | PENDING |
| hono-semantic-router-selection | semantic_disadvantage | 0.00 | PENDING | 0 | PENDING |
