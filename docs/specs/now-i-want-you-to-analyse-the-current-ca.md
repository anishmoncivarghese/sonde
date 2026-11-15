# Sonde On-Demand Evidence-Backed Explanations

## Why

Sonde can already index TypeScript, resolved Python, and Swift into a local SQLite graph; distinguish `COMPILER`, `LEXICAL`, and `HEURISTIC` evidence; retain unresolved and external references; report freshness and degraded states; answer targeted graph and impact queries; and generate deterministic module-level Markdown. It also contains a self-contained HTML module map whose usefulness gate has not been adjudicated.

Those capabilities do not yet answer the most common newcomer question: “how does this feature work, and where should I read next?” The module artifacts describe directory coupling, while the three MCP tools work best after the caller already knows a symbol or path. In four recorded trials, agents with those tools available still used grep. One external `ARCHITECTURE.md` remained structurally unchanged across 278 commits. The evidence therefore points to a grain and routing gap, not to a need for another whole-repository graph.

Sonde will become an on-demand explanation system for code. Given one structural question, it will return the smallest evidence-backed artifact that answers that question. Repository orientation remains module-grained. A new focused workflow will explain a bounded static path from a symbol or the likely impact of selected or changed symbols. It will preserve Sonde’s differentiator: every topology claim comes from the index, every uncertainty remains visible, and static reachability is never described as runtime execution.

The product hypothesis is falsifiable: on unfamiliar repositories, a focused explanation must improve at least two feature- or change-comprehension tasks over file-tree/grep and the current Sonde tools, without harming a direct-lookup control. If it does not, Sonde does not productize that projection.

## Decisions

1. The product unit is an explanation, not a diagram. Rendering is a reader-specific view over indexed evidence.
2. Sonde has two independent grains: whole-repository orientation through `sonde doc` and only those `sonde map` views retained by their frozen gate; focused flow and impact through a new `sonde explain` command.
3. The focused CLI is explicit: `sonde explain flow` and `sonde explain impact`. It does not overload `sonde map`, because module coupling, static flow, and change impact make different claims.
4. Focused explanations ship as deterministic Markdown first. HTML is added only when a human comparison proves that it improves comprehension for that projection. JSON is added only when an agent consumer demonstrates a need for a token-bounded packet.
5. The first implementation has no public visualization or explanation schema. A small internal `ExplanationEnvelope` is introduced only when a second sink for a winning projection would otherwise duplicate semantics.
6. Agents and models may select a seed, scope, grouping, or wording; they may not add, remove, retarget, or promote indexed topology. Optional model prose is outside the initial release and can never alter nodes or links.
7. Artifact usefulness and intent routing are separate experiments. The explanation must pass its comprehension gate before a `sonde-explain` skill is tested in fresh agent sessions.
8. The MCP surface remains at three tools. A bounded `query_graph` pattern is preferred over a fourth tool, and is added only if a measured shell-less workflow cannot obtain a winning explanation from the current surface.
9. Per-symbol and per-diff output goes to stdout by default. Files are written only to an explicit repository-contained path, carry a Sonde ownership marker, and are not intended for routine commit.
10. Sonde does not become a general diagram authoring product. Non-code, future-system, workflow, lifecycle, and user-invented topology belong in a tool such as Archify.

## Design

### 1. Delivery gates and ordering

Work proceeds through independent gates; later phases cannot be used to justify an earlier one.

| Phase | Deliverable | Gate | Authorized next step |
|---|---|---|---|
| 0 | Existing complete and simple module maps | Frozen Q1–Q6/C1 protocol in `probes/visual-map/PROTOCOL.md` | Retain and document only the views and claims that pass |
| 1 | Discoverability for already validated surfaces | Clean-install and degraded-output verification | Release documentation without changing graph semantics |
| 2 | Throwaway focused Markdown packets | Comprehension comparison described in §8 | Productize only each passing projection |
| 3 | `sonde explain` for passing projections | Engineering acceptance and clean-install verification | Make the command a supported CLI surface |
| 4 | Thin `sonde-explain` skill | Fresh-session routing evaluation | Publish the skill separately from the CLI runtime |
| 5 | Bounded MCP pattern or deterministic prose | Measured residual gap in a supported workflow | Add only the smallest missing capability |

