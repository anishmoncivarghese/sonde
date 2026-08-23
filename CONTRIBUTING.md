# Contributing

Thanks for looking. This project has unusual conventions, and they exist for
measured reasons — please read this before opening a PR.

## The one rule that matters

**Claims must be measured, not asserted.**

Every capability statement in this repository is backed by a reproducible
number, and several claims have been *withdrawn* when measurement contradicted
them (see the design spec §2.2 and §3.0). A PR that adds a capability claim to
the README without a benchmark or oracle figure behind it will be asked for the
number, not the prose.

This cuts both ways: unflattering numbers get published too. `ORACLE.md` reports
precision below 1.000 and explains why, rather than quietly excluding the cases
that cause it.

## Setup

This project needs Node 22+. An `.nvmrc` pins the version.

```sh
nvm use && npm install
npm test          # vitest
npm run typecheck # tsc --noEmit
```

## Before you open a PR

```sh
nvm use && npm run typecheck && npm test
```

Both must be clean. If you changed extraction or resolution, also run:

```sh
npm run bench:fixture   # fetches the pinned Hono fixture (not committed)
npm run bench:oracle    # regenerates ORACLE.md
```

If the oracle numbers move, say so in the PR description and explain why. A
recall improvement with an unexplained precision drop will be questioned.

## Invariants

`AGENTS.md` lists nine invariants. They are product contracts, not style
preferences — violating one is a bug even when tests pass. The two most often
misunderstood:

- **Never fabricate an edge.** An unresolved reference becomes `EXTERNAL` or
  `UNRESOLVED` with a reason. Never a guessed target, never a silently dropped
  reference.
- **Member access is always `HEURISTIC`** without compiler evidence. A single
  visible `foo` is not proof that `x.foo()` reaches it.

## Tests

TDD: failing test first, then the minimal implementation. Tests should assert
real behaviour rather than mocks, and test output should be pristine — a
warning in the output is a finding.

## Commits

Conventional commits (`feat:`, `fix:`, `test:`, `docs:`, `chore:`). Explain
*why* in the body, not just what. If you rejected an alternative approach, say
which and why — that context is worth more later than the diff.

## Reporting a security issue

Please do not open a public issue. See `SECURITY.md`.

## Licence

By contributing you agree that your contributions are licensed under the
Apache License 2.0, consistent with the rest of the project.
