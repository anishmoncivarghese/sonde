# Phase 0 spike — build record

**Role:** implementer. **Status:** the map renders; the questions are unanswered
and must stay that way until a different party answers them (PROTOCOL.md §4.2,
§7). A run in which the builder also answers is **VOID** under §5.

Regenerate with:

    node --import tsx probes/visual-map/render.ts . probes/visual-map/map.html

`probes/visual-map/map.html` is a build output and is not committed.

## What was built

One self-contained HTML file over the existing `buildModuleGraph` output. No IR,
no schema, no CLI command, no viewer framework, no network dependency. 24
modules, 95 resolved-or-weak edges, 157 unverified pairs hidden behind a toggle.
Click a module to focus it; the rest of the graph dims and a panel lists its
inbound and outbound dependencies with reference counts and its surface.

## Decisions a reader would otherwise wonder about

**The renderer draws structure; it does not compute answers.** There is
deliberately no "cycles found" readout and no "riskiest module" ranking, even
though both are a few lines of code and both would have made the map win its own
protocol. Printing the answer to a question into the artifact under test
measures this file's feature list, not whether a graph helps someone see
structure — and the Markdown generator could print the same strings just as
easily. What the map does instead is encode structure *geometrically*: mutual
dependencies draw as two bowed arcs rather than one line, and inbound edges
converge visibly on a node. The reader still has to read it.

**Three evidence states, not two.** `resolvedOf > 0` was the obvious filter and
it was wrong. `src/adapters/typescript -> src/adapters/swift` carries **1**
LEXICAL reference against **38** heuristic name matches, so it passed that
filter and drew as a solid line indistinguishable from `src/resolve ->
src/adapters`, which carries 68. §4.1 requires this spike not to make that pair
look resolved, so edges now split on evidence majority — a stated rule rather
than a tuned cut-off:

| state | rule | drawn as |
|---|---|---|
| resolved | `resolvedOf > HEURISTIC` | solid, width scaled by `resolvedOf` |
| weak | `resolvedOf > 0` but heuristic majority | long dash, warning colour |
| unverified | `resolvedOf == 0` | short dash, hidden by default |

The reverse pair, `swift -> typescript` with 62 heuristic and 0 resolved, is
unverified and not drawn unless the toggle is on. Thickness tracks `resolvedOf`
throughout and never `total` (`src/doc/modules.ts:89`).

**Every module is drawn, including those with no dependency at all.** The first
version filtered to modules touched by an edge, which quietly dropped two. The
Markdown lists all of them, so dropping any would have shrunk the architecture
being compared.

**The whole graph must fit on screen.** The first layout was 8460px wide for
eight occupied columns — longest-path ranking over a cyclic graph reached rank
31 with most ranks empty — which squashed the drawing into an unreadable band.
Ranks are now compacted to consecutive columns and the view fits, with wheel
zoom and drag to pan. A map that shows only a scroll window of itself is a worse
table, and would have failed this spike for a reason unrelated to graphs.

**Layout is deterministic.** Columns come from longest-path rank over the
resolved subgraph, with alphabetical ordering inside each column and an
iteration cap rather than edge-dropping to handle cycles. The spike will be
regenerated; a layout that moves between runs cannot be compared with itself.

## §4.1 required cases

- **Dense graph** — done. The full 24-module set at the repository's real
  density, not a convenient slice.
- **Freshness / degraded** — done. Generated against a dirty worktree; the map's
  stamp reads `bf0d502 (dirty worktree) · 4 drifted file(s) · 28 all-test
  module(s) excluded · resolved 1008 / heuristic 1821` and matches `sonde doc`'s
  header exactly. It did not at first: passing no `nestedProjectRoots` counted
  three vendored fixture repositories as architecture and produced 1044/1861
  against the document's 1008/1821. The spike now calls the same
  `findNestedProjectRoots` the document calls rather than a copy that could
  drift. That export is the only change to `src/` this spike required.
- **Heuristic-heavy pair** — done, above.
- **MCP-only walkthrough** — written below. No code.

## MCP-only walkthrough

An agent with no shell has `find_symbols`, `query_graph` and
`get_impact_radius`. Against those, an HTML map is **inert**: there is no MCP
surface that returns it, no browser to render it, and a 60 KB document of SVG
geometry is worse than useless in a context window. Everything the map encodes —
inbound and outbound edges, tier counts, surface — is already reachable through
`query_graph` as structured data, which an agent can filter and an image cannot.

The honest reading is that the map's audience is **human-only**, and that this
is a narrower claim than the brainstorm assumed. It also sits against the two
measurements in §1.1: the artifact does not change (278 commits, no module-graph
change), and in four real trials an agent with these tools available answered
structural questions by grepping instead. A human-only, one-time-orientation
artifact is a real thing to want. It is not an agent capability, and Phase 1
should not be argued for as one.

## Handoff

Next role is the **reviewer**, who answers Q1–Q4 and C1 cold from both
artifacts in the counterbalanced order of §4.3, recording confidence before
checking. The tester then adjudicates against `sonde query` and applies §5
verbatim. One thing the reviewer will hit immediately and should record rather
than work around: modules are directories, so Q1's `src/store/repos.ts` resolves
to `src/store` in both artifacts. That granularity limit is shared, so the
comparison stays fair, but it is a limit on the question rather than on either
artifact.