Phase 0 uses the artifacts already named by its protocol. Until the reviewer answers the fixed questions and the tester records `PASS`, `MARGINAL`, `FAIL`, or `VOID`, no work may add an orientation preface to `ARCHITECTURE.md`, change either map, or advertise `sonde map`. A marginal verdict stops for a human decision. A failed view remains research code until the human explicitly decides whether to keep or remove it and updates the stable `AGENTS.md` rule in the same change.

`sonde doc` is not under that gate and may be added to the README command inventory and `sonde init` guidance immediately. If a map passes, its documentation names the exact protocol questions it improved rather than making a general usefulness claim.

Phase 2 may run while the independent map review is pending because a symbol-level explanation tests a different hypothesis. A result from either gate neither passes nor blocks the other.

### 2. User intents and routing

The supported routes are fixed by the evidence Sonde has:

| Intent | Route | Result |
|---|---|---|
| “How is this repository organized?” | `sonde doc`; a retained `sonde map` only for validated human tasks | Whole-repository module orientation |
| “Where is this symbol?” | `find_symbols` or `sonde search` | Ranked symbol candidates, no generated artifact |
| “Who calls/imports/implements this?” | `query_graph` or `sonde query` | Direct tier-separated structural result |
| “How does this code path work?” | `sonde explain flow` | Bounded static call/reference paths |
| “What may this edit affect?” | `sonde explain impact` or existing impact tool | Reverse impact, omissions, and structurally related tests when available |
| Ambiguous feature wording | Resolve candidates with `find_symbols`; if no unique seed emerges, ask for a symbol or file | No guessed seed |
| Non-code or future-system diagram | State that Sonde has no repository evidence and refer to an authoring tool | No Sonde topology |

The initial CLI does not claim to understand free-form intent. A later skill performs the routing above and invokes commands that have already passed their own gates. `--question <text>` may preserve the user’s wording in an artifact, but it is metadata only and cannot influence graph construction.

### 3. CLI contract

Focused explanation is a separate command family:

```text
sonde explain flow [path] --symbol <key-or-name> [--to <key-or-name>]
  [--max-depth <n>] [--max-nodes <n>] [--question <text>]
  [--out <repo-relative-file>]

sonde explain impact [path]
  (--symbol <key-or-name>... | --from-git-diff)
  [--max-depth <n>] [--max-nodes <n>] [--token-budget <n>]
  [--question <text>] [--out <repo-relative-file>]
```

Both commands write Markdown to stdout when `--out` is absent. `--symbol` accepts a stable key, a unique qualified name, or a unique short name, in that order. A non-unique name is an error with candidate stable keys; Sonde never chooses one by score. `flow --to` requests paths between two resolved seeds. Without `--to`, flow reports a bounded forward path forest from the seed. Impact requires one or more explicit symbols or the current working-tree diff, never an implicit combination.

Defaults are depth 3 and 100 semantic nodes, bounded additionally by a two-second wall clock. User values may lower these limits but may not exceed the product safety caps of depth 6 and 500 nodes. Impact retains the current token-budget behavior and its estimated-token disclosure. Flow adds token budgeting when JSON or another agent sink is introduced; the Markdown-only release is bounded by nodes, depth, and wall clock.

Exit status is zero when a truthful explanation was produced, including a result with no indexed path. Missing indexes, invalid arguments, ambiguous seeds, unsafe output paths, schema mismatches, or refused overwrites are non-zero. Truncation and degraded evidence are successful but visibly qualified results.

### 4. Static-flow projection

Flow begins from one resolved symbol and walks outgoing `CALLS` and `REFERENCES` edges breadth-first. `CALLS` is a declaration target, not a runtime dispatch target. `REFERENCES` is shown when it adds a structural relationship not already represented by the same call site. Duplicate symbol-to-symbol links collapse while preserving their source sites and strongest evidence tier.

Traversal and presentation obey these rules:

- Every place this design orders edges uses one total **edge comparator**: `COMPILER` before `LEXICAL` before `HEURISTIC`; then descending `score()` from `src/query/rank.ts`, evaluated for the candidate symbol reached by the lookup with `pathFocusMatch: false`; then, only when both edges are `HEURISTIC`, descending confidence; then ascending stored-edge source stable key, destination stable key, relationship kind, site line, and edge id. A missing site line sorts after every numbered line. Tier therefore always beats score, and confidence never reorders `COMPILER` or `LEXICAL` evidence.
- Resolved links form the primary numbered paths. Possible links are a separate, non-recursive lookup of outgoing `HEURISTIC` `CALLS` and `REFERENCES` edges from the seed and each node on a resolved primary path. They are ordered with the edge comparator, are never expanded, and cannot bridge a missing resolved segment while being displayed as a continuous fact.
- Implementation fan-out is a separate, non-recursive lookup: from the seed and each node on a resolved primary path, take at most one reverse `IMPLEMENTS` or `INHERITS` hop, order those edges with the edge comparator, and label every result “implementation fan-out.” A fan-out node is never a BFS parent or predecessor, never extends a primary path, and is not silently converted into `CALLS`.
- Each hop includes source stable key, destination stable key, relationship kind, tier, source path, and call/reference site line when recorded.
- External and unresolved references are counts and named caveats, not invented terminal nodes.

For `score()`, candidate traversal distance is the destination's displayed depth from the seed; a non-recursive possible-link, fan-out, or test row uses its owning path node's depth plus one. When multiple database edges describe the same source, destination, and relationship kind, the first under the edge comparator is the representative path edge. Rendering retains all distinct source sites in comparator order and reports the representative's strongest tier; the duplicate rows do not create additional paths.

Forest mode and targeted mode deliberately use different algorithms:

**Forest mode (no `--to`).** Run level-order breadth-first search with the seed already in a global discovered set and with one parent pointer per discovered symbol. At each level, gather the outgoing resolved `CALLS` and non-duplicate `REFERENCES` candidates for the entire frontier, sort them with the edge comparator, then accept them in that order. The first edge to a destination records its parent and enqueues it once. A later edge whose destination is its own source or an ancestor of its source in the recorded parent chain is a cycle and is never enqueued. It renders as `cycle to <stable-key>; first shown as seed` when it returns to the seed, otherwise as `cycle to <stable-key>; first shown at <path-number>`. Thus a self-loop is a cycle. Any other edge to an already discovered destination renders as `shared node <stable-key>; first shown at <path-number>` and is never enqueued, so a diamond is disclosed as shared structure rather than mislabelled as a cycle.

After BFS fixes the tree, emit children depth-first from the seed, ordering sibling edges with the edge comparator. Number emitted paths from 1 in that depth-first order. Each accepted tree edge contributes one numbered forest path: the complete root-to-that-edge's-destination parent-tree path, not an arbitrary walk or only the final edge. A node's “first shown” number is the lowest-numbered emitted path containing it; that number is used by later `cycle` and `shared node` annotations. This yields one deterministic spanning tree plus explicit non-tree links.

**Targeted mode (`--to`).** Run level-order breadth-first search over resolved edges with a distance map and a predecessor list per symbol, not a global visited set that discards alternate parents. On first reaching a symbol, record its distance and predecessor; on reaching it again at the same distance, append the predecessor; discard longer arrivals. When the target is first reached at distance `d`, finish the whole frontier at distance `d - 1`, do not expand depth `d`, and retain every comparator-ordered predecessor edge that belongs to an equal-shortest seed-to-target path. Distances strictly increase along the resulting DAG, so every reconstructed path is simple and cannot contain a cycle.

Emit those paths depth-first from the seed, following outgoing DAG edges in edge-comparator order and emitting a path whenever the target is reached. Number paths from 1 in that emission order. A symbol's first path is the lowest-numbered emitted path containing it. When a later displayed path contains that symbol, its occurrence renders as `shared with path <first-path-number>`, never as a cycle. Cyclic and longer non-shortest edges are not part of a targeted path; their unresolved/external evidence remains in the caveat counts. Depth, node, and wall-clock caps apply while building the DAG. If all equal-shortest paths cannot fit the node or time cap, render the deterministic prefix of depth-first paths that fits, mark the result truncated, and state the omitted path count when it is known.

