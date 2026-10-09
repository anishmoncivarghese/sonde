# Brainstorm: Now I want you to analyse the current capability of sonde and I want to add feature like https://github.com/tt-a1i/archify offers using which it becomes more useful something like I cna create a .md file plus ismilar to archfy on demand, reason so that sonde can be useful for the AI agents, developers and vibe coders who do not have understanding of the code so we have to make thme a way they can understand how there project or prgam works so that they can better undersatnd whats going inside . So lets do  brainstorm and create a plan for modifying sonde and making it much more useful

## Final Synthesis

Sonde should not become a general-purpose Archify clone. It should become an **on-demand, evidence-backed explanation system for code**: a user asks one question about an unfamiliar repository, and Sonde returns the smallest trustworthy artifact that answers it.

The product direction is **dual-grain understanding**:

1. **Repository orientation:** the existing module-level `sonde doc`, plus `sonde map` only if its open usefulness protocol retains it, answers “what are the major pieces and how are they coupled?”
2. **Focused explanation:** a new, scoped workflow answers “how does this feature work?”, “where should I start reading?”, and “what may this change affect?” using bounded symbol paths and the existing impact traversal.

This keeps the strongest idea from Archify—plain-language intent compiled into a focused, self-contained artifact—while rejecting its authority model. Archify can author topology; Sonde must only project topology supported by its index.

### Why this is the right gap

Sonde already has the hard foundation: TypeScript, resolved Python, and Swift symbols in SQLite; explicit `COMPILER > LEXICAL > HEURISTIC` evidence; unresolved and external references; freshness and degraded-state warnings; `find_symbols`, `query_graph`, and `get_impact_radius`; deterministic `ARCHITECTURE.md`; and an implemented but not yet usefulness-validated HTML module map.

The missing layer is not another whole-repository graph. It is **routing and comprehension at the grain of the user's question**:

- Module documents explain directory coupling, not a feature or request path.
- Current graph tools work best after the caller already knows a symbol or path.
- Recorded agent trials show that merely making tools available does not make agents choose them; they fell back to grep.
- One external module document remained structurally unchanged across 278 commits, suggesting that whole-repository orientation is occasional, while feature and change questions are operational.

The central hypothesis to test is therefore:

> Can a focused Sonde explanation help an unfamiliar human or agent answer feature and change questions more correctly, with fewer exploratory reads and less context, than the file tree, grep, and today's graph tools?

### Product contract

The unit of value is an **explanation**, not a diagram. A router selects a projection appropriate to the intent:

| Intent | Evidence | Human result | Agent result |
|---|---|---|---|
| Repository overview | Existing module graph | Deterministic Markdown; self-contained HTML only if validated | Compact orientation facts |
| Feature/static flow | Bounded `CALLS`/`REFERENCES`; labelled implementation fan-out | Numbered Markdown path; optional validated HTML | Token-bounded semantic packet |
| Change impact | Existing git-diff and reverse-impact traversal | Focused impact explanation; optional validated HTML | Existing budgeted impact pack |
| Known structural lookup | Current MCP tools | Usually no generated file | Current structured response |
| Non-code or future-system diagram | No Sonde evidence | Refer to an authoring tool such as Archify | Do not fabricate inside Sonde |

Different readers should not receive the same bytes. Markdown is diffable and reviewable. JSON or compact Markdown is appropriate for an agent. HTML is an offline, self-contained human viewer and must not be placed in model context. When two formats represent one request, they must agree on revision, dirty/drift state, scope, evidence tiers, warnings, truncation, and omissions.

Every explanation must say what question it answers, identify its seed and scope, link to exact source locations, recommend the next files to read, expose uncertainty and omitted depth/budget, and state that static reachability is not runtime execution.

### Non-negotiable authority rules

- Only indexed relationships may render as discovered topology. An agent may select, hide, group, or explain evidence; it may not invent, retarget, or promote an edge.
- Member access remains `HEURISTIC`; tier outranks confidence; default prominence and thickness use resolved evidence, never raw heuristic volume.
- `TESTS` means structural relatedness, never coverage.
- A static call path is a set of declaration targets, not a runtime trace, sequence, branch history, or timing claim.
- Entry points must be classified honestly. Manifest `bin`/exports, CLI dispatchers, and tool registrations can be repository-cited candidates; “exported with no inbound callers” is not automatically a runtime entry point.
- Missing toolchains, parse failures, stale indexes, dirty state, and truncation remain visible.
- Generated files use guarded atomic replacement, preserve the last good output, refuse to overwrite unmarked human files, and keep links inside the repository.

If narrative annotations are added later, keep their authority separate: `sonde-indexed` topology, `repository-cited` explanation, `user-authored` intent, and removable `agent-inferred` interpretation. Default prose should be deterministic and local; model-written prose is optional, cited, visibly marked, and never changes topology.

### Actionable plan

**Phase 0 — finish the gate already in progress.** Transfer `visual-map-phase0` to the independent reviewer. Answer and score the frozen Q1–Q6/C1 protocol against the current artifacts, then have the tester record PASS, MARGINAL, FAIL, or VOID exactly as specified. Do not change `ARCHITECTURE.md`, add an orientation preface, advertise `sonde map`, or extend the viewer before this comparison; doing so would change the control and void the result. A PASS authorizes only the map questions it demonstrably improved. A FAIL stops investment in that view and requires a deliberate decision about the existing map code and `AGENTS.md` rule.

**Phase 1 — improve discoverability without outrunning evidence.** Document the already-shipped `sonde doc` in the README and `sonde init` now. After Phase 0, document only the map views and claims the verdict retained. Explain the difference between committed `ARCHITECTURE.md`, optional human HTML, and targeted MCP queries. Before release, verify the retained surfaces from a clean install on throwaway TypeScript and resolved-Python repositories, and inspect both clean and degraded output.

**Phase 2 — run a separate focused-explanation probe in parallel.** Build a throwaway Markdown packet over existing query and impact APIs for two projections:

- changed symbols → direct/transitive dependants → structurally related tests;
- one resolved seed → a bounded static call/reference path with locations and tiers.

Pre-commit questions on unfamiliar repositories, including at least one identifier-poor prompt and one direct-lookup control. Compare file-tree/grep, current Sonde tools, and the packet placed directly in the participant's hands. Measure correctness, time, exploratory reads/tool calls, context size, confidence, and recognition of uncertainty. A disposable HTML rendering may be tested as a separate human reading condition. Continue only when a projection improves at least two comprehension tasks without harming the control. The module-map verdict neither passes nor blocks this independent gate.

**Phase 3 — productize only winning projections.** Give focused explanation its own CLI verb—`sonde explain` is a candidate to settle during design—rather than overloading `sonde map`. Start with Markdown. Add self-contained HTML only when the human trial shows that the visual form helps; add token-bounded JSON when an agent consumer needs it. Introduce a small internal `ExplanationEnvelope` only when a second sink would otherwise drift. Reuse `buildModuleGraph`, traversal, and impact helpers as authoritative producers; layout coordinates remain renderer output, never semantic identity. Default per-symbol and per-diff artifacts to stdout or a gitignored/user-selected path rather than committed files.

