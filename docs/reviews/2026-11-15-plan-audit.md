# Plan and design audit — 2026-11-15

Scope: every plan and spec in the repository, checked against the code, the
release history, the probes and the relay state rather than against each
other. This is a dated record, not a status page; read `git log` for what has
landed since.

## 1. Where the repository actually is

| Fact | Evidence |
|---|---|
| Released version is 0.4.4 on npm, GitHub and in `server.json` | `npm view`, `git tag`, `package.json` |
| `main` is 23 commits ahead of `origin/main` | `git rev-list --count origin/main..main` |
| Unreleased on `main`: `sonde map`, and a fix to a false completeness claim in `sonde doc` | `CHANGELOG.md`, `3f9cd28`, `99c8184` |
| The working branch is `relay/now-i-want-you-to-analyse-the-current-ca.plan`, two chat commits ahead of `main` | `git branch` |
| The relay is paused on MAP-GATE-1 at its round cap, and a recorded decision says not to resume it | `.whyline/relay/state.json`, `.whyline/decisions.md` |
| Five stale Whyline ownership claims | `whyline sync`; clear with `whyline release --stale` |

## 2. The eleven earlier plans

All complete. Their checkboxes were never ticked because those plans use
checkboxes as step lists, so the count of open boxes means nothing; completion
is established by what shipped.

| Plan | Outcome |
|---|---|
| `2026-08-16-sonde-foundation` | Shipped in 0.2.0. Ledger records 16 of 16 tasks. |
| `2026-08-19-sonde-mcp-surface` | Shipped in 0.2.0: three MCP tools. |
| `2026-08-20-sonde-benchmark-harness` | Shipped; `BENCHMARK.md`, `BENCHMARK-LARGE.md`. See §6 for a debt it left. |
| `2026-08-21-sonde-phase3-remediation` | Shipped in 0.2.0. |
| `2026-08-23-sonde-compiler-tier` | Shipped in 0.2.0; anonymous-callback fix in 0.2.1. |
| `2026-08-23-structural-roles-blind-probe` | Ran. Verdict INCONCLUSIVE, recorded as such in `probes/structural-roles/RESULTS.md`. Closed by its own protocol. |
| `2026-08-24-sonde-init` | Shipped in 0.2.2. Ledger records 4 of 4 tasks. |
| `2026-08-24-sonde-swift-adapter` | Shipped in 0.2.0 after a measured PASS. |
| `2026-08-25-python-adapter` | Shipped in 0.3.0. The tree-sitter tier measured FAIL and is documented as unfit without `--resolve`. |
| `2026-08-28-pyright-tier` | Shipped in 0.3.0. See finding F1. |
| `2026-08-30-sonde-doc` | Shipped in 0.4.0 through 0.4.4. See finding F2. |

Nothing in these needs a new plan. Two left defects that do; both are in
`plans/patch-0.4.5.plan.md`.

## 3. Defects found in shipped or unreleased code

**F1. The pyright pass warns about sites that were never Python.**
`runPyrightPass` collects its wanted sites from `unresolvedRefSites()` and
`heuristicEdgeSites()`, which do not filter by language, and then reports every
site it failed to match. Indexing this repository with `--resolve` prints
"4858 stored pyright query site(s) did not match extraction" for six Python
files. Shipped since 0.3.0. It affects any repository that mixes Python with
TypeScript or Swift, and it is the kind of warning that teaches a user to
ignore warnings. No release check exercised a mixed-language project, which is
why PATCH-4 now does. → PATCH-1.

**F2. A fixed defect has been unreleased for six weeks.** `sonde doc` said
"the table below is complete" above a table truncated to 30 of 98 pairs. Fixed
on `main` in `99c8184` on 2026-10-06, with a regression test, and never
released, because the release became entangled with the map gate. Everyone on
0.4.4 still has it. → PATCH-4, PATCH-5.

**F3. The README command inventory omits `doc` and `embed`.** `sonde doc` has
its own section, but the `## CLI` block lists neither. This is the real content
of ORIENT-1; the `sonde init` half of that task was already done in 0.4.4.
→ PATCH-3.

**F4. Releasing from `main` would ship and advertise an ungated command.** The
spec forbids advertising `sonde map` before its gate, yet `main` has the
command in `--help`, a CHANGELOG entry claiming what it answers, a committed
`ARCHITECTURE.html` and a stable-rule section in `AGENTS.md`. The plan had no
task for this, and no release task at all for Phase 1. → PATCH-2.

## 4. Review of the explanation spec and plan

The design is sound where it matters: explanation rather than diagram as the
product unit, Markdown first, no public schema, three MCP tools, one total edge
comparator, heuristic links never bridging a resolved path, and every phase
behind its own falsifiable gate. It is also consistent with what the
dogfooding trials found. The problems are in Phase 0 and in how the
experiments are isolated.

