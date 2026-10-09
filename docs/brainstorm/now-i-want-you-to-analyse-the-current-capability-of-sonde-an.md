# Brainstorm: Now I want you to analyse the current capability of sonde and I want to add feature like https://github.com/tt-a1i/archify offers using which it becomes more useful something like I cna create a .md file plus ismilar to archfy on demand, reason so that sonde can be useful for the AI agents, developers and vibe coders who do not have understanding of the code so we have to make thme a way they can understand how there project or prgam works so that they can better undersatnd whats going inside . So lets do  brainstorm and create a plan for modifying sonde and making it much more useful

## Codex

# Independent research: an Archify-like explanation layer for Sonde

## Recommendation in one sentence

Do not turn Sonde into a general-purpose AI drawing program. Turn it into the trustworthy evidence engine behind a paired, on-demand project guide: deterministic Markdown for agents and review, interactive self-contained HTML for humans, and a `sonde-visualize` agent skill that can add a clearly separated, source-cited narrative without ever changing or laundering Sonde's graph evidence.

The surprising part of this review is that the first half is already built. At commit `3f9cd28`, Sonde has both `sonde doc` and `sonde map`; the latter already creates the self-contained interactive HTML that the original request describes. The next plan should therefore focus on explanation, provenance-preserving projections, and agent workflow rather than building a second graph renderer from scratch.

## What Sonde can do today

Sonde is already a strong substrate for this feature:

- It indexes TypeScript, Python, and Swift into a local SQLite symbol graph.
- Its three MCP tools cover seed lookup (`find_symbols`), tiered structural traversal (`query_graph`), and budgeted change impact (`get_impact_radius`).
- Every relationship has an evidence tier. `COMPILER` and `LEXICAL` are resolved evidence; `HEURISTIC` is suggestive; external and unresolved references remain explicit rather than becoming invented edges.
- It checks structural drift, re-verifies returned source bytes, reports degraded states, and keeps repository reads inside the boundary abstraction.
- `sonde doc` writes a deterministic, guarded `ARCHITECTURE.md` containing module summaries, dependency evidence, freshness warnings, and a Mermaid overview. It refuses to overwrite a human-owned file and supports `--check` and `--module`.
- `sonde map` now writes a deterministic, self-contained `ARCHITECTURE.html`. It supports a simple orientation projection and a complete audit projection, search, pan/zoom, light/dark themes, keyboard selection, source/target direction switching, and transitive upstream/downstream reach.
- The simple map deliberately shows only resolved-majority dependencies. The complete map distinguishes resolved, weak, and unverified pairs. Edge weight is based on `COMPILER + LEXICAL`, never raw heuristic volume.
- Both Markdown and HTML use the same `findNestedProjectRoots` and `buildModuleGraph` helpers, so they cannot quietly tell different architectural stories.

This is more than a prototype. The current map has CLI tests for self-containment, determinism, stale checks, safe overwrite behavior, path containment, and the difference between simple and complete projections. Model tests protect evidence classification, roll-up behavior, transitive reach, and the invariant that resolved evidence—not noisy name matches—controls visual prominence.

The current limitations are equally important:

- The map is module-level only. It does not explain a request path, state transition, data lifecycle, or one feature's implementation.
- A module card shows counts, public surface names, and reachability, but no plain-language purpose, source locations, selected entry points, or “start reading here” path.
- The HTML has no public, versioned source IR. Its JSON model is an internal renderer shape embedded in the file.
- There is no Sonde agent skill that decides what to inspect, gathers evidence, chooses a diagram projection, or pairs the HTML with a task-focused Markdown explanation.
- MCP-only agents cannot consume the HTML usefully. It is a human artifact, not context. Agents still need compact structured evidence.
- The current CLI documentation does not yet list `sonde map`, even though the unreleased implementation exists.
- Sonde cannot honestly generate behavioural prose from the graph alone. Its own benchmark says natural-language queries without identifier overlap remain an unsolved weakness.
- A static declaration graph is not a runtime trace. A call path may be source-backed without proving that it executes in production.

## What Archify actually contributes

Archify is best understood as an agent-authored communication system rather than a code indexer. Its current skill routes a request into one of five typed diagram modes—architecture, workflow, sequence, data flow, and lifecycle—then has the agent author JSON, validate it, render it, run browser checks, and atomically deliver standalone HTML. Its repository workflow asks the agent to freeze a revision, trace a small connected slice, attach exact source ranges, preserve unknowns, and avoid turning labels into unobserved behavior.

Its strongest reusable ideas are:

1. A typed, editable JSON IR is the durable source; HTML is a compiled artifact.
2. Different questions get different projections. Architecture, sequence, workflow, data flow, and lifecycle are not forced into one universal graph view.
3. Validation occurs before delivery, and the previous good artifact survives a failed candidate.
4. The viewer progressively discloses detail: focus, route, reach, search, presentation, theme, and export do not clutter the initial story.
5. Repository claims can carry revision-pinned source references.
6. The skill is the natural-language control plane; the renderer stays deterministic.

The crucial difference is authority. Archify's topology is authored by an agent or a user, even when it is carefully cited. Sonde's topology comes from an indexed graph with explicit uncertainty and measured accuracy. Sonde should borrow Archify's compilation and delivery architecture, not replace its evidence model with agent-authored arrows.

Archify's breadth is also a warning. Its current CLI is thousands of lines and covers five schemas, multiple renderers, exports, browser validation, preview, comparisons, styles, sharing cards, and many delivery receipts. Importing or forking the whole project would give Sonde a large maintenance surface before proving that users need more than its existing map. The MIT license permits reuse, but licensing is not the deciding cost; product scope and evidence semantics are.

Sources inspected on 2026-10-09:

- [Archify repository and README](https://github.com/tt-a1i/archify)
- [Archify skill contract](https://github.com/tt-a1i/archify/blob/main/archify/SKILL.md)
- [Repository-backed authoring rules](https://github.com/tt-a1i/archify/blob/main/archify/references/repository-authoring.md)
- [Architecture JSON schema](https://github.com/tt-a1i/archify/blob/main/archify/schemas/architecture.schema.json)
- [Archify design system](https://github.com/tt-a1i/archify/blob/main/DESIGN.md)

## The product: Sonde Guide

The user-facing concept should be a **Sonde Guide**, not merely a prettier graph.

A guide is a paired artifact compiled from one evidence model:

- `ARCHITECTURE.md`: stable, diffable, compact, useful to developers and agents.
- `ARCHITECTURE.html`: interactive, visual, self-contained, useful to newcomers and non-experts.
- An optional versioned JSON source/receipt for focused views and safe iteration.

The default repository guide remains deterministic and may be committed. Focused, on-demand guides—for example “how authentication works” or “what changes if I alter the store schema?”—should live under a generated directory such as `.sonde/views/<slug>/` unless the user chooses another path. They should not overwrite the stable repository overview.

The experience for a newcomer should answer four questions immediately:

1. What is this project and where does work enter?
2. What are the major parts, in plain language?
3. What happens along one important path?
4. Where should I read first, and what evidence is uncertain?

The current module map answers part of questions 2 and 4. The proposed guide adds the narrative and task-specific path without pretending that narrative is compiler output.

## Authority must be explicit

Every node, relationship, note, and diagram should carry one of these authority classes:

- `sonde-indexed`: derived from Sonde symbols or edges, including stable key, relationship kind, tier, confidence, and source site when available.
- `repository-cited`: prose or grouping authored by an agent but backed by one or more verified file/range/hash references.
- `user-authored`: a plan, desired architecture, everyday workflow, or fact supplied by the user.
- `agent-inferred`: an interpretation that is useful but not established by the graph or a direct citation. Hidden by default in codebase diagrams or displayed with an unmistakable caveat.

Only `sonde-indexed` relationships may be presented as discovered code topology. A high-quality explanation may combine all four classes, but the viewer and Markdown must make the boundary visible. This prevents an agent-written “API calls database” arrow from acquiring the same visual authority as a compiler-resolved edge.

For code maps, Sonde's existing evidence rule remains non-negotiable:

```text
resolved = COMPILER + LEXICAL
HEURISTIC never increases default prominence
```

An agent may hide detail or choose a clearer projection; it may not promote, retarget, or silently drop uncertainty from the underlying relationship.

## A small visualization IR

Promote the useful part of `MapModel` into a public, versioned `VisualizationIR`. Keep it smaller than Archify's general schema at first.

Suggested shape:

```json
{
  "schema_version": 1,
  "kind": "module-map",
  "repository": {
    "root_hash": "...",
    "revision": "...",
    "dirty": false
  },
  "freshness": {
    "state": "fresh",
    "drift_count": 0,
    "warnings": []
  },
  "nodes": [
    {
      "id": "module:src/store",
      "label": "Storage",
      "kind": "module",
      "metrics": { "files": 5, "symbols": 48 },
      "sources": [{ "path": "src/store/repos.ts", "line": 1 }],
      "authority": "sonde-indexed"
    }
  ],
  "edges": [
    {
      "id": "...",
      "from": "module:src/index",
      "to": "module:src/store",
      "relation": "depends-on",
      "evidence": {
        "compiler": 12,
        "lexical": 5,
        "heuristic": 9,
        "classification": "resolved"
      },
      "authority": "sonde-indexed"
    }
  ],
  "annotations": []
}
```

Layout coordinates should be a renderer result, not semantic identity. A stable semantic IR makes Markdown, HTML, tests, future renderers, and an agent skill agree while allowing layout improvements without changing the evidence receipt.

Do not create one giant schema for every possible diagram. Use a small shared envelope and separate projection payloads:

- `module-map`: existing repository orientation.
- `impact-map`: direct and transitive dependants plus structurally related tests.
- `static-flow`: a bounded path through `CALLS`/`REFERENCES`, explicitly named static rather than runtime.
- `change-map`: changed symbols, affected modules, test relationships, and uncertainty.
- Later, agent-authored `workflow`, `sequence`, `dataflow`, and `lifecycle` payloads that use the same viewer shell but not the Sonde graph authority class.

## The agent skill

Package a `sonde-visualize` skill after the IR and validator are stable. The skill should be thin and opinionated:

1. Check `sonde status`; stop or visibly degrade when no usable index exists.
2. Classify the request as repository overview, focused static flow, impact/change explanation, or non-code authored diagram.
3. For a code request, gather compact evidence through the CLI or existing MCP tools. Prefer stable keys and exact relationships over broad repository reading.
4. Ask only when the requested focus is materially ambiguous. Otherwise choose the smallest useful projection.
5. Add plain-language labels and notes as a separate annotation layer with citations and authority tags.
6. Validate that every indexed node and edge still exists, every cited source range hashes correctly, no heuristic-only pair is shown as verified, and no source path escapes the root.
7. Render Markdown and HTML from the same IR, write through a temporary candidate, run structural and browser checks, then atomically replace the generated artifact.
8. Report exact output paths, freshness, validation result, and any unresolved claims.

The skill should not paste HTML into model context. For agents, the useful artifact is the compact IR or Markdown. HTML is the delivery surface for humans.

When asked for an everyday plan or a future system design, the skill may use the generic authored projections, but it must not invoke or imply Sonde indexing. Those outputs should say “user-authored plan” rather than “source-backed architecture.” This makes the broader Archify-like use case possible without diluting Sonde's brand as a code-context engine.

## Plan

### Phase 0 — close and release what already exists

1. Treat the current `sonde map` implementation as the baseline, not a spike to rebuild.
2. Complete its current review/test handoff and record the actual gate result.
3. Add `sonde map` to README CLI documentation and setup discoverability.
4. Run full tests and typecheck, then perform the required clean-install release verification on an external throwaway project. Verify both presence and absence of warnings.
5. Dogfood the simple and complete map on one TypeScript, one resolved Python, and one Swift repository. Record HTML size, node/edge count, render readability, drift disclosure, and whether evidence classification remains honest.

Exit: the existing paired `ARCHITECTURE.md`/`.html` experience is released and documented before further scope is added.

### Phase 1 — extract a versioned IR and validator

1. Add `src/visualize/ir.ts` with the shared envelope, authority classes, nodes, source references, and tiered edges.
2. Refactor the current module map builder to emit semantic IR before layout. Preserve current HTML bytes or update golden tests deliberately.
3. Add a JSON output mode such as `sonde map --format json` or a narrowly named `sonde project module-map --json`. Do not expose arbitrary database rows.
4. Build validation for referential integrity, tier totals, authority/provenance, source containment, freshness, unique IDs, and unsupported fields.
5. Add deterministic hashing/receipt support so `--check` compares semantic structure while ignoring volatile provenance fields, as current `doc` and `map` already do.
6. Keep writes guarded and atomic; a failed candidate must not replace the last good file.

Exit: Markdown and HTML can be proven to derive from the same validated semantic model.

### Phase 2 — make the repository guide useful to non-experts

1. Add plain-language direction labels consistently: “uses,” “used by,” “what may be affected,” and “depends on.” Keep technical relation/tier details one click away.
2. Add a selected-node “start here” panel with key files, top resolved surface symbols, direct dependencies, direct dependants, and exact copyable source locations.
3. Add deep links for focus and reach, for example `#focus=module:src/store&reach=upstream`, without storing viewer state in canonical output.
4. Add route finding between two visible nodes over resolved edges, returning the exact path and evidence. Do not call it a runtime trace.
5. Add a short guided overview assembled from deterministic facts: entry candidates when mechanically evidenced, foundational modules, highly depended-on modules, and freshness/coverage caveats.
6. Improve accessibility: full keyboard navigation, non-color evidence cues, reduced-motion support if motion is later added, and responsive containment.

Exit: a developer unfamiliar with the repository can identify where to start, follow one dependency path, and reach exact source without reading raw graph terminology.

### Phase 3 — add focused code projections

Implement one at a time, behind evidence-based tests:

1. `impact-map` from the existing impact traversal. Show direct vs transitive results and keep `TESTS` labelled as relatedness, never coverage.
2. `change-map` from git diff mapping plus impact. Highlight changed symbols and affected modules without inferring risk or breakage beyond the evidence.
3. `static-flow` from a selected symbol and bounded call/reference paths. Require compiler or lexical edges by default; allow heuristic edges only through an explicit visibility control and warning.
4. Generate a paired focused Markdown summary from the same projection.

Do not add workflow, sequence, data flow, and lifecycle modes to core Sonde in this phase. First prove that code-specific views improve Sonde's actual users.

### Phase 4 — ship the skill

1. Write the skill contract and examples around the three code projections.
2. Teach it to create a concise, cited annotation layer rather than rewriting topology.
3. Add fixtures for a clean index, drifted index, parse failure, compiler-unavailable repository, heuristic-heavy relationship, and ambiguous user request.
4. Add end-to-end tests showing that a fresh skill invocation can create both Markdown and HTML, repair a validation error within a bounded number of attempts, and leave the last good artifact untouched on failure.
5. Initially require shell access. Do not expand the MCP surface merely so an agent can request an HTML blob; measure a real MCP-only need first.

Exit: Codex/Claude-style agents can create a checked guide on demand with fewer exploratory reads than an ordinary search loop.

### Phase 5 — optional generic authored diagrams

Only after the code-focused skill is used successfully:

1. Add separate typed schemas for workflow and sequence first; they cover most system and everyday-plan requests.
2. Reuse the viewer shell, validation, delivery, themes, and receipt format.
3. Require `user-authored` or `agent-inferred` authority; never attach Sonde evidence tiers to a generic arrow.
4. Add lifecycle and data-flow modes only in response to measured demand.
5. Keep these modes in the skill/renderer package, not in indexing, query, or MCP modules.

## Evaluation gates

The feature should be judged as a comprehension tool, not by whether the HTML looks impressive.

### Truth gates

- Zero fabricated `sonde-indexed` nodes or edges across fixtures.
- Every displayed indexed relationship round-trips to stable keys and preserves relation kind, tier, and available site evidence.
- A heuristic-only relationship is never solid, default-prominent, or described as proven.
- Dirty, partial, parser-failed, missing-toolchain, and stale states are visible in both Markdown and HTML.
- Structural `TESTS` edges always retain the coverage caveat.

### Artifact gates

- Self-contained HTML with no runtime network dependency.
- Deterministic semantic IR and deterministic layout for identical input.
- Safe refusal to overwrite non-Sonde files.
- Atomic delivery that preserves the last good artifact.
- Keyboard-readable and usable at common laptop widths.
- Source paths and links cannot escape the repository boundary.

### Usefulness gates

Run a small controlled evaluation with developers unfamiliar with the fixture repository and with an agent:

- Identify the entry area.
- Explain the responsibility of one major module.
- Trace how one selected component reaches another.
- Determine what may be affected by a change.
- Find the first two source files worth reading.
- State what evidence is uncertain.

Compare README/file tree alone, current `ARCHITECTURE.md`, current map, and the proposed guide. Track correctness, time, confidence, exploratory tool calls, and context tokens. A code-focused projection proceeds only if it improves at least two real questions without degrading the direct lookup control. Generic diagram modes need a separate demand signal; popularity of Archify is not evidence that Sonde users need all five modes.

## Explicit non-goals

- No WYSIWYG editor.
- No hosted sharing service.
- No arbitrary Mermaid beautifier in the core.
- No automatic claim that a static call path is a runtime execution trace.
- No AI-generated module description presented as source-derived fact.
- No graph prominence based on raw heuristic count.
- No new MCP tool until CLI/skill usage demonstrates an MCP-only gap.
- No attempt to match Archify's export, animation, preview, comparison, and style surface in the first release.

## Build versus reuse

Keep Sonde's native renderer and evolve it. It already implements the hardest Sonde-specific contracts: shared graph provenance, deterministic projection, freshness disclosure, safe writes, and resolved-evidence weighting. Borrow Archify's architecture conceptually—typed IR, projection-specific schemas, validation receipts, last-good delivery, and skill orchestration. Reusing isolated MIT-licensed viewer techniques is reasonable if attribution is preserved, but adopting Archify wholesale would make Sonde maintain a general communication suite and still require a separate adapter for Sonde's evidence tiers.

The durable differentiator is not “Sonde can draw boxes.” It is:

> Sonde can turn a codebase into an explanation where every discovered relationship says how it was known, every narrative addition says who authored it, and the same evidence is useful to an agent in Markdown/JSON and to a human in an interactive HTML guide.

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