**Phase 4 — test routing separately from artifact quality.** Once useful commands exist, prototype a thin `sonde-explain` skill. It should route vague intent through `find_symbols`, direct questions through `query_graph`, edit safety through impact, whole-repository orientation through `sonde doc`, and focused questions through the new command. Ambiguous requests ask for a symbol or file rather than inventing a seed. Evaluate in fresh sessions whether agents choose Sonde more appropriately and require fewer exploratory reads. Do not conflate this adoption test with the Phase 2 comprehension test.

**Phase 5 — add MCP or prose only for a measured residual gap.** Prefer a bounded `query_graph` pattern before adding a fourth tool. MCP responses contain semantic evidence, provenance, truncation, and omissions—never HTML or SVG—and do not write files. Add deterministic orientation sentences first; optional cited model prose comes last.

### Exit criteria

A successful Sonde explanation lets an unfamiliar developer, vibe coder, or agent:

1. identify the real seed or a clearly labelled entry candidate;
2. follow one bounded, evidence-tiered structural path;
3. name the next two source files to read;
4. explain what a change may affect without claiming certainty or coverage;
5. point to uncertainty, degraded evidence, and omissions;
6. reach the answer with fewer exploratory reads or less context than the appropriate baseline.

Engineering acceptance requires zero fabricated indexed nodes or edges, tier and source-site preservation across every sink, deterministic semantic output, visible degraded states, repository-contained links, accessible non-colour evidence cues, and clean-install verification.

### Explicit non-goals

Do not fork or vendor Archify; build a generic workflow/sequence/data-flow diagram suite; let an LLM author repository topology; describe static structure as runtime behavior; ship HTML through MCP; replace the three existing graph tools with pictures; commit high-churn per-symbol artifacts by default; require a hosted service or model API; or publish a large public visualization schema before multiple proven consumers require one.

The recommended sequence is therefore: **score the existing map, expose only validated current surfaces, prove focused feature and change explanations, productize the projections that win, then test a routing skill and add new MCP/prose capabilities only when measurement shows a remaining gap.** This gives humans an understandable visual or Markdown path into unfamiliar code and gives agents compact structural context without weakening the evidence model that makes Sonde distinctive.

## Codex

# Revised view: make Sonde answer “how does this work?”, not merely draw more graphs

## Recommendation

Sonde should not try to become Archify. It should become the evidence-backed explanation engine that Archify cannot be: one user question produces the smallest trustworthy explanation of the relevant code, with compact Markdown or JSON for an AI agent and self-contained HTML for a human.

There is an important correction to my independent pass. Sonde already ships `sonde doc` and an unreleased `sonde map`, but the pre-committed Phase 0 usefulness protocol for the map has not been adjudicated. The renderer was promoted into `src/map` before a separate reviewer answered the fixed questions. Therefore “the map exists” is a capability statement, not evidence that more map investment is justified.

The next move is not a larger visualization IR, a general diagram suite, or an MCP tool. It is to close the existing gate, expose the capabilities that have earned their place, and test a narrower hypothesis the module map cannot answer:

> Can Sonde help an unfamiliar person or agent understand one concrete feature, execution path, or change more correctly and with fewer exploratory reads than the current file tree, Markdown document, and graph tools?

That is the product opportunity in the user's request.

## What Sonde can actually do now

| Surface | Current strength | Current limit |
|---|---|---|
| Index | TypeScript, resolved Python, and Swift symbols and relationships in SQLite; stable keys; explicit unresolved/external references | Static structure, not runtime behaviour |
| Evidence | `COMPILER > LEXICAL > HEURISTIC`; source sites; drift and degraded-state warnings | Natural-language purpose is not derivable from edges alone |
| MCP | `find_symbols`, `query_graph`, and `get_impact_radius` answer targeted structural questions within a budget | No orientation workflow; four recorded trials show agents ignored the tools and grepped |
| Markdown | `sonde doc` creates guarded, deterministic `ARCHITECTURE.md` with modules, evidence counts, provenance, and `--check` | Whole-repository and directory-shaped; weak at “how does feature X work?” |
| HTML | `sonde map` creates self-contained simple and complete module views with search and reachability | Human-only, module-level, and not yet proven more useful than Markdown under its own protocol |
| Impact | Git-diff and symbol-seeded reverse traversal already supports “what may be affected?” | It is an agent context pack, not a newcomer explanation |

Two measurements should control the roadmap:

- One external repository's `ARCHITECTURE.md` stayed structurally unchanged across 278 commits. A module map is likely a one-time orientation aid, not a frequently consulted operational artifact.
- Agents answered four structural questions by grep even when Sonde's three MCP tools were available. Adding a fourth tool or a prettier file does not solve tool adoption by itself.

This means the core graph is strong, while the missing layer is request routing and comprehension at the right grain.

## What Archify teaches—and what it does not

Archify's most useful contribution is its interaction model:

1. Start from a plain-language request.
2. Choose a projection appropriate to that request.
3. Compile typed source data into a self-contained artifact.
4. Validate before replacing the last good output.
5. Let the user focus, route, inspect, and iterate.

Its important engineering ideas are a typed intermediate representation, projection-specific schemas, atomic delivery, receipts, source links, and progressive disclosure.

But Archify is an authored communication tool. An agent supplies topology and coordinates. Sonde is a code-evidence product. Importing Archify's authority model would erase Sonde's differentiator and violate its strongest invariant: never fabricate an edge.

So the boundary should be:

- Sonde owns discovered code topology, evidence tiers, source sites, freshness, omissions, and bounded traversal.
- A template or agent may add labels, groupings, and prose, but these are annotations with citations—not graph facts.
- Generic workflow, vacation, business-process, and future-system diagrams belong in Archify or another authoring tool, not Sonde core.
- Static call relationships must never be presented as runtime traces or chronological sequences.

Do not fork or vendor Archify. Learn from its compilation and delivery loop.

## The product shape: an on-demand Sonde Explanation

The unit of value should be an **explanation**, not a map.

Illustrative requests:

- “Give me an overview of this repository.”
- “How does `get_impact_radius` work?”
- “What could be affected by this diff?”
- “Why does the CLI depend on the store?”
- “Where should I start reading to understand Python resolution?”

The request router chooses one existing or new projection:

| Intent | Evidence source | Human output | Agent output |
|---|---|---|---|
| Repository orientation | Module graph | Existing Markdown and, only if validated, HTML map | Compact orientation summary |
| Change impact | Existing impact traversal | Focused Markdown/HTML impact view | Existing budgeted impact pack |
| Feature explanation | Bounded `CALLS`/`REFERENCES` paths plus exact sources | Focused “static flow” Markdown/HTML | Compact evidence packet |
| Direct structural question | Existing MCP query | Usually no file | Current structured response |
| Authored/non-code diagram | None | Redirect to Archify | Refusal or explicit user-authored mode outside Sonde |

