# CodeGraph

A local code-context engine for AI coding agents. CodeGraph indexes a
TypeScript repository into a symbol-level graph in SQLite and exposes three MCP
tools — `find_symbols`, `query_graph`, and `get_impact_radius` — so an agent can
ask structural questions text search cannot answer: who calls this, what breaks
if I change it, and which tests are structurally related.

## Install and run

```sh
npx codegraph index .
npx codegraph mcp serve .
```

No account or hosted service is required. Point your MCP client at
`codegraph mcp serve`.

## What it guarantees

- **Never returns stale source bytes.** Whenever a response includes source,
  CodeGraph re-reads and re-hashes the indexed byte range before returning it
  (spec §8.1, Guarantee A).
- **Always reports structural drift**, rather than claiming completeness it
  cannot verify (spec §8.1, Guarantee B). `codegraph status` shows the same
  drift and tier distribution carried by tool response envelopes.
- **Every edge is tier-labelled by how it was found** — `LEXICAL` (resolved
  through an import binding or lexical scope), `HEURISTIC` (member access or
  another relationship requiring type inference), `EXTERNAL` (target outside
  the indexed repository), or `UNRESOLVED` (genuinely unplaceable, with a
  reason). A `COMPILER` tier is reserved for a future `tsc`-backed upgrade pass;
  nothing in the current build produces it.
- **Never fabricates an edge.** An unresolved reference becomes `EXTERNAL` or
  `UNRESOLVED` — never a guessed target and never a silently dropped reference.

## Accuracy

CodeGraph measures itself against the TypeScript compiler on a pinned fixture
and publishes the result, unflattering numbers included (spec §12).

<!-- ORACLE_REPORT_START -->
# CodeGraph edge accuracy vs the TypeScript compiler

Generated: 2026-08-19T21:11:47.823Z
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
| REFERENCES | ALL | 1.000 | 0.000 | 0 | 0 | 5 |
| REFERENCES | COMPILER | 1.000 | 0.000 | 0 | 0 | 5 |
| REFERENCES | LEXICAL | 1.000 | 0.000 | 0 | 0 | 5 |
| REFERENCES | HEURISTIC | 1.000 | 0.000 | 0 | 0 | 5 |

**Overall:** precision 0.667, recall 0.444
<!-- ORACLE_REPORT_END -->

Regenerate with `npm run bench:oracle`.

## CLI

```text
codegraph index [path]                         # full index
codegraph update [path]                        # incremental update
codegraph status [path]                        # freshness and tier distribution
codegraph search <query> [path]                # find_symbols
codegraph query <pattern> <symbol> [path]      # query_graph
codegraph impact [path] --symbol <name>        # get_impact_radius by symbol
codegraph impact [path] --from-git-diff        # impact from working-tree diff
codegraph doctor [path]                        # parser/database/tsc health
codegraph clean [path]                         # remove the cached index
codegraph mcp serve [path]                     # MCP server over stdio
```

`impact` also accepts repeatable `--symbol` options and
`--token-budget <n>`. The `index`, `update`, `status`, `search`, `query`,
`impact`, `doctor`, and `clean` commands accept `--json`.

## Known limitations (v0.1)

- TypeScript/TSX only; no Swift, Python, or other language adapter.
- `TESTS` edges are not yet produced, so `tests_for` currently returns empty.
  Structural test edges will indicate relatedness, never proof of coverage.
- The `COMPILER` tier is not implemented; every resolved edge is currently
  `LEXICAL` or `HEURISTIC`.
- Type-only references, JSX intrinsics, `export =`/`import =`, decorators, and
  declaration merging are known gaps in the tree-sitter extraction path.

See
[`docs/superpowers/specs/2026-08-16-codegraph-design.md`](docs/superpowers/specs/2026-08-16-codegraph-design.md)
for the full design.