A requested `--to` result therefore returns every equally short resolved path when the bounds permit. If none exists, it says no indexed path was found within the stated bounds and reports relevant unresolved evidence.

In this document, **semantic rank** means the numeric result of the existing `score()` function in `src/query/rank.ts` using the reached candidate symbol's traversal distance, inbound usage fan-in, and exported flag, always with `pathFocusMatch: false`. It is not a new scoring formula. The edge comparator above is the only authority for edge order; renderers do not add another ranking rule.

Under `## Static structural paths`, every flow includes: “This is declaration reachability from a static index, not a runtime trace, branch order, timing sequence, or proof that a target executes.”

### 5. Change-impact projection

Impact reuses the existing all-tier reverse breadth-first traversal over `CALLS`, `REFERENCES`, `IMPLEMENTS`, and `INHERITS`, including its freshness envelope. `COMPILER`, `LEXICAL`, and `HEURISTIC` results remain together in their existing depth groups and are ordered within each frontier by the edge comparator; heuristic impact evidence is visibly tiered but is not split into flow's “possible links” section. `IMPLEMENTS` and `INHERITS` are ordinary reverse-impact edges here, not flow-style implementation fan-out. Explicit symbols are resolved by the same rules as flow. `--from-git-diff` maps changed files and ranges to indexed symbols; an unavailable Git state is an error rather than an empty diff.

The result separates:

1. seed symbols and why each was selected;
2. direct dependants;
3. transitive dependants grouped by depth;
4. structurally related tests, when `TESTS` evidence exists;
5. unresolved references, omitted nodes, and bound-trigger reasons.

`TESTS` links remain `HEURISTIC` and the artifact always states that structural relatedness does not prove coverage. If the current index contains no test-relation producer, the section says that test evidence is unavailable; it does not infer tests from filenames or claim that no tests exist.

Both focused projections populate that section through the same direct, seed-scoped `TESTS` lookup after seed resolution and outside their flow or reverse-impact walks. For flow, the lookup uses only the source seed, not the optional `--to` target or symbols encountered along a path. For impact, it uses the explicit or diff-derived seed set. It queries incoming `TESTS` edges once, does not recursively expand them, deduplicates test symbols and files, orders the retained edges with the edge comparator, and uses the request's remaining node allowance. These rows never enter a primary flow path, never expand the impact frontier, and remain visibly `HEURISTIC`. Until a real producer exists, both projections render the identical unavailable-evidence sentence.

The output uses “may affect,” never “will break” or “blast radius.” A change-impact explanation is complete only with respect to the displayed traversal bounds and indexed evidence.

### 6. Markdown artifact

Every focused artifact starts with the exact ownership marker `<!-- sonde:explanation:v1 -->` and H1 `# Sonde explanation`. The remaining H2 sections have this fixed order:

1. `## Request` — question, projection, seed set, explicit target if any, bounds, and generation command, in that field order.
2. `## Evidence state` — repository root hash, revision, dirty state, index time, freshness state, drift count, and compiler/toolchain provenance, in that field order.
3. `## Answer` — the compact deterministic summary.
4. `## Static structural paths` for flow, containing its numbered paths, or `## Impact by depth` for impact, containing seed symbols followed by depth groups in ascending depth.
5. `## Read next` — exactly two recommended next source files when two evidence-backed files exist; otherwise all available files and the exact shortfall sentence below.
6. For flow only, `## Possible links and implementation fan-out` — possible heuristic links first, then the one-hop fan-out rows. Impact omits this heading and section entirely because heuristic edges and `IMPLEMENTS`/`INHERITS` already appear in the all-tier depth groups.
7. `## Structurally related tests` — the direct seed-scoped rows and coverage caveat.
8. `## Limits and warnings` — warnings, unresolved/external counts, truncation, omitted count, parse failures, and the static-analysis disclaimer.