The default response should be small. A user asking how one function works should not receive a 24-module poster.

### One evidence model, separate readers

Humans and agents should not consume the same bytes:

- Markdown is diffable, searchable, and suitable for review or a short agent handoff.
- JSON is the compact structured form when an agent needs to continue querying.
- HTML is a self-contained human viewer. It should never be pasted into model context.
- All three, when generated for the same request, must share revision, freshness, scope, omissions, and evidence classification.

The output should state:

- what question it answers;
- which revision and worktree state it represents;
- which nodes and relationships were included;
- which facts are compiler/lexical versus heuristic;
- what was omitted by depth or budget;
- that static reachability is not runtime proof;
- exact source locations for the next reading step.

## Authority and honesty

Use explicit authority classes only when an annotation layer is introduced:

- `sonde-indexed`: symbol, relationship, tier, confidence, and source site from the graph;
- `repository-cited`: explanatory text backed by verified file/range/hash references;
- `user-authored`: desired behaviour or context supplied by the user;
- `agent-inferred`: interpretation, visibly caveated and off by default in code maps.

Only `sonde-indexed` edges may appear as discovered topology. An agent can select or hide edges; it cannot promote, retarget, or manufacture one. A heuristic-only relationship remains heuristic everywhere. `TESTS` remains structural relatedness, never coverage.

Plain language should begin with deterministic templates. Optional model-written prose comes later, is labelled, and can be dropped without changing the underlying artifact.

## Minimal technical seam

My earlier proposal promoted a large public `VisualizationIR` too early. The other pass and the Phase 0 record show that this would be speculative: agents do not need HTML geometry, and a single module renderer does not justify a public schema.

Extract a versioned semantic model only when a second validated projection or sink needs it. Keep it small:

```text
ExplanationEnvelope
  schemaVersion
  question + projection + scope
  repository revision / dirty / drift / warnings
  nodes: stable key, label, kind, source sites, authority
  edges: endpoints, relation, tier counts, authority
  omissions: depth, budget, unsupported/degraded evidence
  annotations: separate from topology
```

Layout coordinates are renderer output, never semantic identity. The envelope should expose projections, not raw database rows. Existing `buildModuleGraph`, traversal, and impact helpers remain the authoritative producers.

A focused static-flow projection should default to `COMPILER` and `LEXICAL` edges. Heuristic hops require an explicit option and unmistakable styling. Fan-out through implementations must say that it is an inference from static structure.

## Gated plan

### Phase 0 — reconcile the current map with its own gate

1. Complete the reviewer and tester roles in `probes/visual-map/PROTOCOL.md`; the builder must not answer.
2. Score the complete and simple maps independently against the frozen thresholds.
3. Record the result and close the stale handoff.
4. If a view fails, keep the research but stop investing in that view. Existing shipped code can be retained only with an explicit product decision; it must not be treated as proof of value.
5. If a view passes, document exactly which questions it improves. That bounded claim controls future work.

Exit: a recorded PASS/MARGINAL/FAIL, not “the graph looks useful.”

### Phase 1 — fix discoverability without expanding scope

For only the surfaces retained after Phase 0:

1. Add `doc` and, if retained, `map` to the README CLI inventory.
2. Make `sonde init` point to the appropriate next command without silently writing artifacts.
3. Explain the difference between committed `ARCHITECTURE.md`, optional human HTML, and targeted MCP queries.
4. Run the required clean-install release test on throwaway TypeScript and resolved-Python projects, reading both correct and degraded output.

Exit: a cold user can discover the current capability without reading the changelog.

### Phase 2 — prove the missing focused-explanation hypothesis

Do not begin with a permanent skill or public IR. Build a timeboxed probe over existing query and impact APIs for two views:

1. **Change explanation**: changed symbols → direct/transitive dependants → structurally related tests, with every caveat preserved.
2. **Static flow**: one resolved entry symbol → bounded call/reference paths → numbered Markdown hops with exact sources and tiers.

Pre-commit questions on unfamiliar repositories, for example:

- Where does this request enter?
- Which two files should I read next?
- How does symbol A reach subsystem B?
- What may be affected by this diff?
- Which step is uncertain, and why?

Compare file-tree/grep, current Sonde tools, and the focused explanation. Measure correctness, time, exploratory reads/tool calls, context tokens, and confidence. Include identifier-poor requests because Sonde's benchmark identifies them as a weakness.

Exit: proceed only if the focused view improves at least two comprehension tasks without degrading the direct-lookup control.

### Phase 3 — productize the winning projection

For each projection that passes:

1. Introduce the minimal `ExplanationEnvelope` shared by Markdown and HTML/JSON.
2. Add a CLI surface such as `sonde explain --symbol <key>` or `--from-git-diff`; settle naming during design, not in this brainstorm.
3. Generate a concise Markdown sibling and optional self-contained HTML from the same semantic model.
4. Add guarded, atomic writes and last-good preservation.
5. Add deep links, “start reading here,” source locations, direction labels, and omission/freshness panels.
6. Test referential integrity, tier preservation, path containment, determinism, degraded states, and heuristic-heavy fixtures.

Exit: the artifact answers one scoped question and round-trips every discovered relationship to graph evidence.

### Phase 4 — test a thin agent skill

Only after the CLI workflow proves useful:

1. Prototype a `sonde-orient` or `sonde-explain` skill that routes intent to existing commands.
2. It should use `find_symbols` for seeding, `query_graph` for direct questions, impact for edit safety, and explanation artifacts only for orientation/communication.
3. It returns compact Markdown or JSON to the agent and the HTML path to the human.
4. If focus is ambiguous, it asks for a symbol; it never fills the gap with invented topology.
5. Evaluate whether the skill reduces grep/tool-selection failures in fresh sessions.

Exit: install/distribute the skill only if agents actually choose the right Sonde path more often and use fewer exploratory reads.

### Phase 5 — add an MCP orientation pattern only if needed

Do not add an HTML-writing MCP tool. If measured MCP-only sessions cannot obtain a compact overview, add one bounded read-only pattern—preferably within `query_graph`—that returns semantic nodes, tiered edges, provenance, truncation, and omissions.

The existing three-tool surface is a strength. A fourth tool requires evidence that a pattern cannot express the need clearly.

### Phase 6 — optional narrative annotations

Start with deterministic sentences such as entry candidates, high fan-in modules, and next source files. Model-authored prose is opt-in, source-cited, visibly separate, and never required for default operation. Sonde remains local and useful without an API key.

Do not add generic workflow, lifecycle, data-flow, hosted sharing, WYSIWYG editing, animation, or export modes unless later demand is measured independently.

## Evaluation gates

### Truth

- Zero fabricated indexed nodes or edges.
- Tier, relation kind, stable key, and available source site survive every projection.
- Heuristic-only relationships are never default-prominent or described as proven.
- Dirty, stale, partial, parse-failed, and missing-toolchain states remain visible.
- `TESTS` never implies coverage.
- Static flow never claims runtime order or execution.

### Comprehension

An unfamiliar developer or vibe coder can:

