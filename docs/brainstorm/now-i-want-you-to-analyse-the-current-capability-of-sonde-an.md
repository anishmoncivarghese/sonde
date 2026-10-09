# Brainstorm: Now I want you to analyse the current capability of sonde and I want to add feature like https://github.com/tt-a1i/archify offers using which it becomes more useful something like I cna create a .md file plus ismilar to archfy on demand, reason so that sonde can be useful for the AI agents, developers and vibe coders who do not have understanding of the code so we have to make thme a way they can understand how there project or prgam works so that they can better undersatnd whats going inside . So lets do  brainstorm and create a plan for modifying sonde and making it much more useful

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

# Sonde × Archify-style orientation — independent research (Grok)

**Date:** 2026-10-09
**Scope:** Analyse Sonde as it exists in this tree, study [Archify](https://github.com/tt-a1i/archify) from its public source, and propose a plan that makes Sonde useful to AI agents, developers, and vibe coders who need to understand how a project actually works.
**Method:** Read Sonde's CLI, MCP, `src/doc`, `src/map`, PRD, design spec, changelog, and README. Read Archify's README, PRODUCT.md, DESIGN.md, ROADMAP.md, SKILL.md, schemas, and authoring cookbook. No other model's notes were used.

This is research and a plan. No product code was changed.

---

## 1. Intent, restated

The request is to make Sonde a way to *see inside a program*, not only a way to retrieve symbols for an agent that already knows what to ask.

Three audiences, one graph:

| Audience | What they need | What they will not do |
|---|---|---|
| **AI agent** | A compact, current, evidence-labelled picture of structure they can query without a grep loop | Read a 60 KB HTML file; invent topology |
| **Developer** | A committed, reviewable map of modules and blast radius they can trust in CI | Re-author a diagram after every merge |
| **Vibe coder** | A plain-language, on-demand "how this works" artifact they can open in a browser and click | Learn `query_graph` patterns, mermaid, or SQLite |

Archify is the reference for *feel*: one sentence in chat, a self-contained interactive HTML, keep iterating ("add auth", "highlight the cache-miss path"). The reason to add that *shape* to Sonde is that agents, humans, and vibe coders currently bounce off Sonde's graph unless they already think in symbols and edges.

Assumption, labelled as such: the user wants Sonde to remain a **code-truth** product. They named Archify as the UX to learn from, not as a product to clone into travel itineraries and city-walk maps.

---

## 2. What Sonde can do today

Sonde 0.4.4 (`@cheppulabs/sonde`) is a local, deterministic context engine. It indexes TypeScript, Python, and Swift into a SQLite symbol graph and answers structural questions inside a token budget.

### 2.1 The graph (the asset everything else should reuse)

- **Index:** tree-sitter extraction, import binding, optional compiler pass (`tsc` for TypeScript, bundled pyright for Python). Swift is heuristic-only.
- **Symbols** with stable keys, signatures, byte ranges, export/test flags.
- **Edges:** `CALLS`, `REFERENCES`, `IMPORTS`, `IMPLEMENTS`, `INHERITS`, `CONTAINS`, `TESTS`.
- **Tiers on every edge:** `COMPILER`, `LEXICAL`, `HEURISTIC`, plus `EXTERNAL` / `UNRESOLVED` instead of a guessed target.
- **Freshness:** content hashes, drift count, envelopes that refuse to present stale source as current.
- **Packer:** `get_impact_radius` walks callers / references / implementations / inheritance and truncates to an explicit token budget.

This is the part Archify does not have. Archify's "source-backed" architecture diagrams are still an LLM-authored JSON IR with optional revision-pinned source links. Sonde's edges come from parsers and, when asked, compilers.

### 2.2 Agent surface (MCP)

Exactly three tools, in `src/mcp/server.ts`:

| Tool | Job |
|---|---|
| `find_symbols` | Seed retrieval: qualified name, then short name, then FTS. Signatures only. |
| `query_graph` | One-hop structural patterns: callers, callees, imports, inheritance, tests, containment. Bucketed by tier. |
| `get_impact_radius` | Reverse traversal from symbols or the git diff, packed to a token budget. |

There is **no** MCP tool that writes or returns `ARCHITECTURE.md`, `ARCHITECTURE.html`, or a module-graph IR. An agent that only has MCP cannot generate the human artifacts.

A measured trial recorded in `probes/visual-map/BUILD-NOTES.md` found the reverse problem too: in four real questions, an agent *with* these tools still grepped. The tools exist; they are easy for a model to ignore.

### 2.3 Human artifacts that already exist

This is the finding that should land first: **the Markdown file and the interactive HTML the request describes are already in the tree.** They are under-advertised, not unbuilt.

**`sonde doc`** (`src/doc/`, design `docs/superpowers/specs/2026-08-30-sonde-doc-design.md`)

- Writes `ARCHITECTURE.md` from the same module graph.
- Marker line so it will not clobber a hand-written file.
- Header stamps commit SHA, dirty worktree, drift, parse failures, missing `tsconfig.json`.
- Mermaid of the *heaviest* dependencies (limit 25), table of the 30 strongest pairs, explicit omission counts.
- Heuristic-majority arrows are dashed. Name-coincidence pairs are counted and not drawn.
- `--module` prints symbol-level detail and is never committed.
- `--check` compares the structural body so committing the file does not make CI fail against its own stamp.
- Byte-identical across runs on an unchanged index.

**`sonde map`** (`src/map/`, listed under CHANGELOG Unreleased)

- Writes a **self-contained** `ARCHITECTURE.html` (no CDN, no layout engine fetch).
- Two *separate projections*, not one view with a filter:
  - **simple** (default): roll nested modules up one level, drop non-`src/` scaffolding, draw only resolved-majority edges, **no toggle** to reveal the rest. Title: "How this repo works".
  - **`--complete`:** every module, every evidenced pair; unverified pairs behind a checkbox.
- Click a module → transitive reach in either direction ("what breaks" / "depends on"), with direct vs indirect listed.
- Search, pan/zoom, light/dark.
- Same provenance stamp family as `sonde doc`, via the same `buildModuleGraph` / `findNestedProjectRoots` helpers.
- `--check`, `--stdout`, `--out`, `--include-tests`.
- Thickness tracks *resolved* references, never raw name-match volume (the swift/typescript adapter pair is the worked example: 62 heuristic "references", 0 resolved).

`ARCHITECTURE.html` is already generated in this repository. `sonde init` hints at `sonde doc` and does not mention `sonde map`. The README "CLI" block lists neither `doc` nor `map`. The architecture section documents `doc` only.

### 2.4 What the current artifacts cannot answer

A module map answers *coupling*. The request is also asking for *behaviour*: how a program runs, what happens when you click something, where a request goes.

| Question a vibe coder actually asks | `sonde doc` | `sonde map` | MCP graph |
|---|---|---|---|
| What are the big pieces? | Partial (directory modules, jargon-heavy) | Yes, simple mode | No, too low-level |
| What depends on `src/store`? | Truncated table unless you know `--module` | Yes, transitive reach | `query_graph` / impact, if you know the symbol |
| What happens when a user runs `sonde impact`? | No | No | `callees_of` if you already know the entry symbol |
| Show me this PR | No | No | `--from-git-diff` impact pack, source snippets, no picture |
| Explain it in English | No (deliberately: LLM prose was deferred) | No | No |

Module = immediate parent directory of a source file. That is mechanical and honest. It is also the wrong grain for "how login works." Login is a *path through symbols*, not a directory.

### 2.5 Product principles that bind any new feature

From `prd.md` and `AGENTS.md`, these are contracts, not preferences:

1. Never fabricate an edge.
2. Heuristic member access stays labelled heuristic.
3. Source is the authority; an LLM must not declare metadata current.
4. Degrade with a warning; never fail silently.
5. Local, no account required.
6. Small MCP surface. The predecessor (`code-review-graph`) shipped wiki generation among twenty tools; silent rot was invisible.
7. Visualization and AI summaries were **explicitly later / non-goals for MVP**. `sonde doc` and `sonde map` already crossed that line in a disciplined way. Further work has to keep the same discipline or it will look like the predecessor.

`sonde doc`'s own spec **rejected** an agent-facing compact overview, on the grounds that the benchmark already wins structural Q&A in one tool call. That rejection is now in tension with the new audience (vibe coders + agents that ignore the three tools). The rejection should be revisited for a *different artifact* (orientation IR), not by stuffing HTML into the context window.

---

## 3. What Archify actually offers

Archify 3.0.1 is an **agent skill that compiles a typed JSON IR into a self-contained interactive HTML file**. It is not a code indexer.

### 3.1 Shape

1. User (or agent) describes a system, pastes Mermaid, or reads a repo.
2. Agent picks one of five types and writes JSON against a strict schema.
3. `archify validate` / `deliver` fail closed, then atomically write HTML.
4. Viewer: focus, authored upstream/downstream reach, route probe, themes, PNG / share-card export, optional motion.
5. User iterates in chat: "add Redis", "highlight the cache-miss path", "switch to light theme."

Install is `npx skills add tt-a1i/archify -g`. That distribution trick — a SKILL.md the agent loads without being taught commands — is most of why it feels "on demand."

### 3.2 Five diagram types

| Type | For | IR |
|---|---|---|
| architecture | Components, services, boundaries | `components`, `boundaries`, `connections` |
| workflow | Processes, CI, runbooks | lanes, phases, nodes, edges |
| sequence | Calls, returns, timing | participants, messages |
| dataflow | Pipelines, lineage | stages, nodes, flows |
| lifecycle | States, retries, terminals | lanes, states, transitions |

Architecture rendering does **not** auto-layout; the agent authors coordinates. Repository evidence is **opt-in** and lives beside the SVG, not as the topology source. PRODUCT.md is explicit: Archify maps *authored* structure. DESIGN.md forbids calling graph reachability "blast radius" without independent code analysis.

### 3.3 What to steal, what to refuse

Steal:

- Skill-first on-demand loop (describe → artifact → iterate).
- Self-contained HTML you can open without installing the tool.
- Progressive disclosure: one primary path, details on focus.
- Typed IR as a seam between "what to show" and "how to draw it."
- Fail-closed validation and a receipt (what was checked).
- Reach / route as *readings of authored edges*, labelled as such.

Refuse:

- LLM as the author of repository topology.
- Five generic diagram modes in the first slice.
- Coordinate-picking by the model for code maps (Sonde already has a deterministic layered layout).
- Forking Archify (MIT vs Apache-2.0 is legal; the sync cost and mixed invariants are not worth it).
- Everyday non-code maps (travel, leave requests). That is Archify's product. Sonde's graph cannot verify them, so shipping them attaches a fabrication surface to the one artifact people will trust.

Archify's own copy is the best warning: it will not call reachability "what breaks" without a code-analysis product. Sonde *is* that product. Using Archify's viewer metaphors on Sonde's graph is the overlap. Using Archify's authoring model on Sonde's graph is the failure mode.

---

## 4. Gap analysis by audience

### 4.1 Why Sonde is not useful enough yet, despite doc + map

**Discoverability.** A vibe coder who runs `sonde init` is told about `sonde doc`. They are not told about the HTML map. The README CLI cheat-sheet omits both commands. Agents never see CHANGELOG Unreleased.

**Grain.** Directory modules are an architecture review artifact. They do not explain a feature, a request, or a PR.

**No on-demand scope.** You generate the *whole repo* or you use `--module` for one directory's symbols. There is no `sonde map --focus src/pack --depth 2`, no "diagram the impact of this diff", no "sequence from `createServer`."

**No skill.** Archify is invoked by talking. Sonde is invoked by knowing the binary. Agents that only have MCP cannot produce the human files. Agents that have a shell still have no SKILL.md telling them *when* to run `doc`/`map`.

**No plain language.** `ARCHITECTURE.md` is accurate and unreadable to someone who does not already know what a module is. The LLM prose layer was deferred for good reason (fabrication + API key vs "no account required"). That deferral left the vibe-coder job unserved.

**Agents still grep.** Three excellent tools that models do not reach for is an orientation problem, not a graph problem. A skill that says "for 'how does this work', run these commands and read this IR" is the missing adapter.

### 4.2 What would make each audience succeed

**Vibe coder.** One command or one chat line produces:

1. A short Markdown they can skim ("this repo is a CLI + MCP server over a SQLite graph; work enters at `src/cli` and `src/mcp`, lands in `src/store`").
2. An HTML they can click, with the same facts, plus "what breaks if I touch this."
3. A stamp that says when it was true.

**Developer.** The same Markdown stays committable and `--check`able. The HTML is optional in-repo or gitignored as a generated snapshot. CI fails if the committed doc drifts. Heuristic arrows never look resolved.

**AI agent.** A skill plus a *read-only*, token-budgeted orientation IR (nodes, tiered edges, omission counts, provenance). HTML stays a file the human opens. The agent uses the IR to answer, and `query_graph` / `get_impact_radius` for the next hop. It does not paste SVG into the context window.

---

## 5. Approaches

### A. Ship and teach what exists (recommended first slice)

Make `sonde doc` + `sonde map` first-class: README, `init` hint, skill that runs them, optional MCP IR that *describes* the same projection.

- Cost: small.
- Risk: low. No new truth surface.
- Limit: still a module map. Vibe coders get orientation, not "how login works."

### B. Graph-backed *scoped* views (the actual product expansion)

Add on-demand projections of the existing graph:

- Focused subgraph around a module or symbol.
- Impact-of-diff map.
- Call-chain / sequence compiled from `CALLS` edges (declaration targets, with `IMPLEMENTS` fan-out labelled as inference — matching spec §6.1).
- Entry-point list derived from `bin`, MCP `serve`, and symbols with no in-repo callers.

Each projection reuses `buildModuleGraph` / query / impact. Each HTML/Markdown is a snapshot with the same stamp rules. Iteration in chat is "run it again with a new focus", not "rewrite JSON coordinates."

- Cost: medium.
- Risk: medium if sequences are drawn as runtime traces (they are not). Must label them "static call edges."
- This is the Archify-like *on demand* without Archify's authoring model.

### C. LLM-authored IR validated against Sonde (later, opt-in)

Agent writes a small narrative or a 8–12 node "story" diagram. Sonde accepts a node only if it maps to a real symbol/module, and an edge only if the graph has a matching evidenced relationship. Failed bindings are dropped or shown as "claimed, unverified" — never as solid arrows.

- Cost: high (schema, binder, skill, UX).
- Risk: high if the binder is leaky. This is how you get a pretty wrong architecture.
- Value: this is the only way to get *English* and *feature-shaped* diagrams that still inherit Sonde's credibility.
- Gate: no API key required for the default path. Prose is optional enrichment, clearly marked, never the source of edges.

**Recommendation:** A immediately, then B. C only after B has a binder that can reject a made-up arrow in a test. Do not start by forking Archify or by adding workflow/dataflow/lifecycle renderers.

---

## 6. Recommended product shape

One compiler, three sinks, one skill.

```
request ("how does this work" | "map login" | "what does this PR touch")
        |
        v
  skill / CLI / MCP describe
        |
        +-- ensure index (or refuse with `sonde index`)
        |
        +-- project (whole | focus | impact-diff | call-chain)
        |
        +--------+----------------+------------------+
        |        |                |                  |
        v        v                v                  v
   Markdown   HTML map      orientation IR      receipt
   (human)    (human)       (agent, budgeted)   (stamp, tiers, omissions)
```

### 6.1 Keep `sonde doc` as the committed contract

Do not merge the interactive map into `ARCHITECTURE.md`. The Markdown job is review and CI. The HTML job is exploration. They already share `buildModuleGraph`; keep it that way.

Add a short **orientation preface** to the Markdown (and a matching panel on the simple map): entry points, "where work enters", "where state lives", counts. Derived from the graph (files named in `package.json` `bin`, MCP server module, modules with high fan-in). No LLM required for v1 of the preface.

### 6.2 Make `sonde map` the Archify-like artifact — for code

Stay self-contained. Add, in order:

1. Discoverability (docs, init, CLI list).
2. `--focus <module-or-symbol>` and `--depth`.
3. `--from-git-diff` using the same seeds as `get_impact_radius`.
4. Click-through from a focused node to `sonde doc --module` facts already in the model (surface list exists; add file paths).
5. Deep-link hash (`#focus=src/store&reach=upstream`) so an agent can say "open this."
6. Call-chain view as a *second projection*, compiled from `CALLS`, not a new renderer family.

PNG/share-cards and theme polish are optional and later. They do not make a vibe coder understand the program.

### 6.3 Skill: `sonde-orient` (name TBD)

A SKILL.md shipped in the package / repo, installable the same way Archify is (`npx skills add` once Sonde publishes one). Written from Sonde's invariants, not paraphrased from Archify's skill text.

Routing:

- "How does this repo work?" → ensure index → `sonde doc` + `sonde map` → return paths + 20-line IR summary + "open the HTML."
- "What breaks if I change X?" → `get_impact_radius` / map `--focus` with upstream reach.
- "Show the flow of X" → call-chain projection if X resolves; otherwise ask for a symbol rather than inventing one.
- "Draw my vacation" → refuse; name Archify. Sonde does not author unverified worlds.

The skill uses the CLI. It does not teach the agent to hand-draw mermaid of the repo.

### 6.4 MCP: describe, do not render

Add **at most one** read-only tool, preferably a `query_graph` pattern such as `architecture_of` rather than a fourth advertised tool, returning:

- provenance (revision, dirty, drift, tier totals)
- bounded node list (simple projection by default)
- tiered edges with omission counts
- optional focus/reach

Hard limits: token budget, pagination, no HTML, no SVG. Writing files stays CLI-only so MCP-only clients cannot dump a generated wiki into the repo (predecessor lesson).

If MCP-only clients must *produce* a file for a human, the tool returns the IR and a message: "run `sonde map` in a shell, or ask a shell-capable agent." Do not add `write_architecture_html` to MCP.

### 6.5 Optional English (phase after the binder)

A clearly marked "Generated reading" section: a local or user-supplied model writes 3–8 sentences from the IR, never from raw source dumps of the whole repo. The Markdown must say it is a reading of the graph, not a source. Default off, so "no account required" stays true.

---

## 7. Phased plan

### Phase 0 — Honest inventory and discoverability (1 small PR)

**Goal:** Stop hiding the features that already answer half the request.

- List `doc` and `map` in the README CLI block.
- Document `sonde map` next to `sonde doc` (two modes, who each is for, `--check`).
- `sonde init` hint names both artifacts.
- AGENTS.md already describes the pair; keep them in agreement.

**Gate:** A cold reader of the README can generate Markdown + HTML without reading CHANGELOG.

**Not in this phase:** viewer polish, new flags, MCP, skill.

### Phase 1 — Skill over the existing compiler (the "on demand" loop)

**Goal:** "Show me how this project works" works in Claude Code / Codex / Cursor the way Archify does, against *verified* structure.

- Add `skills/sonde-orient/SKILL.md` (or equivalent path the skills CLI expects).
- Workflow: index if missing (ask before long `--resolve`), run `doc` + `map`, return file paths, stamp, and a compact text summary of the simple projection (module names + top edges).
- Instruct the agent to open the HTML for the human and to use MCP tools for follow-up questions.
- Explicit refusals: no invented edges, no non-code domains, no claiming the HTML is live.

**Gate:** In a fresh fixture repo, a skill-capable agent produces both files from a single user sentence, and the HTML's embedded model matches `sonde map --stdout` bytes. A request to diagram a cache that is not in the repo produces a refusal or an unverified label, never a solid arrow.

### Phase 2 — MCP orientation IR

**Goal:** MCP-only agents get the same facts without a shell and without HTML in context.

- `architecture_of` (pattern or tool) returns the simple projection, budgeted.
- Envelope includes freshness, tier totals, omission counts.
- Tests: determinism, budget truncation, heuristic edges labelled, empty index degrades.

**Gate:** Token cost of the default simple IR stays well under the current impact default (8k). Complete graph is opt-in and truncated with `truncated: true`.

### Phase 3 — Scoped on-demand views (the vibe-coder feature)

**Goal:** Generate a *relevant* Markdown + HTML, not the whole city.

CLI (illustrative):

```
sonde map --focus src/pack
sonde map --symbol packImpactResponse --depth 2
sonde map --from-git-diff
sonde doc --focus src/pack          # optional; keep committed doc whole-repo
```

Implementation notes:

- Reuse `reachable()` already in `src/map/model.ts`.
- Impact-diff seeds from existing `get_impact_radius`.
- Focused Markdown is an *on-demand* file (e.g. stdout or a path under a generated dir), not a second committed architecture doc that churns.
- HTML hash deep links for focus/reach.

**Gate:** For a known change to `src/store`, the focused map's upstream set matches a manual closure over `query_graph` / impact (same as the changelog note: this repo's store change reaches 21 modules). Disagreement is a bug.