Locations are repository-relative and include line numbers. Stable keys, relationship kinds, and tiers remain visible in a compact evidence table. Color is never the only evidence cue in an HTML sink. Every edge-backed row and path uses the edge comparator; no renderer-specific ordering is permitted.

The next-file section is selected mechanically; renderer judgment cannot change it. Build a list of distinct repository-relative non-test source files by taking the first occurrence in this evidence order:

1. files containing resolved seed symbols, ordered by seed stable key; the seed file counts because it is the first source a newcomer must read;
2. files containing symbols in the primary projection, ordered by ascending displayed depth, evidence tier (`COMPILER`, `LEXICAL`, `HEURISTIC`), descending `score()` with `pathFocusMatch: false`, ascending symbol stable key, then ascending repository-relative path;
3. for flow only, files reached solely through labelled implementation fan-out, in that same depth, tier, score, symbol-key, and path order;
4. for flow only, files reached solely through possible heuristic links, in that same depth, tier, score, symbol-key, and path order.

This is a file-candidate sequence, not a second edge comparator: path emission order is used to number and render paths, while the sequence above recommends what to read. For impact it preserves the existing depth-group order—seed files first, then affected-symbol files—and does not reintroduce a possible-links or fan-out section.

For `flow --to`, the source seed file qualifies as a seed. The explicit target file qualifies as primary evidence only if the target is reached by a displayed resolved path. If the target is not reached, naming it with `--to` does not itself make its file a recommendation; that file appears only if it independently qualifies through the fan-out or possible-link rules above. For impact, all resolved seed files qualify before affected files. A file keeps its earliest qualifying position, and duplicate symbols or paths do not create another candidate. Files present only through `TESTS`, unresolved names, external references, parse failures, or guessed filename similarity do not qualify; tests already have their own caveated section. Emit the first two qualifying files. If there is one, emit it followed by `Only one evidence-backed next source file exists for this scope.` If there are none, emit `No evidence-backed next source files exist for this scope.` The renderer never pads the section with an unindexed or lower-authority guess.

Markdown emitted to stdout has no timestamps. When traversal completes without the wall-clock stop firing, the same repository state and arguments produce byte-identical semantic output. A wall-clock-truncated result remains truthful and identifies that bound, but timing-dependent cutoff output is excluded from the byte-identical guarantee and deterministic golden comparison. A file artifact may include a generation time only in a clearly separated volatile receipt excluded from semantic equality and sink-equivalence comparisons. Focused artifacts do not add or modify `ARCHITECTURE.md`.

### 7. Internal seams and multi-sink consistency

The Phase 2 probe lives under `probes/focused-explanation/` and calls existing query, impact, pack, and repository-boundary code. It may define probe-local data structures, but none is exported from `src/` or treated as a compatibility promise.

When a passing projection gains a second output sink, production code introduces an internal, non-exported `ExplanationEnvelope` with these semantic fields:

- format version, projection, question, scope, and bounds;
- repository revision, dirty/freshness state, drift, and toolchain provenance;
- resolved seeds and optional target;
- semantic nodes with stable keys and source locations;
- links with kind, tier, site, depth, and explicit inference labels;
- recommended files;
- warnings, unresolved and external counts, truncation, omissions, and test caveat.

Renderers consume that envelope without database access. HTML-only layout coordinates, dimensions, zoom state, and styling never enter the envelope. Two sinks for one request must agree on every semantic field; sink equivalence is tested after removing presentation-only data.

The internal type is not added to package exports and is not called a public IR. It becomes public only after at least two independently useful external consumers require compatibility, through a later design review.

### 8. Focused-explanation experiment

Before production code, freeze an evaluation protocol and answer key in separate commits. Use at least one unfamiliar permissively licensed repository in addition to Sonde. The task set contains:

- at least two feature/static-flow comprehension questions;
- at least two change-impact questions, including a working-tree diff;
- at least one identifier-poor question;
- one exact direct-lookup control expected to favor the current tools.

