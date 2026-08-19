# CodeGraph edge accuracy vs the TypeScript compiler

Generated: 2026-08-19T03:53:28.111Z
TypeScript: 5.9.3 (bundled; repository TypeScript is never loaded)

The oracle is filtered to in-repo targets; `node_modules` and `.d.ts`
declarations are excluded. Type-only references, JSX intrinsics, `export =`,
decorators, and declaration merging are known expected divergences (spec §10).
Tier rows compare that tier alone with the complete oracle, making each tier's
independent contribution visible; `ALL` is the combined result.

## tests/fixtures/repos/small

Fixture config SHA-256: `e02e2d5003f96d1ad22519f04e10d687fe689cf9298e7fcbc588eab525dce1ad`

| Edge kind | Tier | Precision | Recall | TP | FP | FN |
|---|---|---:|---:|---:|---:|---:|
| CALLS | ALL | 1.000 | 0.500 | 1 | 0 | 1 |
| CALLS | COMPILER | 1.000 | 0.000 | 0 | 0 | 2 |
| CALLS | LEXICAL | 1.000 | 0.500 | 1 | 0 | 1 |
| CALLS | HEURISTIC | 1.000 | 0.000 | 0 | 0 | 2 |
| IMPLEMENTS | ALL | 1.000 | 1.000 | 1 | 0 | 0 |
| IMPLEMENTS | COMPILER | 1.000 | 0.000 | 0 | 0 | 1 |
| IMPLEMENTS | LEXICAL | 1.000 | 1.000 | 1 | 0 | 0 |
| IMPLEMENTS | HEURISTIC | 1.000 | 0.000 | 0 | 0 | 1 |
| INHERITS | ALL | 1.000 | 1.000 | 1 | 0 | 0 |
| INHERITS | COMPILER | 1.000 | 0.000 | 0 | 0 | 1 |
| INHERITS | LEXICAL | 1.000 | 1.000 | 1 | 0 | 0 |
| INHERITS | HEURISTIC | 1.000 | 0.000 | 0 | 0 | 1 |
| REFERENCES | ALL | 1.000 | 0.000 | 0 | 0 | 5 |
| REFERENCES | COMPILER | 1.000 | 0.000 | 0 | 0 | 5 |
| REFERENCES | LEXICAL | 1.000 | 0.000 | 0 | 0 | 5 |
| REFERENCES | HEURISTIC | 1.000 | 0.000 | 0 | 0 | 5 |

**Overall:** precision 1.000, recall 0.333
