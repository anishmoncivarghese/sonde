# Sonde vs. agentic search — large fixture

Generated: 2026-08-23T18:59:21.423Z

Fixture: Hono v4.6.3 (MIT) — 346 files indexed, 9348 symbols, 50517 edges, 8 parse failures.

The medium-fixture benchmark is reported separately in BENCHMARK.md and the
two are never averaged. That corpus is 198 lines — about 1,400 tokens — so
the agentic baseline read all of it, which cannot test whether structural
retrieval beats exhaustive reading. This corpus is two orders of magnitude
beyond any task budget, so neither arm can read it exhaustively.

Ground truth was verified by reading the fixture source, not generated from
Sonde's own output: an oracle derived from the tool under test would
agree with its own bugs.

## Summary

| Baseline | Mean recall@k | Success rate | Mean distractors | Mean tool calls | Mean input tokens | Mean context tokens | Mean latency (ms) |
|---|---:|---:|---:|---:|---:|---:|---:|
| Sonde | 0.833 | 0.833 | 0.00 | 1.0 | 14 | 1263 | 280 |
| Agentic search | 1.000 | 0.500 | 0.00 | 8.0 | 78548 | 3621 | 38602 |

## Per-task

| Task | Category | Sonde recall | Agentic recall | Sonde ctx | Agentic ctx |
|---|---|---:|---:|---:|---:|
| hono-implementations-of-router | wide_interface | 1.00 | 1.00 | 337 | 332 |
| hono-impact-router-add | transitive_impact | 1.00 | 1.00 | 4000 | 9756 |
| hono-imported-by-compose | completeness | 1.00 | 1.00 | 198 | 131 |
| hono-references-to-httpexception | completeness | 1.00 | 1.00 | 1077 | 945 |
| hono-tests-for-compose | test_selection | 1.00 | 1.00 | 1967 | 7772 |
| hono-semantic-router-selection | semantic_disadvantage | 0.00 | 1.00 | 0 | 2787 |