Compare three conditions: file tree plus grep/read, the current three Sonde tools, and the focused Markdown packet placed directly in the participant’s hands. For the packet condition, the evaluator uses the pre-committed answer key to resolve the seed before the run; this deliberately measures artifact comprehension rather than seed discovery. The later skill experiment measures whether an agent can choose and seed the workflow.

For every question, record correctness against reviewed graph/source evidence, elapsed time, exploratory reads and tool calls, context bytes or estimated tokens, stated confidence before adjudication, and whether the participant recognized uncertainty and static-analysis limits. A disposable HTML rendering of the identical semantic packet may be a separate human condition, but is not production code or a `sonde map` mode.

A projection passes only if it improves at least two comprehension tasks over the appropriate baseline without reducing correctness on the direct-lookup control. A single-participant run does not use a fabricated percentage or timing threshold. A marginal qualitative result stops for a human decision; a failure ends investment in that projection. The protocol, raw answers, answer key, and verdict remain in the repository.

### 9. Agent skill

After at least one focused projection ships, prototype `sonde-explain` in a probe directory and test it in fresh sessions. The skill contains only routing and usage guidance:

- vague symbol discovery uses `find_symbols`;
- direct relationship questions use `query_graph`;
- edit safety uses impact;
- repository orientation uses `sonde doc` and only a retained map view;
- feature flow uses a shipped `sonde explain flow`;
- ambiguous focus asks for a symbol or file;
- non-code diagram requests state that Sonde has no evidence and stop.

The skill returns compact Markdown or JSON to the agent and only a path or launch instruction for human HTML. It never inserts HTML or SVG into model context. It is published from a separate skills repository only if fresh agents select the appropriate Sonde route more often and require fewer exploratory reads than sessions without the skill. Grep remains valid for text search; “zero grep” is not a success criterion.

### 10. Optional MCP and prose extensions

No fourth MCP tool is part of this design. If a documented shell-less client cannot receive a passing focused packet through existing calls, extend `query_graph` with a bounded `paths_from` pattern accepting one stable seed, an optional stable target, maximum depth, maximum nodes, and token budget. It returns semantic nodes and tiered links inside the existing response envelope. It performs no file writes and contains no HTML, SVG, or layout data.

Deterministic orientation or explanation sentences may be rendered from the semantic envelope after the underlying projection passes. Model-written prose remains opt-in, local-first where possible, citation-backed, visibly labelled `agent-inferred`, and removable without changing topology. Indexed topology is labelled `sonde-indexed`; manifest and configuration facts are `repository-cited`; user wording is `user-authored`.

### 11. Authority, security, and artifact lifecycle

All repository reads and writes use `src/repo/boundary.ts`. Output paths are repository-relative, canonicalized, and rejected if they escape through traversal or symlinks. Sonde never executes target repository code and never loads its TypeScript dependency.

A file write follows this sequence: render completely in memory; validate referential integrity and repository-contained links; write a sibling temporary file; flush and close it; atomically rename it over a Sonde-owned destination. An existing file without the exact ownership marker is never overwritten. A render, validation, or rename failure leaves the prior good artifact untouched and removes only the known temporary file.

Focused output defaults to stdout because per-symbol and per-diff artifacts have high churn. Documentation recommends a gitignored directory such as `.sonde/` for retained local files. Whole-repository `ARCHITECTURE.md` remains the only artifact designed for routine commit, subject to the existing ownership and `--check` rules.

## Error handling

Sonde degrades with a warning whenever it can still produce an honest partial explanation, and fails before writing when it cannot identify or contain the request.