1. state what the selected area does, with the explanation clearly separated from graph facts;
2. find the real entry or seed;
3. follow one bounded structural path;
4. identify the next two source files;
5. explain what may be affected by a change;
6. point out uncertainty and omissions.

### Agent utility

A fresh agent:

- invokes Sonde for relevant structural questions instead of defaulting to broad grep;
- consumes a bounded semantic response rather than HTML;
- reaches a correct answer with fewer tool calls/context tokens;
- still uses impact, rather than an orientation map, for edit safety.

### Artifact quality

- Deterministic semantic output for identical input.
- Self-contained HTML with no runtime network dependency.
- Safe refusal to overwrite human-owned files.
- Atomic replacement and last-good preservation.
- Paths and links cannot escape the repository.
- Keyboard and non-colour evidence cues for any retained viewer.

## Explicit non-goals

- Becoming a general-purpose AI diagramming product.
- Forking or embedding Archify.
- Letting an LLM author repository topology.
- Treating a static call chain as a runtime trace.
- Adding a public IR before multiple proven consumers exist.
- Adding MCP tools merely to expose HTML.
- Replacing `find_symbols`, `query_graph`, or `get_impact_radius` with a visualization.
- Committing high-churn per-symbol or per-PR artifacts by default.
- Requiring a hosted service or model API.

## Decisions needed after the gates

The following should remain open until measured usage answers them:

1. Whether the complete map survives if only the simple map passes, and vice versa.
2. Whether generated HTML belongs beside `ARCHITECTURE.md`, under a gitignored `.sonde/views/`, or at a user-selected path.
3. Whether unresolved Python projects should refuse focused flow or emit a loud degraded artifact.
4. Whether an agent skill belongs in the npm package, a separate skills repository, or both.
5. Whether a focused explanation is ephemeral by default or can be committed intentionally.

## Bottom line

The combined research supports a narrower and stronger direction than my first pass.

Sonde already has verified structure, Markdown, and an interactive module map. It does not yet have evidence that more visualization is the highest-value investment, and it does have evidence that agents ignore capabilities that are merely available. The opportunity is an on-demand explanation loop at feature and change granularity.

The sequence should therefore be:

1. Finish the map's existing usefulness gate.
2. Make only the validated current surfaces discoverable.
3. Probe focused impact and static-flow explanations against real comprehension tasks.
4. Productize the projections that win, using one small evidence envelope for Markdown/JSON/HTML.
5. Add a routing skill only after the workflow is useful.
6. Add MCP or generated prose only when a measured gap requires it.

That gives developers and vibe coders a truthful route into unfamiliar code and gives agents compact structural context, without weakening the evidence model that makes Sonde worth using.

## Grok

# Question-sized explanations, behind the gate this repo already froze

**Date:** 2026-10-09
**Role:** Combined review pass 1

Sonde should answer one concrete question about a repository with the smallest evidence-backed artifact that question needs. Archify is the interaction to learn: a plain request, one projection, a validated self-contained result, then another request. Sonde's authority stays the index. An agent may choose a scope and attach a cited note. It may not invent a node, an edge, or a layout coordinate for repository code.

A skill and an MCP orientation IR come after a scoped explanation has been measured. `src/map` is not a license to grow focus modes, diff maps, and call-chains before anyone scores the protocol that decides whether that viewer beats Markdown.

### What this pass keeps, and where it splits

Codex is right about order of proof. `sonde doc` and `sonde map` are capabilities. Usefulness of the map is an open measurement. `probes/visual-map/PROTOCOL.md` froze the questions, the separate-role rule, and the thresholds on 2026-10-06, before results. `BUILD-NOTES.md` says the implementer has rendered and the reviewer answers next. The session-start sync still shows `visual-map-phase0` as `claude -> implementer`, ready. No PASS, MARGINAL, or FAIL is recorded. Protocol §6 says a PASS authorises only the native module map. It does not authorise a skill, an MCP orientation surface, or more diagram modes.

Antigravity is right about grain. Directory modules answer coupling. They do not answer "how does this feature work?", "where does this request enter?", or "what does this change touch?" Those are the questions in the user's request. A whole-repo poster, however clickable, is the wrong default response to a question about one function.

Where this splits from Antigravity: the HTML map's presence in `src/map`, and its description in `AGENTS.md`, is an engineering commitment, not a usefulness verdict. `AGENTS.md` already requires `sonde doc` and `sonde map` to share `buildModuleGraph` / `findNestedProjectRoots`, and it forbids a toggle that would reveal guesses on the simple map. That binds whatever map code exists. It does not record that a reviewer answered Q1–Q6 and C1. Extending the viewer, and writing an orientation preface into `ARCHITECTURE.md`, would also change the Markdown the protocol compares against. Q5 and Q6 exist to test whether the simple map beats today's document at "how the repository works" and "what is foundational." A preface that states entry points and foundational modules answers those questions on the Markdown side and voids the comparison. Closing the handoff with a status note, without cold answers and a tester applying §5, repeats the stuck-handoff failure the protocol was written to avoid. The handoff needs a real transfer to the reviewer. It does not need a verdict written from this brainstorm.

Where this splits from Codex: the user's third audience still needs a visual they can open, once a projection has earned it. The module-map gate decides the module map only. A focused explanation that wins its own probe should be allowed a self-contained HTML sink for a human and a compact Markdown or JSON sink for an agent, from the same facts. HTML stays out of the model context. Feature-explanation work can proceed on `query_graph` and `get_impact_radius` while the reviewer scores the map. It should ship as its own verb. Hanging call-flow off `sonde map` folds a new claim into a viewer whose current claim is still unscored.

One further split from both phase lists: measuring the artifact and measuring the router are different experiments. The four grep trials show tools sitting unused. Handing a participant the focused packet answers whether the grain is right. A skill answers whether a fresh agent will choose Sonde. Running them as one gate hides which one failed.

### What Sonde already is

Sonde 0.4.4 indexes TypeScript, resolved Python, and Swift into SQLite. Edges carry `COMPILER`, `LEXICAL`, or `HEURISTIC`, or they stay `EXTERNAL` / `UNRESOLVED`. Drift stamps, degrade-with-a-warning, and the impact packer are the asset Archify does not have. Archify's architecture diagrams are an agent-written IR with optional source links. Its own design text refuses to call authored reachability "blast radius" without a code-analysis product. Sonde is that product.

| Surface | Answers | Leaves open |
|---|---|---|
| `sonde doc` | Deterministic, guarded `ARCHITECTURE.md`: modules, tier counts, provenance, `--check` | Feature flow, a pull request, purpose in plain language |
| `sonde map` (unreleased) | Self-contained simple and complete module HTML: search, transitive reach, thickness from resolved edges | The same feature and pull-request questions; any agent task |
| MCP: `find_symbols`, `query_graph`, `get_impact_radius` | Seeded structural questions inside a token budget | Cold start from a vague phrase; a file a human clicks |
| Impact from a git diff | What may be affected, with snippets | A newcomer narrative |

