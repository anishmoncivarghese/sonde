# CodeGraph

A local code-context engine for AI coding agents. CodeGraph indexes a
TypeScript repository into a symbol-level graph in SQLite and exposes three MCP
tools — `find_symbols`, `query_graph`, and `get_impact_radius` — so an agent can
answer *who calls this*, *what breaks if I change it*, and *which tests relate
to it* in one call instead of a search loop.

## What the benchmark actually shows

The honest claim is **not** "finds what grep cannot". A competent agentic search
loop finds the same structural evidence — we measured it, on a real 19,409-line
repository, and it scored 1.000 recall on every task.

The claim is **the same answers for a fraction of the cost, inside a budget**:

| On real production TypeScript | CodeGraph | Agentic search |
|---|---:|---:|
| Recall on structural tasks | **1.00** | 1.00 |
| Tool calls | **1.0** | 8.0 |
| Context tokens | **1,262** | 3,621 |
| Latency | **263 ms** | 38,602 ms |
| Runs that blew the token budget | **0 of 6** | 3 of 6 |

CodeGraph matches the baseline's answers on every structural task while using
~3× less context, 8× fewer calls, and ~147× less wall-clock time — and it never
exceeds the caller's token budget, because the packer truncates to it by
construction. That is the trade being offered.

**Where it loses.** Behavioural queries with no shared vocabulary — *"where is
the retry backoff decided?"* — score 0.00. Local semantic retrieval was built
and measured and does not fix it (see the design doc §2.2); the capability is
therefore not claimed. If your questions are mostly of that shape, an agentic
search loop is the better tool today.

Numbers are reproducible: `npm run bench:fixture && npm run bench:large`.
Full results in [BENCHMARK-LARGE.md](BENCHMARK-LARGE.md) and
[BENCHMARK.md](BENCHMARK.md).

## Install and run

```sh
npx codegraph index .
npx codegraph index . --resolve  # optional: slower, compiler-exact edges
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
- **Every edge is tier-labelled by how it was found** — `COMPILER` (resolved
  exactly by the bundled TypeScript compiler under `--resolve`), `LEXICAL`
  (resolved through an import binding or lexical scope), `HEURISTIC` (member
  access or another relationship requiring type inference), `EXTERNAL` (target
  outside the indexed repository), or `UNRESOLVED` (genuinely unplaceable,
  with a reason).
- **Never fabricates an edge.** An unresolved reference becomes `EXTERNAL` or
  `UNRESOLVED` — never a guessed target and never a silently dropped reference.

## Accuracy

CodeGraph measures its zero-setup tree-sitter path against the TypeScript
compiler on a pinned fixture and publishes the result, unflattering numbers
included (spec §12). `COMPILER` edges use that compiler directly, so comparing
them back to the same authority would not be an independent accuracy test.

<!-- ORACLE_REPORT_START -->
# CodeGraph edge accuracy vs the TypeScript compiler

Generated: 2026-08-23T18:16:41.557Z
TypeScript: 5.9.3 (bundled; repository TypeScript is never loaded)

**What these numbers cover.** The oracle measures the tree-sitter resolution
path — the zero-setup default, and the only tier whose accuracy is in question.
COMPILER-tier edges come from the TypeScript compiler itself, so scoring them
against the same compiler would measure nothing; they are exact by construction
and excluded from these figures. Run `codegraph index --resolve` to produce them.

The oracle is filtered to in-repo targets; `node_modules` and `.d.ts`
declarations are excluded. Type-only references, JSX intrinsics, `export =`,
decorators, and declaration merging are known expected divergences (spec §10).
Tier rows compare that tier alone with the complete oracle, making each tier's
independent contribution visible; `ALL` is the combined result.

## Why precision below 1.000 is expected here

These divergences are structural, so reading a precision figure as
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
3. **Member-level IMPLEMENTS is ours alone.** CodeGraph derives an
   IMPLEMENTS edge from `RegExpRouter.add` to `Router.add` once the class
   declares it implements the interface. tsc reports heritage clauses at the
   type level only, so every member-level edge counts as a false positive
   against ground truth that does not model them. The capability is the
   reason impact on an interface method works at all, so the precision cost
   is disclosed rather than removed.

Counts are absolute, not percentages of a large corpus. Fixture edge totals
appear below so a single edge's effect on each figure is visible.

## tests/fixtures/repos/small

Fixture config SHA-256: `e02e2d5003f96d1ad22519f04e10d687fe689cf9298e7fcbc588eab525dce1ad`

Oracle edges: 9 · CodeGraph edges: 7 · one oracle edge moves recall by 11.1%

| Edge kind | Tier | Precision | Recall | TP | FP | FN |
|---|---|---:|---:|---:|---:|---:|
| CALLS | ALL | 0.500 | 1.000 | 2 | 2 | 0 |
| CALLS | LEXICAL | 0.500 | 0.500 | 1 | 1 | 1 |
| CALLS | HEURISTIC | 0.500 | 0.500 | 1 | 1 | 1 |
| IMPLEMENTS | ALL | 0.500 | 1.000 | 1 | 1 | 0 |
| IMPLEMENTS | LEXICAL | 0.500 | 1.000 | 1 | 1 | 0 |
| IMPLEMENTS | HEURISTIC | 1.000 | 0.000 | 0 | 0 | 1 |
| INHERITS | ALL | 1.000 | 1.000 | 1 | 0 | 0 |
| INHERITS | LEXICAL | 1.000 | 1.000 | 1 | 0 | 0 |
| INHERITS | HEURISTIC | 1.000 | 0.000 | 0 | 0 | 1 |
| REFERENCES | ALL | 0.571 | 0.800 | 4 | 3 | 1 |
| REFERENCES | LEXICAL | 0.800 | 0.800 | 4 | 1 | 1 |
| REFERENCES | HEURISTIC | 0.000 | 0.000 | 0 | 2 | 5 |

**Overall:** precision 0.571, recall 0.889
<!-- ORACLE_REPORT_END -->

Regenerate with `npm run bench:oracle`.

## CLI

```text
codegraph index [path] [--resolve]             # full index; optional compiler pass
codegraph update [path] [--resolve]            # update; optional compiler pass
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
- Compiler resolution is opt-in because it is materially slower and uses more
  transient memory. On the 19,409-line Hono fixture, default indexing took
  3.58 s; `--resolve` took 13.70 s, added 10,329 exact placements/promotions,
  and changed `callers_of Hono.route` from zero graph results to eight compiler
  callers. The Program is discarded after indexing; inline refresh stays
  compiler-free and explicitly downgrades affected evidence until a full
  `codegraph update --resolve`.
- Compiler resolution uses bundled TypeScript 5.9.3, not the repository's own
  compiler, so version skew is possible and disclosed in `doctor` and response
  envelopes.
- `TESTS` edges indicate structural relatedness only; they never prove coverage.
- Type-only references, JSX intrinsics, `export =`/`import =`, decorators, and
  declaration merging are known gaps in the tree-sitter extraction path.

See
[`docs/superpowers/specs/2026-08-16-codegraph-design.md`](docs/superpowers/specs/2026-08-16-codegraph-design.md)
for the full design.