| Condition | Required behavior |
|---|---|
| No index or schema mismatch | Non-zero exit, no artifact, exact `sonde index` or rebuild instruction |
| Seed absent | Non-zero exit with the attempted identifier and suggested `sonde search` command |
| Seed ambiguous | Non-zero exit with bounded candidate stable keys; never select one automatically |
| `flow --to` has no path | Zero exit with “no indexed path within bounds,” unresolved evidence, and no fabricated bridge |
| Git state unavailable for `--from-git-diff` | Non-zero exit; never interpret unknown as no changes |
| Dirty repository or index drift within supported read behavior | Generate with dirty/drift state in the header and warnings |
| Drift, parse failure, or missing toolchain causes partial evidence | Preserve the partial result, mark affected evidence, and give the corrective command |
| Depth, node, time, or token bound fires | Zero exit with `truncated`, omitted count where known, and the exact bound that fired |
| Unsafe output path or escaping source link | Non-zero exit before writing |
| Existing unmarked destination | Refuse overwrite and preserve both user file and last good Sonde output |
| Rendering or atomic replacement fails | Non-zero exit, remove the owned temporary file, preserve the prior artifact |
| Optional model annotation fails | Return the deterministic explanation without model prose and warn; topology is unchanged |

Unexpected internal errors are concise on normal output and include a diagnostic stack only under the existing debug mechanism. Repository contents are treated as untrusted data in Markdown and HTML: text is escaped, links are contained, and no repository string is executed as script or markup.

## Testing

Implementation follows test-first development. Tests are layered around semantic truth rather than screenshots alone.

1. Unit tests cover seed resolution precedence and ambiguity refusal; the exact edge comparator, including `pathFocusMatch: false`, confidence affecting only `HEURISTIC`, nullable site lines, and edge-id final ties; forest BFS parent selection; a self-loop and ancestor back-edge labelled `cycle`; a diamond cross-edge labelled `shared node`; root-to-node forest paths numbered from 1 by depth-first emission; the `--to` predecessor DAG retaining every equal-shortest path while rejecting longer paths; targeted paths numbered from 1 by depth-first emission; shared nodes across targeted paths labelled `shared with path`; heuristic separation; one-hop reverse implementation fan-out that never becomes a BFS parent; depth/node/time bounds; and deterministic ordering under reversed database input.
2. Next-file unit fixtures lock the priority order and deduplication for seed files, resolved primary paths, implementation fan-out, and heuristic-only files. Separate cases assert that the seed file counts, an unreached `--to` target does not qualify merely because it was named, an independently qualifying target does, test-only files do not qualify, exactly the first two distinct files are emitted, and the zero- and one-file shortfall sentences are exact.
3. A shared `TESTS` lookup test runs both projections against the same seeds and asserts identical direct test rows and caveat wording, no lookup from a flow target or traversed node, no recursive expansion, no primary-path or impact-frontier contamination, and visible `HEURISTIC` evidence.
4. Golden tests render flow and impact Markdown from fixed graphs and assert exact output, including the ownership marker and heading order; cycle-versus-shared labels; multiple equal-shortest paths; path numbers; the two next-file recommendations and both shortfalls; seed-scoped tests; impact's existing all-tier depth groups; the absence of the possible-links/fan-out heading from impact; and dirty, partial, unresolved, node-truncated, missing-compiler, and unavailable-test-evidence states. Wall-clock-truncated output is tested for its warning and successful status but is excluded from byte-equality assertions.
5. Invariant fixtures include the Swift/TypeScript adapter pair: heuristic name volume must never become a primary path, thicker edge, or higher-ranked result. Member access remains `HEURISTIC`; `TESTS` never implies coverage; static paths never use runtime wording.
6. Security tests cover `..`, absolute paths, symlink escapes, hostile Markdown/HTML strings, unmarked destination refusal, interrupted rendering, and last-good preservation. All repository access is exercised through `RepoBoundary`.
7. Integration tests index TypeScript, resolved Python, and Swift fixtures, run both explanation projections, and compare locations and tiers to direct graph queries. Missing Python/TypeScript resolution produces warnings rather than silent demotion.
8. Multi-sink tests become mandatory when a second sink is added. Markdown, JSON, and HTML models must match on revision, scope, seed, nodes, links, tiers, warnings, truncation, omissions, and provenance.
9. CLI tests cover stdout-by-default behavior, explicit contained output, exit codes, deterministic reruns in cases where the wall-clock stop does not fire, ambiguous seeds, empty paths, diff mode, and ownership-marker protection.
10. The Phase 0 module-map protocol and Phase 2 focused-explanation protocol are acceptance tests. Their frozen thresholds are not changed after results are observed.
11. Before every release, install the packed published candidate into an empty directory. Exercise the headline command against throwaway TypeScript and resolved-Python repositories, read the artifacts, verify repository-contained links, and inspect both the presence and absence of degraded warnings. Run `npm test`, `npm run typecheck`, and the existing oracle/benchmark checks before packing.

