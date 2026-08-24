# Changelog

All notable changes to this project are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

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

See the [README](README.md#known-limitations-v020) for the current, maintained list.
