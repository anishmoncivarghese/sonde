# Sonde

A local code-context engine for AI coding agents. Sonde indexes a
TypeScript repository into a symbol-level graph in SQLite and exposes three MCP
tools — `find_symbols`, `query_graph`, and `get_impact_radius` — so an agent can
answer *who calls this*, *what breaks if I change it*, and *which tests relate
to it* in one call instead of a search loop.

## What the benchmark actually shows

The honest claim is **not** "finds what grep cannot". A competent agentic search
loop finds the same structural evidence — we measured it, on a real 19,409-line
repository, and it scored 1.000 recall on every task.

The claim is **the same answers for a fraction of the cost, inside a budget**:

| On real production TypeScript | Sonde | Agentic search |
|---|---:|---:|
| Recall on structural tasks | **1.00** | 1.00 |
| Tool calls | **1.0** | 8.0 |
| Context tokens | **1,262** | 3,621 |
| Latency | **263 ms** | 38,602 ms |
| Runs that blew the token budget | **0 of 6** | 3 of 6 |

Sonde matches the baseline's answers on every structural task while using
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
npx @cheppulabs/sonde index .
npx @cheppulabs/sonde index . --resolve  # optional: slower, compiler-exact edges
npx @cheppulabs/sonde mcp serve .
```

Installed globally, the command is just `sonde` — the scope only appears in
the package name, because the bare `sonde` name was already taken on npm.

```sh
npm install -g @cheppulabs/sonde
sonde index .
```

No account or hosted service is required. Point your MCP client at
`sonde mcp serve`.

## What it guarantees

- **Never returns stale source bytes.** Whenever a response includes source,
  Sonde re-reads and re-hashes the indexed byte range before returning it
  (spec §8.1, Guarantee A).
- **Always reports structural drift**, rather than claiming completeness it
  cannot verify (spec §8.1, Guarantee B). `sonde status` shows the same
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

Sonde measures its zero-setup tree-sitter path against the TypeScript
compiler on a pinned fixture and publishes the result, unflattering numbers
included (spec §12). `COMPILER` edges use that compiler directly, so comparing
them back to the same authority would not be an independent accuracy test.

<!-- ORACLE_REPORT_START -->
# Sonde edge accuracy vs the TypeScript compiler

Generated: 2026-08-23T18:16:41.557Z
TypeScript: 5.9.3 (bundled; repository TypeScript is never loaded)

**What these numbers cover.** The oracle measures the tree-sitter resolution
path — the zero-setup default, and the only tier whose accuracy is in question.
COMPILER-tier edges come from the TypeScript compiler itself, so scoring them
against the same compiler would measure nothing; they are exact by construction
and excluded from these figures. Run `sonde index --resolve` to produce them.

The oracle is filtered to in-repo targets; `node_modules` and `.d.ts`
declarations are excluded. Type-only references, JSX intrinsics, `export =`,
decorators, and declaration merging are known expected divergences (spec §10).
Tier rows compare that tier alone with the complete oracle, making each tier's
independent contribution visible; `ALL` is the combined result.

## Why precision below 1.000 is expected here

These divergences are structural, so reading a precision figure as
"how often Sonde is wrong" overstates the error rate:

1. **Ambiguous member calls emit every candidate.** For `x.foo()` with two
   visible `foo` declarations, Sonde emits both as confidence-weighted
   `HEURISTIC` edges. At most one matches the compiler, so the other counts
   as a false positive by construction. The alternative is guessing a single
   target, which invariant 1 forbids — a wrong resolved-looking edge is worse
   than two honestly heuristic ones. Precision is therefore capped below
   1.000 wherever the fixture contains an ambiguous call.
2. **Constructor calls are ours alone.** Sonde emits `CALLS` for
   `new Foo()`; the oracle does not model them, so each one is a false
   positive against ground truth that omits it.
3. **Member-level IMPLEMENTS is ours alone.** Sonde derives an
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

Oracle edges: 9 · Sonde edges: 7 · one oracle edge moves recall by 11.1%

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
sonde index [path] [--resolve]             # full index; optional compiler pass
sonde update [path] [--resolve]            # update; optional compiler pass
sonde status [path]                        # freshness and tier distribution
sonde search <query> [path]                # find_symbols
sonde query <pattern> <symbol> [path]      # query_graph
sonde impact [path] --symbol <name>        # get_impact_radius by symbol
sonde impact [path] --from-git-diff        # impact from working-tree diff
sonde doctor [path]                        # parser/database/tsc health
sonde clean [path]                         # remove the cached index
sonde mcp serve [path]                     # MCP server over stdio
```

`impact` also accepts repeatable `--symbol` options and
`--token-budget <n>`. The `index`, `update`, `status`, `search`, `query`,
`impact`, `doctor`, and `clean` commands accept `--json`.

## Known limitations (v0.2.0)

- **Node 22+ is required.** `better-sqlite3` needs it; installing on an older
  Node prints an `EBADENGINE` warning but still completes. If `sonde` then
  fails to run, this is why — upgrade Node rather than ignore the warning.
- **TypeScript and Swift only; no Python or other language adapter.**
- **Swift resolution is heuristic, not compiler-backed, and one narrowing
  rule is unvalidated.** References are narrowed by file visibility and
  explicit local type annotations, not full type inference. On a real
  376-file Swift application this reached 74.84% placed / 25.16% unresolved
  — see [`probes/swift-narrowing/FINDINGS.md`](probes/swift-narrowing/FINDINGS.md)
  for the full measurement. The third narrowing rule (SwiftPM target
  boundaries) has never been tested: the validating corpus was an Xcode
  project, which has no `Package.swift` layout to supply that signal. The
  curated Swift SDK symbol table is also deliberately conservative — several
  ambiguous names were dropped rather than guessed, so some legitimate SDK
  references may still show as `UNRESOLVED` rather than `EXTERNAL`.
- Compiler resolution for TypeScript (`--resolve`) is opt-in because it is
  materially slower and uses more transient memory. On the 19,409-line Hono
  fixture, default indexing took 3.58 s; `--resolve` took 13.70 s, added
  10,329 exact placements/promotions, and changed `callers_of Hono.route`
  from zero graph results to eight compiler callers. The Program is discarded
  after indexing; inline refresh stays compiler-free and explicitly
  downgrades affected evidence until a full `sonde update --resolve`.
- Compiler resolution uses bundled TypeScript 5.9.3, not the repository's own
  compiler, so version skew is possible and disclosed in `doctor` and response
  envelopes.
- A file with a parse error still contributes whatever tree-sitter
  recovered from it — this is deliberate (see the design spec §8). Its
  `parse_state` is `partial` when real declarations were recovered despite
  the error, or `failed` only when nothing usable came out of it at all.
- `TESTS` edges indicate structural relatedness only; they never prove coverage.
- Type-only references, JSX intrinsics, `export =`/`import =`, decorators, and
  declaration merging are known gaps in the tree-sitter extraction path.
- **No rename inference.** Renaming a file changes every stable key derived
  from its path; anything holding an old key (a saved query, an agent's prior
  turn) will silently stop resolving rather than following the rename.
- Semantic/behavioural search is not available. It was built and measured —
  two embedding models, four document configurations — and none of them beat
  lexical/structural retrieval on the task class it was meant to help with.
  See design spec §2.2 for the numbers. It is not wired into `find_symbols`.

See
[`docs/superpowers/specs/2026-08-16-sonde-design.md`](docs/superpowers/specs/2026-08-16-sonde-design.md)
for the full design.
