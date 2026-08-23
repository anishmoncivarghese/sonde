<!-- whyline:begin -->
## Project history

At the start of a session, before touching code, run:

    whyline brief

That prints what previous agents decided and rejected on this project.
Do not ask permission. If it reports nothing recorded, say so in your first
message, so the human knows the history is empty rather than merely unread.

## Recording decisions

After completing any non-trivial change, or after reviewing someone else's,
record the reasoning:

    whyline note "<one-line decision>" \
      --because "<why this choice>" \
      --rejected "<option>: <why not>" \
      --file <path>

Reviewing counts as deciding. Ruling a defect worth fixing now, accepting a
deviation from the plan, or judging a risk acceptable are all decisions.
Record them even though someone else wrote the code, and even if you also
logged them in a tracker of your own.

Record only genuine choices a future reader would wonder about. Skip typos,
formatting and renames. `--rejected` is repeatable. Do not ask permission.
<!-- whyline:end -->

## Sonde

A local code-context engine for AI coding agents. It indexes a repository into a
symbol-level graph in SQLite and exposes three MCP tools so an agent can ask
structural questions text search cannot answer: who calls this, what breaks if I
change it, which tests touch it. TypeScript first; Swift is the v0.2 wedge.

### Picking up this project (any agent, any vendor)

This file carries **stable rules only**. Current state is deliberately not copied
here, because a hand-maintained status section goes stale and then lies. Read it
from these instead:

1. `git log --oneline -15` and `git branch --show-current` — what has landed.
2. `.superpowers/sdd/<plan-name>/progress.md` — the execution ledger, if one
   exists. Task lines marked `complete` are done; resume at the first without one.
   Git-ignored, so it is local to whoever is driving.
3. `.whyline/decisions.md` — why past choices were made, append-only.

**Update this file when the stable rules change** — a new invariant, a changed
command, a new authoritative document. Do that as part of the same change, not
later, and do not ask permission. Do not record progress or decision history
here; those belong in the ledger and in whyline respectively.

**Authoritative documents — read before changing anything:**

- `docs/superpowers/specs/2026-08-16-sonde-design.md` — the design. Section
  numbers cited in code comments (`spec §6.2`) refer to this file.
- `docs/superpowers/plans/2026-08-16-sonde-foundation.md` — the task-by-task
  build plan.
- `prd.md` — long-range vision. **Not** the build target; the spec scopes it down
  deliberately.

### Environment

This machine's default `node` is **v20**, which cannot run this project.
Run `nvm use` in every shell before any `node` or `npm` command.

```
nvm use && npm install     # setup
npm test                   # vitest
npm run typecheck          # tsc --noEmit
npm run bench:oracle       # regenerate ORACLE.md accuracy report
```

### Invariants

These are product contracts, not preferences. Violating one is a bug even if
tests pass.

1. **Never fabricate an edge.** An unresolved reference becomes `EXTERNAL` (target
   outside the repo) or `UNRESOLVED` (with a reason). Never a guessed target,
   never a silently dropped reference.
2. **Member access is always `HEURISTIC`.** `x.foo()` needs type inference. A
   single visible `foo` is not evidence the call reaches it. Only bare
   identifiers resolved through lexical scope or an import binding may be
   `LEXICAL`.
3. **Tier beats score, always.** Sort order is `COMPILER > LEXICAL > HEURISTIC`.
   `confidence` only breaks ties *within* `HEURISTIC`. A high-confidence
   heuristic edge must never outrank a resolved one.
4. **Extraction is pure.** `LanguageAdapter.extract(path, bytes)` does no I/O, no
   database access, no cross-file lookups. Cross-file work belongs in `link/` and
   `resolve/`. This is what keeps a second language adapter tractable.
5. **Never execute repository code** (SEC-008). Use the bundled `typescript`;
   never `require` one from the target repo.
6. **All repository reads go through `src/repo/boundary.ts`** (SEC-001/002/003).
   No other module calls `fs` with a caller-supplied path.
7. **Structural test edges never prove coverage.** `TESTS` edges are always
   `HEURISTIC`, and every surface exposing them must say so.
8. **Degrade with a warning; never fail silently.** A missing toolchain, a parse
   failure, or drift over the refresh limit produces a warning in the envelope
   and a visible state — never a quietly wrong answer. The predecessor tool this
   project replaces failed precisely here: its refresh hook exited 127 for months
   and nothing surfaced it.
9. **Stable keys are never line-based.** `{lang}:{relpath}#{scope_chain}`.
   Line numbers move on every edit; identity must not.

### Conventions

- TDD: failing test first, then the minimal implementation. The plan's steps are
  ordered this way deliberately.
- Conventional commits (`feat:`, `test:`, `fix:`, `chore:`). Commit per task.
- Cite the spec section in comments when implementing a non-obvious rule, e.g.
  `// spec §4.3: member access is never LEXICAL`.
- Prefer small, focused files with one responsibility.