Two measurements still bound the roadmap. One external `ARCHITECTURE.md` was unchanged across 278 commits while `--check` stayed green. In four trials an agent that had all three MCP tools grepped, correctly, once across 309 hits. A module picture is a weak daily driver, and an available tool is not a tool a model will reach for.

`sonde doc`'s spec deferred an agent-facing overview because a structural question already fit one tool call. That deferral holds for another whole-repo dump. It does not hold for a short packet aimed at one symbol or one diff. The published benchmark's weak spot is identifier-poor requests. A probe that only uses known symbol keys will rediscover that Sonde works when the user already knows the name.

### What to take from Archify

Take the loop: plain request, one typed projection, fail-closed validation, atomic replace of the last good file, progressive disclosure, a receipt. Take the idea of a skill the agent loads without memorising flags, later, and only over commands that have won a gate.

Leave the authority model. For architecture diagrams, Archify's agent supplies topology and coordinates. Sonde already lays modules out deterministically, which is what makes `--check` possible. Leave the five diagram types. Workflow, timed sequence, dataflow, lifecycle, and non-code worlds have no edges this index can verify. Shipping them would put a fabrication surface on the artifact people trust. Leave the code in Archify's repository; do not vendor it.

Static `CALLS` hops are declaration targets. Fan-out through `IMPLEMENTS` is an inference and stays labelled as one. A numbered hop list is a reading of the index. It is not a runtime trace, a coverage proof, or an Archify sequence. `TESTS` is structural relatedness. Heuristic member access stays heuristic. Thickness and default visibility follow resolved edges (`COMPILER + LEXICAL`), which the map protocol already pins to `resolvedOf`.

When an annotation layer exists, use four authority classes: `sonde-indexed` for topology, `repository-cited` for text tied to a real file range, `user-authored` for intent the user supplied, `agent-inferred` for a reading that defaults off and can be removed without changing the graph. Only `sonde-indexed` relationships render as discovered edges.

Entry candidates need a split that a single "where execution starts" panel would blur. A `package.json` `bin`, a CLI dispatcher, or an MCP tool registration is repository-cited. "Exported and never called inside this repo" means the public surface of a library, and only sometimes the process entry of an application. Printing the absence of callers as "execution starts here" would state a runtime fact the index does not have.

### The shape, once a projection earns it

The unit of value is an explanation of one question:

- What are the large pieces, and which files look like entry points?
- How does `get_impact_radius` reach the store?
- What may this diff affect, and which tests are structurally related?
- Which two files should I read next, and which hop is uncertain?

The router picks one projection. A question about one function returns that function's bounded neighbourhood.

| Intent | Evidence already in the tree | Human sink | Agent sink |
|---|---|---|---|
| Repository orientation | Module graph via `sonde doc`; HTML only if its gate retains it | Markdown, plus HTML if retained | Short summary of the same facts |
| Change impact | `get_impact_radius` from the git diff | Focused Markdown; HTML only if that probe says the picture helps | The existing budgeted pack |
| Feature / static flow | Bounded `CALLS` and `REFERENCES`, `IMPLEMENTS` labelled | Numbered hops with paths and tiers; HTML only after that probe wins | Compact evidence packet |
| Known structural lookup | Current MCP tools | Usually none | The current tool response |
| Non-code or future-system diagram | None in this index | Name Archify | Stop, inside Sonde |

Shared fields whenever two sinks exist for the same request: question, projection, scope, revision, dirty and drift flags, tier counts, omissions, and the statement that static reachability is not runtime proof. Layout coordinates stay inside the renderer.

A public envelope, and a fourth MCP tool, wait until a second sink of a *winning* projection would otherwise drift from the Markdown. Until then, `buildModuleGraph`, traversal, and impact remain the producers, and the probe can emit plain Markdown. On-demand files default to stdout or a gitignored path. The committed contract stays whole-repo `ARCHITECTURE.md`. Per-symbol and per-diff files churn; the 278-commit observation is about a stable module graph, and a per-diff explanation would be the opposite kind of artifact.

### Plan

**Phase 0 — score the map that is already waiting.** The reviewer answers Q1–Q4 and C1 from the complete map and the current Markdown, and Q5–Q6 from the simple map, in the counterbalanced order, recording confidence before checking. The tester adjudicates with `sonde query` and applies §5 verbatim. The builder does not answer. This brainstorm does not answer. The artifacts under comparison stay as they are until those scores exist. Retarget `visual-map-phase0` to the reviewer with a real handoff. Leave it open until the tester records the verdict.

While that wait is in progress, the README CLI list and the `sonde init` hint may name `sonde doc`. That command is already shipped, already specified, and is not the thing the protocol is scoring. Naming `sonde map` waits for the verdict, and the sentence that names it should say which of Q1–Q6 it actually improved.

Exit: a recorded PASS, MARGINAL, or FAIL per map, or VOID if the builder also answered. MARGINAL stops for a human, as §5 already requires. A FAIL keeps the spike as research and stops further investment in that view. Because `AGENTS.md` already describes the map as a standing pair with `sonde doc`, a FAIL is also an explicit human decision to keep or retract that stable-rule text. Presence of the code is not a PASS.

**Phase 1 — advertise only the surfaces the gate retained, and confirm them on a clean install.** State the difference between the committed Markdown, optional human HTML, and a targeted MCP query. Run the release check on a throwaway TypeScript project and a resolved-Python project, and read a degraded run as well as a clean one.

Exit: a cold reader can find the retained commands without the changelog.

**Phase 2 — probe feature and change explanations on the APIs that exist.** Timebox a throwaway packet. Two views: changed symbols to dependants and structurally related tests, and one resolved symbol to a bounded static call/reference path. Pre-commit the questions on an unfamiliar repository. Include at least one identifier-poor prompt and one control that current `find_symbols` or `query_graph` is expected to win. Compare the file tree plus grep, today's three tools, and the focused packet, with the packet placed in the participant's hands. Record correctness, time, exploratory reads, context size, and confidence. A throwaway HTML rendering of that same packet may be a third reading condition for a human. It is a disposable sheet, not a new `sonde map` mode, and it is not a reason to edit `ARCHITECTURE.md` first.

Exit: continue a view only if it improves at least two comprehension tasks and leaves the direct-lookup control intact. A map PASS does not satisfy this exit. A map FAIL does not block it.

**Phase 3 — productize each view that passes.** Give it a CLI verb of its own. `sonde explain` is a reasonable name to settle in design. The module map's job remains coupling. Markdown first. Add HTML from the same facts only for a view whose probe showed a human benefit. Introduce a small internal envelope at the moment a second sink would drift. Guarded atomic writes, last-good retention, source locations, direction, omissions, freshness. Tests cover referential integrity, tier preservation, path containment, determinism, dirty and degraded states, and the heuristic-only swift/typescript adapter pair, which must stay visibly unresolved.

Exit: the artifact answers one scoped question, and every drawn relationship round-trips to an indexed edge.

