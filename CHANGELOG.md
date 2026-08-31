# Changelog

All notable changes to this project are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

## [0.4.3] — 2026-08-31

### Fixed

- Running `sonde` on Node 20 **segfaulted with no output at all** — exit 139,
  no message, no stack trace — because the bundled `better-sqlite3` imports
  cleanly on an unsupported Node and then crashes when the database is used.
  Every signal a new user would check said the install had worked: npm
  downgrades `EBADENGINE` to a warning and exits 0, and `sonde --version`
  printed normally because it never touches SQLite. The CLI now refuses to
  start on Node below 22 and states the cause and the fix. A version it cannot
  parse is accepted, since a guard that misfires would block a working install.

## [0.4.2] — 2026-08-31

### Fixed

- `sonde doc --module` listed one row per declaration, so a discriminated
  union's shared property appeared four times as visually identical rows.
  Identical rows now collapse into one carrying the declaration count —
  repeating them read as a bug, and dropping them silently would have hidden
  real structure.
- `--include-tests` now applies to `sonde doc --module` as well as to the
  committed document. It previously filtered only the latter, so module detail
  always listed test modules under "Referenced by modules" regardless of the
  flag. When references are hidden, the output says so.

## [0.4.1] — 2026-08-31

### Added

- `sonde doc` discloses a missing `tsconfig.json`. Without one, TypeScript
  module resolution has nothing to resolve against, so the document renders
  every module with no dependencies between them. That is an honest answer —
  no reference resolved — but it reads like a broken tool, so the header now
  says why (invariant 8). The note appears only when TypeScript sources are
  indexed, so Python- and Swift-only repositories are unaffected.

## [0.4.0] — 2026-08-30

Generated architecture documentation. Minor rather than patch: a new command
and a new committed artifact, with no breaking change to existing behaviour.

### Added

- `sonde doc` — generates a committed `ARCHITECTURE.md` from the graph, with
  `--stdout`, `--check` (for CI), `--module` for symbol-level detail, and
  `--include-tests`. Regeneration is byte-identical when nothing changed, so the
  committed file does not churn diffs; the header stamps the commit it describes
  and `--check` ignores that stamp, since committing the document itself moves
  `HEAD`.
- The document refuses to assert dependencies it cannot evidence. Module pairs
  that only share symbol names are excluded and counted separately: on this
  repository the swift and typescript adapters share filenames and therefore
  function names, manufacturing 62 heuristic "references" between modules that
  never import each other. Ranking by resolved rather than total references is
  what keeps that out of the diagram.

## [0.3.1] — 2026-08-30

### Added

- `mcpName` in `package.json` and a `server.json` manifest, so Sonde can be
  listed in the official MCP Registry. The registry verifies ownership by
  matching `mcpName` against the published npm package, which is why this
  needs a release rather than a repository-only change. No functional change.

## [0.3.0] — 2026-08-28

Python support. Minor rather than patch because a new language ships and
`pyright` becomes a hard dependency, which materially changes install size.

### Added

- Python `.py` and `.pyi` indexing, backed by the bundled pyright when
  `--resolve` is enabled. Against the fixed placement gate, unresolved
  reference sites fell from 62.81% to 27.00% on agentdock and from 57.39% to
  17.42% on pydantic. The worse corpus passes narrowly: restoring the known
  name-wide deletion bias leaves a 0.28-point margin below the 30% ceiling.
  This gate measures placement, not target correctness; Python does not yet
  have an independent oracle equivalent to TypeScript's `ORACLE.md`.
- A pyright-backed `COMPILER` tier for Python (`src/resolve/pyrightPass.ts`),
  driven over LSP by an in-process client. Requests are issued serially
  because throughput was measured flat across client concurrency 1, 8 and 32
  — the server answers on one thread, so a scheduler would return nothing.
  See [`probes/pyright-feasibility/FINDINGS.md`](probes/pyright-feasibility/FINDINGS.md).

### Changed

- `pyright@1.1.413` is now a pinned hard dependency (~19 MB), matching how
  `typescript` is already bundled. Sonde never loads a type checker from the
  target repository, in any language (invariant 5, SEC-008). No Python
  interpreter is required: pyright is a TypeScript program and bundles
  typeshed.
- `.py` and `.pyi` are discovered by default. Registration and discovery
  changed together, because either alone is a silent no-op.

### Fixed

- Python stable keys are now guaranteed unique. Indexing a real corpus failed
  outright with `UNIQUE constraint failed: symbol.stable_key`; on pydantic, 88
  collisions came from four distinct causes, each needing different treatment
  and none permitted to use a line number (invariant 9): module-level
  rebinding is one variable, `@overload` families are one runtime function,
  property accessors earn role-suffixed keys (`area`, `area@setter`), and
  genuine redefinitions take an ordinal that survives line moves.