### Phase 4 — Call-chain projection ("how the program runs")

**Goal:** Answer "what happens when X" with a static sequence compiled from `CALLS`.

- Seed: a resolved symbol (CLI handler, MCP tool callback, exported function).
- Walk `callees_of` to depth N, fan-out through `IMPLEMENTS` labelled inference (spec §6.1).
- Render as a simple top-to-bottom or left-to-right HTML (reuse map chrome: stamp, search, click for signature + file).
- Markdown sibling: numbered list of hops with paths and tiers.

**Gate:** A chain for `createServer` includes `find_symbols` / `query_graph` / `packImpactResponse` as callees if the graph says so, and does not include runtime-only partners the index never saw. Heuristic hops are dashed. Depth omission is stated.

**Do not** call this a trace, a coverage proof, or a sequence in the Archify "messages over time" sense.

### Phase 5 — Plain-language reading (opt-in)

**Goal:** Vibe coders get English without making English the authority.

- Template-based first (no model): "Work enters at {entrypoints}. The most depended-on module is {max_fan_in}. {N} modules, {E} resolved edges."
- Optional model captions later, marked `Generated reading`, disabled unless configured.
- Never writes edges. If the reading disagrees with the table, the table wins and the reading is dropped.

**Gate:** Default `sonde doc` still produces byte-identical output without a model. Enabling captions changes only a fenced, labelled section.