**Phase 4 — a thin skill, measured in a fresh session.** A `sonde-explain` skill routes intent onto commands that exist: `find_symbols` to seed a name, `query_graph` for a direct structural question, impact for edit safety, `sonde doc` for whole-repo orientation, and the Phase 3 verb only if it shipped. Ambiguous focus asks for a symbol or a file. A non-code request names Archify and stops. The skill returns compact Markdown or JSON to the agent and a file path to the human.

Exit: publish it only if fresh agents pick the Sonde path more often on structural questions and take fewer exploratory reads. Grep remains appropriate for text. A bar of "zero grep" or "half as many tool calls" invents a precision this trial size cannot support. The visual-map protocol already rejected a fabricated numeric threshold for the same reason.

**Phase 5 — an MCP pattern only if a shell-less session still cannot see the packet.** Prefer a pattern on `query_graph` returning semantic nodes, tiered edges, provenance, truncation, and omissions. The response carries no HTML and no SVG, and the tool does not write files. The three-tool surface is a feature. A fourth tool needs evidence that a pattern cannot say the thing.

**Phase 6 — words after structure.** Deterministic sentences from fields already on the packet: candidate entries, highest fan-in, next files, omitted depth. Optional model prose is opt-in, cited, marked `agent-inferred`, and removable without a byte change to the topology. Default Sonde stays local and keyless. When a reading contradicts the table, drop the reading.

A binder that accepts agent-drawn story diagrams stays out. A focused subgraph is that diagram. A binder is a second authority model, and it waits until a question shows up that a scoped query cannot express.

### Evaluation

Truth: no fabricated indexed node or edge; tier, relation kind, stable key, and source site survive every projection; heuristic relationships stay visibly heuristic; dirty, stale, partial, parse-failed, and missing-toolchain states stay visible; a static flow states that it is static.

Comprehension, for someone who does not already know the code: they can say what the selected area does, keep that sentence distinct from graph facts, name the entry or the seed, follow one bounded path, name the next two files, say what a change may affect, and point at an omission.

Agents: on a structural question, a fresh session uses Sonde for the structural part; it consumes a bounded semantic payload; edit safety still goes through impact.

Artifacts: deterministic for identical input; HTML has no network dependency; an unmarked human file is left untouched; replacement is atomic; links stay inside the repository; evidence is recoverable without relying on colour alone.

### Out of scope

A general diagramming product. A fork or vendor of Archify. LLM-authored repository topology. Describing a static chain as a trace. A public schema before two sinks of a proven projection need it. An MCP payload of HTML. Replacing the three current tools with a picture. Committing per-symbol or per-diff artifacts by default. A required model API. Scoring Q1–Q6 inside this brainstorm. An orientation preface on `ARCHITECTURE.md` or the simple map before Q5 and Q6 are answered.

### Still open, on purpose

1. Whether the complete map, the simple map, both, or neither stay after §5.
2. If a map stays, whether whole-repo HTML lives beside `ARCHITECTURE.md`, under a gitignored directory, or at a path the user passes. On-demand explanations stay ephemeral unless someone deliberately commits one.
3. If a map FAIL lands after `AGENTS.md` already documents `sonde map`, whether that stable rule stays or is revised. That choice belongs to the human reading the verdict.
4. Whether an unresolved Python project refuses a focused flow or emits the same loud degraded header `sonde doc` already uses.
5. Whether a skill that survives Phase 4 ships inside the npm package, a skills repository, or both.
6. The final command name.

### Sequence

1. Hand `visual-map-phase0` to the reviewer and let the tester apply the frozen protocol to today's artifacts.
2. Name `sonde doc` in the README and init hint while that runs. Name `sonde map` only in the words the verdict supports.
3. Probe a change explanation and a static-flow explanation against pre-committed questions, including an identifier-poor one, with the packet in the participant's hands.
4. Productize the views that win. Markdown and JSON for agents. HTML for humans when the human trial earned it.
5. Add a routing skill after those commands are worth routing to.
6. Add an MCP pattern or generated prose only when a measured gap remains.

That is the modification that serves a vibe coder, a reviewing developer, and an agent, with the evidence rules intact and the open gate left open.

## Antigravity

# Grounded Synthesis: On-Demand Architecture & Code Flow for Sonde

**Date:** 2026-10-09
**Role:** Reviewer / Synthesizer (Combined Review Pass 1)
**Scope:** Reviewing Codex's revised stance and Grok's independent findings against Sonde's existing code, active handoffs, architectural invariants, and the user's core need: enabling developers, vibe coders, and AI agents to understand how a codebase works on demand via Markdown and interactive visual artifacts like Archify.

---

### 1. Executive Summary & Core Diagnosis

Both Codex and Grok uncover a crucial truth that was missing from the user's premise:
**Sonde already contains the foundation of what Archify does.**
- `sonde doc` generates a deterministic, verified `ARCHITECTURE.md` with module dependencies, evidence tiers, and `--check` CI gates.
- `sonde map` (implemented in `src/map/` in commit `3f9cd28`) generates a self-contained, interactive `ARCHITECTURE.html` with transitive reach, search, upstream/downstream toggles, and simple vs complete projections.
- SQLite symbol graph with strict evidence tiers (`COMPILER > LEXICAL > HEURISTIC`), provenance stamps, and three MCP tools (`find_symbols`, `query_graph`, `get_impact_radius`).

Yet, despite having these capabilities, **users, vibe coders, and AI agents cannot easily understand how their code works today.** Why?

1. **Discoverability Failure**: Neither `sonde doc` nor `sonde map` is featured in the README CLI cheat-sheet or surfaced effectively by `sonde init`.
2. **Grain Mismatch (Macro vs Micro)**: The existing `doc` and `map` operate strictly at the *directory module* level. They answer "how are directories coupled?", but completely fail to answer what vibe coders and newcomers ask: *"Where does execution start?"*, *"How does login work?"*, *"What happens when I call this function?"*, *"What does this PR touch?"*
3. **The Intent & Orientation Gap (Why Agents Grep)**: Across recorded trials, AI agents with MCP tools ignored them and resorted to `grep`. Why? Because Sonde requires you to already know exact symbol keys or module paths. Agents lacking a high-level mental map don't know *what* to query.
4. **Interaction Loop**: Archify wins on UX because it is an **on-demand conversational skill** (`npx skills add ...`). You ask a natural-language question, and it compiles a visual and text artifact. Sonde currently requires knowing specialized CLI flags or AST-level MCP queries.

