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