- The Swift SDK `EXTERNAL` fallback is scoped to Swift references. It fired on
  any reference carrying a scope hint, so Python names colliding with the
  table (`append`, `Task`, `String`, `Int`, `filter`) would have been
  attributed to Swift frameworks — and since `EXTERNAL` is excluded from the
  placement denominator, that would have biased Python's gate toward PASS.

## [0.2.2] — 2026-08-24

### Added

- `sonde init [path]` — collapses first-time setup (`sonde index` plus
  hand-editing `.mcp.json`) into one command. Merge-safe: creates
  `.mcp.json` if absent, merges in the `sonde` server entry if the file
  exists without one, no-ops if already configured identically, and refuses
  to overwrite a conflicting or invalid config rather than guessing.
  `--yes` skips the confirmation prompt; `--resolve` and `--json` behave as
  they do for `index`.

### Changed

- The npm publish workflow no longer auto-triggers on a pushed tag. npm's
  shortest-lived tokens that can bypass 2FA for CI publishing currently
  expire in 7 days, which is a rotation chore not worth owning at this
  release cadence — the workflow auto-firing with no token configured would
  have produced a failing run on every future release regardless. It is now
  `workflow_dispatch`-only: trigger it by hand from the Actions tab when (and
  if) a longer-lived token is ever configured. Releases continue to be
  published manually (`npm publish --access public`) in the meantime.

## [0.2.1] — 2026-08-24

### Fixed

- The TypeScript compiler-resolution pass (`--resolve`) silently skipped any
  reference whose enclosing symbol had no name — the common case for code
  inside `describe(() => { it(() => { ... }) })`, since anonymous test
  callbacks have no named ancestor. The tree-sitter path already falls back
  to the file-level symbol in that case; the compiler pass now does too. On
  the Hono fixture this dropped unresolved `route` references from 44 to 7,
  with the remaining 7 genuinely outside `tsconfig.json`'s `include` list.
- A file's `parse_state` could only be `'ok'` or `'failed'`, so a file that
  recovered nearly all of its declarations despite one bad expression was
  indistinguishable from a file that recovered nothing. Added `'partial'`:
  on the real Hono corpus, 7 of 8 flagged files are genuinely `partial`
  (real declarations recovered) and only 1 is truly `failed`.

### Added

- `CHANGELOG.md`.
- A tag-triggered npm publish workflow (`.github/workflows/publish.yml`)
  with a guard that fails the build if the pushed tag does not match
  `package.json`'s version, rather than silently publishing a mismatch.
- CI, npm version, and license badges in the README.

## [0.2.0] — 2026-08-24

First public release, published to npm as `@cheppulabs/sonde`.

### Added

- TypeScript and TSX indexing via `web-tree-sitter`, with an optional
  compiler-backed resolution pass (`--resolve`) using the bundled TypeScript
  compiler.
- A Swift language adapter (`tree-sitter-swift` 0.7.3), added after a
  pre-committed pass/fail gate measured **PASS** (25.16% unresolved / 74.84%
  placed) on a real 376-file Swift application — see
  [`probes/swift-narrowing/FINDINGS.md`](probes/swift-narrowing/FINDINGS.md)
  for the full record, including the corrected FAIL that preceded it.
- Three MCP tools: `find_symbols`, `query_graph`, `get_impact_radius`.
- CLI: `index`, `update`, `status`, `doctor`, `embed`, `clean`, `search`,
  `query`, `impact`, `mcp serve`.
- Edge accuracy measured against a `tsc` oracle and published in the README,
  unflattering numbers included.
- Recall and cost measured against a live agentic-search baseline on a real
  19,409-line repository (Hono) — see
  [`BENCHMARK-LARGE.md`](BENCHMARK-LARGE.md). The honest claim is cost and
  determinism, not reach: a competent agentic search loop finds the same
  structural evidence.
- Optional local embedding infrastructure (`sonde embed`), built and
  measured, and deliberately **not** wired into search — two models across
  four document configurations failed to beat lexical/structural retrieval
  on the task class it was meant to help with (design spec §2.2).
- Two upstream `tree-sitter-swift` parser bugs isolated and filed:
  [alex-pinkus/tree-sitter-swift#610](https://github.com/alex-pinkus/tree-sitter-swift/issues/610),
  [#611](https://github.com/alex-pinkus/tree-sitter-swift/issues/611).

### Known limitations

See the [README](README.md#known-limitations) for the current, maintained list.