#### The Fundamental Tension & Synthesis between Codex and Grok:
- **Codex** advocates extreme caution: do not build a public IR or new diagramming tools until Phase 0 is formally adjudicated and until we prove that focused explanations reduce exploratory reads. Codex wants the unit of value to be a small, text-first "Explanation".
- **Grok** advocates moving quickly to package what exists: document `doc`/`map`, ship a `sonde-orient` agent skill, add scoped CLI flags (`--focus`, `--from-git-diff`, call-chains), and provide an MCP orientation IR.
- **Antigravity's Stance (The Balanced Path)**:
  Codex is right that we must never become an ungrounded diagram authoring tool like Archify (never fabricate an edge; static paths are not runtime traces). But Codex's hesitation to utilize visual artifacts ignores that `sonde map` is *already implemented and tested* in the tree (`src/map/`). Visual comprehension is precisely what visual/vibe coders need.
  The right solution is **Dual-Grain On-Demand Projections**:
  1. **Macro (Architecture)**: Whole-repo module map & doc (already built; needs discoverability and entry-point annotations).
  2. **Micro (Execution & Flow)**: On-demand scoped feature and change explanations (call chains from entry points, diff impact) delivered in three synchronized formats:
     - **Human**: Interactive self-contained HTML (using `src/map/`'s established zero-dependency SVG renderer).
     - **Reviewer / CI**: Deterministic Markdown (`.md`).
     - **AI Agent**: Token-budgeted structured JSON IR (never raw HTML/SVG).

---

### 2. Deconstructing Archify: What to Adopt vs What to Reject

Archify is fundamentally an **agent-authored diagram compiler**. Sonde is a **compiler-backed code-truth graph**. Merging them carelessly would destroy Sonde's core value proposition.

| Dimension | Archify Model | Sonde Current Model | The Synthesis (Sonde On-Demand) |
|---|---|---|---|
| **Topology Source** | LLM invents nodes, coordinates, and edges from prompt/code reading. | Extracted from tree-sitter, `tsc`, and pyright into SQLite. | **Strictly Sonde-indexed graph.** LLM never invents topology. |
| **Evidence / Truth** | Self-asserted; optional source hyperlinks. | Strict tiers (`COMPILER`, `LEXICAL`, `HEURISTIC`, `UNRESOLVED`). | **Preserve evidence tiers everywhere.** Heuristic edges dashed; warnings visible. |
| **Interaction UX** | Conversational skill via agent (`SKILL.md`); on-demand; progressive disclosure. | Manual CLI commands; raw MCP queries requiring exact symbol knowledge. | **Adopt Archify's Skill loop:** Agent skill routes prompt → Sonde projection → dual output. |
| **Output Delivery** | Standalone HTML with embedded JSON; atomic delivery; receipts. | Committed `ARCHITECTURE.md` + standalone `ARCHITECTURE.html`. | **Adopt atomic delivery & receipt pattern.** Emit paired `.md` + `.html` + agent JSON. |
| **Scope / Domains** | 5 diagram types (architecture, workflow, sequence, dataflow, lifecycle) for code & non-code. | Repo module graph only. | **Reject non-code diagrams.** Limit to 2 code projections: Module Coupling & Static Flow. |

#### Invariants that must never be broken:
1. **Never fabricate an edge (Invariant 1).** If a relationship cannot be resolved or evidenced lexically/heuristically in SQLite, it does not exist in the diagram.
2. **Static call graphs are not runtime execution traces.** Static `CALLS` edges do not prove runtime sequence, timing, or branch condition. Any flow projection must be explicitly labeled: `Static Call Graph (Declaration Targets)`.
3. **No HTML/SVG in model context.** Context windows are for semantic JSON or compact Markdown tables, not rendering markup.
4. **Member access remains HEURISTIC (Invariant 2).** Type inference without compiler confirmation is heuristic. Thickness and primary visual weight follow `resolvedOf`, never raw volume.

---

### 3. Solving the Agent Adoption Failure ("Why Agents Grep")

The Phase 0 probe documented a critical failure: agents given Sonde's three MCP tools answered 4 of 4 structural questions by using `grep` instead.

Why did this happen?
1. **The Cold-Start Seed Problem**: `query_graph` and `get_impact_radius` require a seed symbol or exact path. An agent given a natural-language prompt ("fix session expiry") has no idea what symbol exists. Grep is fuzzy and keyword-tolerant; Sonde was symbol-exact.
2. **Missing Architectural Waypoints**: An agent needs to know: *What are the entry points? Where does IO happen? Where is state stored?* Without an orientation summary, the agent cannot formulate an initial query.

#### The Fix:
- **Automatic Entry-Point Heuristics**: Detect system entry points from manifest files (`package.json` bins/exports), framework router definitions, CLI command handlers, and exported functions with 0 inbound callers.
- **Token-Budgeted Orientation Summary**: A read-only envelope returning top entry points, top fan-in modules, and key interfaces.
- **Natural-Language Symbol Resolution**: When an agent asks for a concept, route through FTS (`find_symbols`) and bounded inbound/outbound walks rather than forcing the agent to guess qualified symbol strings.

---

### 4. The Product Shape: On-Demand Scoped Projections

We define two distinct levels of understanding, sharing a single compilation pipeline:

```
                  User Intent / Prompt
                            │
                            ▼
               Agent Skill (`sonde-explain`)
                            │
               ┌────────────┴────────────┐
               ▼                         ▼
      Macro: Architecture       Micro: Feature / Diff Flow
    (Whole repo / Module)      (Symbol / Entry / PR blast radius)
               │                         │
               └────────────┬────────────┘
                            │
                   SQLite Graph Query
              (Filter, Traverse, Evidence)
                            │
                            ▼
                 `ExplanationEnvelope`
        (Revision, Nodes, Tiered Edges, Omissions)
                            │
         ┌──────────────────┼──────────────────┐
         ▼                  ▼                  ▼
   Self-Contained        Diffable        Token-Bounded
     HTML Map            Markdown           JSON IR
   (for Humans)        (for Review/CI)   (for AI Agents)
```

#### Level 1: Macro Architecture (Module Level)
- **Goal**: "What does this repo look like?"
- **Outputs**:
  - `ARCHITECTURE.md` (committed, checked in CI via `sonde doc --check`).
  - `ARCHITECTURE.html` (interactive simple/complete map with reachability and search).
- **Enrichment**: Add an **Orientation Preface** derived deterministically from the graph:
  - Entry points (where execution starts).
  - Foundational modules (modules with 0 outgoing dependencies).
  - Hubs / State holders (highest inbound fan-in).

#### Level 2: Micro Flow & Impact (Feature / Symbol / Diff Level)
- **Goal**: "How does `login` work?", "What breaks if I change `repos.ts`?", "Trace `createServer`".
- **Outputs**:
  - Generated on-demand into `.sonde/views/<name>.html` and `.sonde/views/<name>.md` (or stdout / user-specified `--out`).
  - **Static Flow Projection**: Walks `CALLS` up to depth $N$. Nodes represent functions/methods; edges represent call sites with evidence tier. Fan-out through interfaces/implementations is labeled `[Inferred Implementations]`.
  - **Impact Projection**: Walks reverse callers from git diff or selected symbol (reusing `src/query/impact.ts` logic) and renders blast radius visually and tabularly.

#### The Tripartite Output Contract:
1. **Interactive HTML (Human / Vibe Coder)**:
   - Self-contained, zero-CDN, offline-ready SVG/CSS.
   - Interactive zoom/pan, search, transitive reach highlight (upstream vs downstream).
   - "Click to inspect": clicking a node shows file path, line numbers, docstrings/signature, and evidence breakdown.
2. **Markdown (Developer / Reviewer / CI)**:
   - Deterministic, diff-friendly, commit-safe.
   - Structured tables and clean ASCII/Mermaid with exact file paths and line ranges.
   - Provenance stamp and omission notice.
3. **Structured JSON (AI Agent)**:
   - Bounded by token budget (e.g., 2k–4k tokens).
   - Contains symbol keys, source locations, call depth, and tiered edges.
   - Never outputs SVG or DOM.

---

### 5. Architectural Seams & Code Placement

To maintain codebase integrity, we reuse existing modules without duplicating logic:

1. **`src/doc/modules.ts` & `src/map/model.ts`**:
   - Keep `buildModuleGraph` and `findNestedProjectRoots` as the single sources of truth for module clustering.
   - Extract a shared `ExplanationEnvelope` representing projected subgraphs (nodes, edges, tiers, provenance, omissions).
2. **`src/query/traverse.ts` & `src/query/impact.ts`**:
   - Provide the traversal engine for symbol-level static flows and git-diff blast radius.
3. **`src/map/render.ts`**:
   - Reuse the battle-tested, zero-dependency SVG renderer (which already handles layout, bowed arcs for mutual edges, zoom/pan, dark/light themes, and reachability).
   - Support a layout mode for directed acyclic flows (left-to-right / top-to-bottom) for static call chains.
4. **`src/cli/main.ts`**:
   - Expose discoverable CLI flags:
     - `sonde doc` (already exists).
     - `sonde map [--focus <module>] [--symbol <key>] [--from-git-diff]` (extend existing).
     - `sonde explain <symbol-or-pattern> [--depth <N>] [--out <path>]` (new unified verb).
5. **`skills/sonde-explain/SKILL.md`**:
   - The agent skill that provides the natural language interface.
   - Routes user prompts:
     - "Show me an overview" → `sonde doc` + `sonde map`.
     - "How does X work?" → `sonde explain X`.
     - "What does this PR touch?" → `sonde map --from-git-diff`.
   - Returns the file path for the human to view in a browser and reads the JSON envelope to answer directly in chat.

---

### 6. Phased Implementation Plan

We structure implementation into gated, falsifiable phases:

#### Phase 0: Discoverability & Baseline Hygiene (Immediate)
- Update README CLI cheat-sheet to document `sonde doc` and `sonde map`.
- Update `sonde init` to introduce both `doc` (for CI/review) and `map` (for interactive exploration).
- Close the `visual-map-phase0` handoff in Whyline with a clear record of current status.
- **Exit Gate**: A fresh user running `sonde init` and reading README can generate both `ARCHITECTURE.md` and `ARCHITECTURE.html` without inspecting source code.

#### Phase 1: Deterministic Orientation Preface & Entry-Point Detection
- Add entry-point heuristics in `src/doc/` and `src/map/`:
  - Scans `package.json` entry points (`bin`, `main`, `exports`).
  - Identifies uncalled exports and CLI/MCP dispatchers.
- Render an "Orientation Summary" panel at the top of `ARCHITECTURE.md` and in the simple `ARCHITECTURE.html` viewer.
- **Exit Gate**: The simple map and Markdown document prominently state "Where work enters" and "Foundational modules" without requiring model generation.

#### Phase 2: Scoped Subgraph Projections (`--focus` and `--from-git-diff`)
- Extend `src/map/model.ts` to compute focused subgraphs:
  - `--focus <module>`: extracts upstream/downstream closure up to depth $N$.
  - `--from-git-diff`: seeds from modified files/symbols (using `get_impact_radius` seeds) to project only affected modules/edges.
- Ensure `resolvedOf` strictly governs visibility and thickness (Invariant 3).
- **Exit Gate**: Generating a diff map for changes in `src/store/` produces an artifact showing only the 21 affected modules and their verified connections, matching `get_impact_radius` closure.

#### Phase 3: Static Call-Flow Projection (`sonde explain`)
- Build symbol-level path traversal:
  - Given entry symbol $S$, trace `callees_of` to depth $N$.
  - Handle interface fan-out via `IMPLEMENTS` with explicit inference tagging.
  - Output paired `.md` (step-by-step hops) and `.html` (focused directed flow).
- Hard rule: Explicitly label all outputs as `Static Call Graph (Declaration Targets)`.
- **Exit Gate**: Tracing `createServer` accurately links to MCP request handlers with verified tiers; heuristic hops are visually distinct; no runtime execution ordering is claimed.

#### Phase 4: The `sonde-explain` Agent Skill & Budgeted IR
- Author `skills/sonde-explain/SKILL.md`:
  - Instructs agents how to interpret user intent ("how does X work?", "overview", "what breaks").
  - Invokes CLI commands and consumes bounded JSON envelopes.
  - Returns human-friendly chat responses while pointing humans to the generated HTML.
- Expose a budgeted JSON output mode in CLI/MCP (`sonde explain --json`) with strict token budget truncation.
- **Exit Gate**: In benchmark testing, an agent using the skill answers structural questions correctly with $\ge 50\%$ fewer tool calls and zero fallback to brute-force grep.

#### Phase 5: Opt-in Plain-Language Annotations (Strictly Citations-Backed)
- Introduce optional narrative synthesis:
  - Deterministic template engine by default (zero API key, zero cost).
  - Optional LLM-generated summaries strictly isolated in an `<aside>` or `Narrative Interpretation` section.
  - Never allow LLM prose to alter graph topology or edge weights.
- **Exit Gate**: Output remains 100% deterministic and functional without an LLM or network connection.

---

### 7. Explicit Non-Goals & Falsification Criteria

#### What Sonde Will NOT Do:
1. **No generic diagram suite**: Sonde will not build sequence diagrams for vacation itineraries, CI runbooks, or arbitrary business workflows. That is Archify's domain.
2. **No LLM topology authoring**: LLMs will never create nodes or edges that do not exist in the index.
3. **No HTML/SVG in MCP responses**: MCP remains a token-efficient, structured data protocol.
4. **No dynamic runtime tracing claims**: Sonde analyzes static AST and compiler types; it will never claim to be an eBPF or OpenTelemetry trace.
5. **No fork or vendoring of Archify**: Archify is an authored diagramming tool; Sonde's viewer in `src/map/` already provides a faster, deterministic, code-grounded rendering engine.

#### Falsification Criteria (When to Stop or Pivot):
- If the focused call-chain projection fails to improve human code comprehension in benchmark tests compared to reading source files directly.
- If agents still bypass the skill and resort to raw grep for symbol discovery.
- If heuristic edges cannot be clearly distinguished from resolved edges in the flow viewer, leading users to believe speculative paths are verified.

---

### 8. Final Verdict

Sonde does not need to become Archify. Archify is an authored illustration tool. Sonde is an evidence-backed truth engine.
By combining Sonde's verified graph with Archify's on-demand conversational delivery loop, we give developers, vibe coders, and AI agents the exact capability they need:
**Ask one question about a codebase, and receive a mathematically verified, beautifully rendered, and structurally honest explanation of how that code actually works.**

