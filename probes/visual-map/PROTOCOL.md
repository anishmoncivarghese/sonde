# Phase 0 spike protocol — interactive architecture map

**Status:** Fixed before anything is rendered. No question, threshold, or
success criterion in this file may be changed after a result is seen.
**Date:** 2026-10-06
**Brainstorm:** `docs/brainstorm/https-github-com-tt-a1i-archify-check-this-repo-i-want-kind-.md`

---

## 1. The question this spike answers

> Does an interactive HTML module map let a developer answer a real
> architecture question that `sonde doc`'s Markdown cannot answer, or answers
> materially worse?

Not "does it look better." Not "is it nicer to use." The spike produces a
**stop/go decision**, and stopping is a legitimate outcome — Sonde's PRD already
placed interactive visualization out of scope (`prd.md:164`, `:1000`, `:1297`),
so the burden of proof is on the map.

### 1.1 The context that makes this gate necessary

Two measurements, taken before this protocol was written, bear directly on the
expected value:

- **The artifact to be visualized does not change.** `ARCHITECTURE.md` in
  `~/agentdock` is unchanged across **278 commits** and `sonde doc --check`
  still reports it current. Sonde's own copy was touched 7 times, all on the day
  it was built. In six weeks, across two repositories, the module graph has
  never changed because the architecture changed.
- **Sonde's MCP tools went unused in four real trials.** Across two repositories
  (56 and 441 files), an agent with `find_symbols`, `query_graph` and
  `get_impact_radius` available answered four structural questions by grepping,
  correctly each time, including one with 309 grep hits.

Both point the same way: the realistic value of a module map is **one-time
orientation**, not ongoing insight. The questions in §2 are therefore chosen to
test whether one-time orientation is worth a renderer — and one of them is a
control that the Markdown is expected to win.

## 2. The questions, fixed now

Asked against **Sonde's own repository**, which has 17 `src/` modules and real
structure. Each must be answerable from both artifacts in principle.

| # | Question | Why this one |
|---|---|---|
| **Q1** | If you change the schema in `src/store/repos.ts`, which modules must you check? | Blast radius. The table has the data; the question is whether reading it off is harder. |
| **Q2** | Which module is the riskiest to change — the one the most other modules depend on? | Requires aggregating inbound edges, which a flat table does not show directly. |
| **Q3** | Is there a dependency **cycle** between any two modules, and if so which? | Cycles are structurally invisible in a sorted table. If the map cannot win here it cannot win anywhere. |
| **Q4** | Which modules does `src/cli` depend on that `src/mcp` does not? | A set difference across two rows. Natural in a graph, fiddly in a table. |
| **Q5** | Work enters at `src/cli`. Trace the path by which it reaches `src/store` — which modules does it pass through? | Forward path tracing. A table makes you reconstruct a chain by hand, one row lookup at a time. |
| **Q6** | Which modules are *foundational* — they depend on nothing else in the product? | "Where is the bottom of the stack" is a real orientation task, and a table makes you prove a negative across every row. |
| **C1** | *(control)* How many files and symbols are in `src/resolve`? | A direct table lookup. **The Markdown is expected to win.** If the map "wins" here too, the measurement is biased and the whole run is void. |

### 2.1 Amendment — 2026-10-06, before any question was answered

Q5 and Q6 were added after the simple map was built and **before any result was
seen**, which §3 permits and will not permit an hour from now.

The reason is a defect in the original five. Q1–Q4 are all *detail* questions —
blast radius, cycles, set difference — and the simple map discards detail
deliberately: nested modules roll up, scaffolding is dropped, and only
resolved-majority edges are drawn. It would therefore have failed every one of
them by construction, and that FAIL would have measured it against a job it is
not for. The protocol had no question for the claim the simple map actually
makes, which is that a human can see how the repository works.

Q1–Q4 and C1 are therefore answered from the **complete** map. Q5 and Q6 are
answered from the **simple** map. Both are compared against the same Markdown.

**C1 is not filler.** It is the calibration check. A protocol in which the new
thing wins every question is measuring enthusiasm, not utility.

## 3. Predictions, recorded before rendering

Written now so they can be scored against, not rationalised after:

- **Q3 is the map's best case.** Cycles are the one thing a table genuinely
  cannot show. If the map does not win Q3, expect it to win nothing.
- **Q1 is the Markdown's quiet strength.** The dependency table already lists
  every pair with tier counts; a reader can scan it.
- **C1 goes to the Markdown**, decisively.
- **Q5 goes to the simple map.** A four-module chain is a traversal; the table
  makes you rebuild it by hand.