### Phase 6 — Only if Phase 3–4 still fail the vibe-coder job

Binder for agent-authored story diagrams: 8–12 named boxes, each mapped to a module/symbol, edges subset of the graph. This is the closest thing to Archify architecture mode that Sonde should ever ship. It is a *filter* on the graph, not a drawing tool.

If this phase is tempting at the start, skip it. Build Phase 3 first; most "story" diagrams people want are focused subgraphs.

---

## 8. What not to do

- Fork or vendor Archify. Learn the skill + IR + self-contained HTML pattern; write Sonde's viewer and skill from Sonde's invariants.
- Add workflow / dataflow / lifecycle renderers until code architecture + call-chain are used.
- Put HTML generation on MCP.
- Auto-run `sonde doc`/`map` from `init` into every repo (init already refuses surprise writes; a hint was the chosen compromise).
- Let an LLM lay out the module map. Layout is already deterministic; that is what makes `--check` possible.
- Call heuristic reach "what breaks" without the existing evidence labels. The simple map's refusal to toggle guesses back in is correct; do not "fix" it.
- Commit symbol-level or per-PR maps. They churn. On-demand files or gitignored snapshots.
- Teach agents to prefer orientation IR over `get_impact_radius` for edit safety. The packer still owns "what to read before you change this."
- Spend the first slice on PNG export, share cards, or motion. Those made Archify shareable. They do not teach a vibe coder their own code.