Engineering acceptance requires zero fabricated indexed nodes or links, preserved source sites and evidence tiers, byte-deterministic semantic output when the wall-clock stop does not fire, truthful timing-bound disclosure when it does, visible freshness and degraded states, bounded traversal, accessible non-color cues for any HTML, and no regression in the three existing MCP tools.

## Releases

Phase 0 and Phase 2 probes are never published. They produce protocols, raw observations, and verdicts.

The next patch release may document `sonde doc` in README and `sonde init` after clean-install verification. It includes `sonde map` documentation only if the independent verdict retains a view, and then states the specific tasks that view improved. A failed or marginal map is not marketed as a supported orientation capability.

The first release containing `sonde explain` is a minor release and contains only projections that passed Phase 2. Its headline surface is deterministic Markdown to stdout plus guarded explicit file output. HTML, JSON, model prose, a skill, and MCP expansion are excluded unless their respective gates have already passed; a later passing sink or interface receives its own minor release rather than being bundled on speculation.

After the skill routing experiment passes, publish the skill from a separate skills repository with a minimum compatible Sonde version. The npm package remains the local index and CLI runtime. If the MCP residual-gap condition fires, the bounded `paths_from` pattern ships as a versioned schema change in a later minor release, not as a new tool.

For every release, bump all package and MCP registry version fields together, publish npm, GitHub tag/release, and MCP Registry entries with separate commands, then query each registry to verify the new version is current. Finally, install the published package into a clean directory and run the release’s headline workflow against throwaway repositories. Release notes report the evaluation protocol and outcome, supported languages and degraded modes, static-analysis limits, and which proposed projections or sinks were deliberately not shipped.

## Amendments — 2026-11-15

Made after a repository audit recorded in
`docs/reviews/2026-11-15-plan-audit.md`. The text above is left as written so
the original reasoning stays readable; where it conflicts with this section,
this section governs.

1. **§1, Phase 0 measured the wrong artifact.** "Phase 0 uses the artifacts
   already named by its protocol" pins the gate to
   `probes/visual-map/map.html` and `map-simple.html`, the Phase 0 spike. The
   `sonde map` command built afterwards adds search, transitive reach and a
   direction toggle, so its output is a different artifact that no gate has
   measured. A verdict on the spike cannot retain or reject a view of the
   command. The spike gate is closed on the evidence that exists, and the
   command gets its own protocol under `probes/sonde-map/`.
2. **The Phase 0 gate was not unadjudicated.** A cold human run took place on
   2026-10-06 and was never written into the repository. It is now retained in
   `probes/visual-map/audit/HUMAN-RUN-2026-10-06.md`, with its defects listed.
3. **No answerer with repository access is cold for Q1–Q6.** The answers are
   published in `CHANGELOG.md`, in commit `3f9cd28` and in the audit directory.
   This, not a relay configuration fault, is why MAP-GATE-1 could not complete.
4. **The map's reader is a human.** The owner decided this on 2026-10-06. An
   agent driving a browser therefore measures the wrong reader, and the gate
   for the command requires a human answerer who built nothing and drafted no
   question.
5. **Stimuli are committed and hashed.** The spike's stimuli were git-ignored
   files on one machine, and the Markdown and the maps described different
   revisions when the relay run compared them.
6. **§8 gains an isolation rule and a locality rule.** Answerers work in an
   exported copy with no history, decisions, probes or changelog, and a
   projection cannot pass on this repository's tasks alone. Both were added
   before any focused-explanation result exists.
7. **"Releases" gains a patch that waits for no gate.** A fixed defect in
   `sonde doc` and a false warning in the pyright pass ship as 0.4.5 with
   `sonde map` hidden. See `plans/patch-0.4.5.plan.md`.