**D1. The map gate measured the spike, and would have ruled on the command.**
MAP-GATE-1 names `probes/visual-map/map.html` and `map-simple.html`. Those are
the Phase 0 spike. The command built afterwards has search, transitive reach
and a direction toggle; MAP-GATE-3 would nonetheless have used the spike's
verdict to decide which views of the command to document. A PASS would have
credited the command with something it was not tested on, and a FAIL would
have condemned features the spike never had.

**D2. The gate could not be run cold by anyone with repository access.** The
Q1 answer is in `CHANGELOG.md` and in a commit message; more is in the audit
directory. The relay's repeated failures were treated as an isolation problem
to be solved with a stricter brief and a fresh process. The brief was never the
problem. The answers are in the repository.

**D3. A human run existed and was not on the record.** The spec says the gate
"has not been adjudicated". On 2026-10-06 the repository owner, cold, could not
answer any question from either artifact. That run has real defects, and its
answerer was then shown the answers, but it is the only cold observation of
the intended reader that will ever exist for those questions. It is now in
`probes/visual-map/audit/HUMAN-RUN-2026-10-06.md`, awaiting the owner's
confirmation.

**D4. The answerer was the wrong kind of reader.** The owner decided the map
is for humans. An agent operating a browser under a rule against reading the
DOM measures how well an agent can simulate looking.

**D5. The stimuli were not under version control.** Both HTML files are
git-ignored, exist on one machine, and when the relay compared them the maps
described `e92967b` while the Markdown described `67cd9ad`.

**D6. The focused experiment was set up to repeat D2.** FOCUS-2 commits the
answer key into the repository the answerers work in. FOCUS-1 now requires an
exported workspace without history, decisions, probes or changelog, and
excludes anyone who drafted or reviewed the key.

**D7. Familiarity was uncontrolled.** "Sonde plus one unfamiliar repository"
let a projection pass on Sonde's own tasks, which every agent in the relay has
read. The PASS rule now needs at least one improved task from the unfamiliar
repository. Added before any result exists.

**D8. Three smaller mismatches with the code.** The comparator's `score()`
needs a fan-in p95, which the plan did not source (it is `fanInP95` in
`src/query/rank.ts`). Diff impact already exists at file level and treats
unavailable Git as a warning, while the new command must treat it as an error;
the divergence is now recorded rather than accidental. And EXPLAIN-4 builds a
reader for TESTS edges that nothing in `src/` produces, so its section can
only ever say evidence is unavailable; the task now says so.

Not changed, deliberately: the comparator, the traversal algorithms, the
artifact format, the phase order from 2 onward, and the frozen
`probes/visual-map/PROTOCOL.md`.

## 5. What was changed

| File | Change |
|---|---|
| `plans/patch-0.4.5.plan.md` | New. PATCH-1 to PATCH-5: the pyright warning, hiding the ungated map, the README inventory, clean-install verification, release. |
| `plans/map-gate.plan.md` | New. Replaces Phases 0 and 1: close the spike gate on the human record, then gate the command with committed stimuli, fresh questions, an unfamiliar repository and a human answerer. Two human checkpoints. |
| `plans/now-i-want-you-to-analyse-the-current-ca.plan.md` | Phases 0 and 1 moved out. Eight tasks amended (FOCUS-1, 2, 3, 5, 6; IMPACT-1; EXPLAIN-4; EXPLAIN-11). Nothing else touched. |
| `docs/specs/now-i-want-you-to-analyse-the-current-ca.md` | An Amendments section appended; original text intact. |
| `probes/visual-map/audit/HUMAN-RUN-2026-10-06.md` | New. The unrecorded human run. |

## 6. Known debts with no plan, and why not

- **Python has no accuracy oracle.** Its gate measured placement, not target
  correctness, and the README says so. Worth a plan once Python usage justifies
  it; nothing currently depends on it.
- **The README leads with a benchmark mean that hides a 2-to-18 spread**, and
  four dogfood trials saw agents grep with the tools available. The explanation
  spec is the response to that finding. Rewrite the README's opening when
  FOCUS-7 says what Sonde is actually good for, not before.
- **Flat packages collapse to one module in `sonde doc`.** Disclosed in 0.4.4.
  Partitioning by file is a design question the focused-explanation work may
  make moot.
- **No TESTS producer.** See D8. A producer is its own design and its own gate.
- **`sonde doc` and `sonde map` write non-atomically.** EXPLAIN-7 builds an
  atomic writer and explicitly does not retrofit; retrofit after it lands.

## 7. Waiting on the owner

1. Confirm or correct `probes/visual-map/audit/HUMAN-RUN-2026-10-06.md`.
2. Decide PATCH-2's default: hide `sonde map` for 0.4.5 (drafted), ship it
   visibly, or remove it.
3. Claim the Glama listing and request a re-sync; the awesome-mcp-servers pull
   request has been waiting on a grade since October.
4. The relay's `state.json` still points at MAP-GATE-1 in the old plan, which
   no longer contains that task. Stop it and start each plan file explicitly.