---

## 9. Suggested file-level work (when implementation starts)

Stay inside existing seams:

| Area | Role |
|---|---|
| `src/doc/modules.ts` | Single module projection. New views consume it; they do not copy it. |
| `src/doc/render.ts` | Markdown. Add orientation preface here. |
| `src/map/model.ts` | Projections + `reachable`. Add focus/diff/chain models. |
| `src/map/render.ts` | HTML/SVG viewer. Deep links, file paths in the panel. |
| `src/cli/main.ts` | Flags and discoverability. |
| `src/mcp/server.ts` + `schemas.ts` | One read-only orientation pattern. |
| `src/query/traverse.ts` + `impact.ts` | Seeds for focus/chain/diff. |
| `skills/sonde-orient/SKILL.md` | Agent on-demand loop. |
| `tests/cli/map.test.ts`, `tests/doc/*`, `tests/map/*` | Determinism, evidence labels, focus closure, refusal to clobber. |

Atomic writes already exist for doc/map (`writeDoc` / `writeMap`). Keep them. A failed generate must leave the previous file byte-for-byte (Archify's deliver lesson; Sonde already refuses unmarked files).

---

## 10. Success criteria

A change is done when all of these are true:

1. **Cold vibe coder.** After `sonde init`, they can produce a Markdown and an HTML that explain, in one sitting, where work enters and what the main modules are, without reading this research file.
2. **On-demand.** "Map how `get_impact_radius` reaches the store" yields a focused artifact, not the full 24-module city.
3. **Agent.** A skill-capable agent does that from a sentence. An MCP-only agent gets the IR. Neither invents a dependency the index did not emit.
4. **Developer.** `sonde doc --check` still gates the committed Markdown. Heuristic-only pairs stay visually distinct. Regeneration is byte-identical.
5. **Honesty.** Every artifact names revision, dirty/drift, and how edges were found. Call-chains say they are static.
6. **Non-regression.** `find_symbols` / `query_graph` / `get_impact_radius` remain the edit-safety path. Orientation does not replace them in the skill's routing.

Falsifiers (stop or redesign):

- Agents paste the HTML into context and blow the budget.
- A pretty arrow appears for a name collision (the adapter-pair case).
- Committed docs start churning on every symbol rename.
- Default path requires an API key.
- MCP grows a tool zoo (predecessor failure).

---

## 11. Open questions (do not block Phase 0–1)

These need a human decision before Phase 3+, not before shipping discoverability and the skill:

1. Should `ARCHITECTURE.html` be committed, gitignored, or written to a cache path like the SQLite index? Committed HTML is large and noisy; gitignored HTML cannot be reviewed in a PR; cache-path HTML is invisible to vibe coders who look at the repo on GitHub.
2. Is the simple map allowed to gain file-level drill-down, or does that belong only to `--complete` / `--module`?
3. Python without `--resolve` currently fails the project's own placement gate. Should the skill refuse Python maps unless `--resolve` was used, or generate with a loud header?
4. Where does the skill live for published npm (`@cheppulabs/sonde`) versus a GitHub skills install?

Recommended defaults if unanswered: write HTML next to the Markdown (current behaviour); file drill-down on complete only; Python maps require `--resolve` or a warning banner that matches `sonde doc`'s missing-tsconfig honesty; skill in-repo under `.agents/skills/` and documented in README.

---

## 12. Bottom line

Sonde already has Archify's *code* half (a verified graph) and a first version of Archify's *artifact* half (`ARCHITECTURE.md` + interactive `ARCHITECTURE.html`). It is missing Archify's *loop*: on-demand, scoped, skill-invoked, understandable without already knowing the architecture.

The useful modification is not "become Archify." It is:

1. Stop hiding `doc` and `map`.
2. Put a skill in front of them.
3. Give MCP the IR, not the HTML.
4. Project the **same graph** into focused maps and static call-chains so "how does this program work" is a query, not a whole-repo poster.
5. Add English last, labelled, optional, never as topology.

That sequence makes Sonde more useful to agents (they finally have an orientation adapter), developers (same honest committed doc), and vibe coders (a clickable, current picture of *their* code) without taking on Archify's generic-diagram product or its LLM-authored truth model.