- **Q6 goes to the simple map, but counts for less.** Disclosed confound: the
  layered layout places modules with no outgoing edges in the rightmost column
  by construction, so the map part-answers Q6 through a layout choice rather
  than through the reader's own work. A Q6 win is therefore weaker evidence
  than a Q5 win, and a PASS resting on Q6 alone should be read as MARGINAL.
- **Overall prediction: MARGINAL or FAIL** for the complete map on Q1–Q4;
  **PASS** for the simple map on Q5–Q6. Stated in advance so a PASS is
  informative rather than assumed.

## 4. Protocol

1. **Build the spike** — a throwaway renderer over existing `buildModuleGraph`
   output. No IR design, no schema, no viewer polish, no new CLI command. It may
   be ugly. It may be deleted afterwards.
2. **Separate the builder from the answerer.** Whoever renders the map must not
   be whoever answers the questions. Under whyline roles that is natural: the
   implementer renders, the reviewer answers cold.
3. **Counterbalance the order.** Answer Q1 and Q3 from the Markdown first, Q2
   and Q4 from the map first. Answering the same question twice in a fixed order
   measures memory, not the artifact.
4. **Record per question:** the answer given, whether it was correct, roughly
   how long it took, and stated confidence *before* the answer is checked.
5. **Correctness is judged against the graph**, not against the answerer's
   impression. `sonde query` is the adjudicator.

### 4.1 Cases that must be included

Per the brainstorm's own recommendation, the run must cover:

- **A dense graph** — Sonde's full module set, not a convenient slice.
- **A degraded/freshness case** — generate once with a dirty worktree and
  confirm the map's provenance claim matches `sonde doc`'s stamp.
- **A heuristic-heavy pair** — the `src/adapters/swift` ↔
  `src/adapters/typescript` relationship, which is heuristic-only and once
  manufactured 62 fake references. The map must not make it look resolved.
- **An MCP-only walkthrough** — state plainly what an agent with no shell can
  and cannot get. No code required; a written answer is enough.

## 5. Go/no-go, fixed now

With one participant and five questions, statistical precision is unavailable
and pretending otherwise would be dishonest. The gate is therefore **on
correctness and a stated judgment**, not on a fabricated time threshold.

The two maps are gated **separately**. Neither carries the other: a simple map
that orients a newcomer does not license a complete map nobody can read, and
the reverse.

**Complete map, on Q1–Q4:**

- **PASS** — at least **2 of Q1–Q4** answered correctly from the map that were
  answered **incorrectly, incompletely, or not at all** from the Markdown,
  **and** C1 shows no degradation.
- **MARGINAL** — exactly **1** such question. Record and stop; report to the
  human. Do not proceed to Phase 1 on a MARGINAL without an explicit decision.
- **FAIL** — **0** such questions. The PRD's deferral stands. Keep the spike as
  research and stop.
**Simple map, on Q5–Q6:**

- **PASS** — **both** answered correctly from the simple map and incorrectly,
  incompletely or not at all from the Markdown.
- **MARGINAL** — exactly one, or both but with Q6 carrying the win (see the
  disclosed layout confound in §3).
- **FAIL** — neither.

**Either gate:**

- **VOID** — the map "wins" C1, or the builder also answered the questions. Re-run
  or abandon; do not report a result from a broken protocol.

Phase 1 is authorised for whichever map passes its own gate, and only that one.

**"It looks better" is not a passing condition.** Neither is "it would be nice
once the viewer is polished" — the spike measures what was built, not what is
imagined.

## 6. What a PASS does and does not authorise

A PASS authorises **Phase 1 only**: the native architecture map described in the
brainstorm (IR, projection, deterministic layout, viewer MVP, atomic delivery,
`sonde map --check`). It does **not** authorise the agent skill, the MCP IR
surface, or the four generic diagram modes. Those have their own gates.

A PASS also inherits one non-negotiable constraint: `resolvedOf`
(`src/doc/modules.ts:89` — `COMPILER + LEXICAL`, excluding `HEURISTIC`) governs
ranking, thickness and default visibility. Any layout rule that makes a busier
edge more prominent must preserve that exclusion explicitly rather than
inheriting it by accident.

## 7. Whyline role assignment

| Role | Owns |
|---|---|
| **Implementer** | Builds the throwaway renderer. Does **not** answer the questions. Hands off when the map renders. |
| **Reviewer** | Answers Q1–Q4 and C1 cold, from both artifacts, per §4. Records answers, timings and confidence. |
| **Tester** | Adjudicates correctness against `sonde query`, checks the §4.1 cases, and applies §5 verbatim. |

Each transition is a `whyline handoff`; the verdict is a `whyline note` carrying
the rejected alternatives. **Close the handoff when done** — the `python-adapter`
handoff from August is still open and `blocked`, which is the failure mode this
run should avoid repeating.
