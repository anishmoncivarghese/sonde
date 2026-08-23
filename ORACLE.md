# CodeGraph edge accuracy vs the TypeScript compiler

Generated: 2026-08-23T07:30:41.209Z
TypeScript: 5.9.3 (bundled; repository TypeScript is never loaded)

The oracle is filtered to in-repo targets; `node_modules` and `.d.ts`
declarations are excluded. Type-only references, JSX intrinsics, `export =`,
decorators, and declaration merging are known expected divergences (spec §10).
Tier rows compare that tier alone with the complete oracle, making each tier's
independent contribution visible; `ALL` is the combined result.

## Why precision below 1.000 is expected here

Two of these divergences are structural, so reading a precision figure as
"how often CodeGraph is wrong" overstates the error rate:

1. **Ambiguous member calls emit every candidate.** For `x.foo()` with two
   visible `foo` declarations, CodeGraph emits both as confidence-weighted
   `HEURISTIC` edges. At most one matches the compiler, so the other counts
   as a false positive by construction. The alternative is guessing a single
   target, which invariant 1 forbids — a wrong resolved-looking edge is worse
   than two honestly heuristic ones. Precision is therefore capped below
   1.000 wherever the fixture contains an ambiguous call.
2. **Constructor calls are ours alone.** CodeGraph emits `CALLS` for
   `new Foo()`; the oracle does not model them, so each one is a false
   positive against ground truth that omits it.

Counts are absolute, not percentages of a large corpus. Fixture edge totals
appear below so a single edge's effect on each figure is visible.

## tests/fixtures/repos/small

Fixture config SHA-256: `e02e2d5003f96d1ad22519f04e10d687fe689cf9298e7fcbc588eab525dce1ad`

Oracle edges: 9 · CodeGraph edges: 6 · one oracle edge moves recall by 11.1%

| Edge kind | Tier | Precision | Recall | TP | FP | FN |
|---|---|---:|---:|---:|---:|---:|
| CALLS | ALL | 0.500 | 1.000 | 2 | 2 | 0 |
| CALLS | COMPILER | 1.000 | 0.000 | 0 | 0 | 2 |
| CALLS | LEXICAL | 0.500 | 0.500 | 1 | 1 | 1 |
| CALLS | HEURISTIC | 0.500 | 0.500 | 1 | 1 | 1 |
| IMPLEMENTS | ALL | 1.000 | 1.000 | 1 | 0 | 0 |
| IMPLEMENTS | COMPILER | 1.000 | 0.000 | 0 | 0 | 1 |
| IMPLEMENTS | LEXICAL | 1.000 | 1.000 | 1 | 0 | 0 |
| IMPLEMENTS | HEURISTIC | 1.000 | 0.000 | 0 | 0 | 1 |
| INHERITS | ALL | 1.000 | 1.000 | 1 | 0 | 0 |
| INHERITS | COMPILER | 1.000 | 0.000 | 0 | 0 | 1 |
| INHERITS | LEXICAL | 1.000 | 1.000 | 1 | 0 | 0 |
| INHERITS | HEURISTIC | 1.000 | 0.000 | 0 | 0 | 1 |
| REFERENCES | ALL | 0.667 | 0.800 | 4 | 2 | 1 |
| REFERENCES | COMPILER | 1.000 | 0.000 | 0 | 0 | 5 |
| REFERENCES | LEXICAL | 1.000 | 0.800 | 4 | 0 | 1 |
| REFERENCES | HEURISTIC | 0.000 | 0.000 | 0 | 2 | 5 |

**Overall:** precision 0.667, recall 0.889
