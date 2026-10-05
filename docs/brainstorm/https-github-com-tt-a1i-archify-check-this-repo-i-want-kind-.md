# Brainstorm: https://github.com/tt-a1i/archify, check this repo, I want kind of similar feature for sonde so that user agent skill and visualization tool that converts codebases, system architectures, workflows, or everyday plans into interactive, self-contained HTML diagrams.

## Codex

# Independent research: an Archify-like visualization capability for Sonde

Date: 2026-10-06

## Bottom line

Sonde should not clone Archify wholesale. It should borrow Archify's strongest product pattern — an agent skill producing a typed diagram IR that is compiled into checked, self-contained HTML — while making Sonde's structural graph, evidence tiers, drift state, and stable symbol identities the authority for repository-backed diagrams.

This is a conditional recommendation, not yet a roadmap commitment. Sonde's PRD explicitly prioritized retrieval correctness over visualization, required the product to remain useful without a graph UI, and placed interactive visualization in later goals. The first action should therefore be a short, falsifiable dogfood spike: can an interactive module map answer a real architecture question materially faster or more clearly than the existing `sonde doc` Markdown? If it cannot, stop after the spike.

If that gate passes, the clean product shape is:

1. A native `sonde map` compiler for codebases. It deterministically projects Sonde's index into diagram IR and then into one offline HTML file.
2. A `sonde-visualize` agent skill. For repositories it invokes the native compiler and uses Sonde queries to choose scope; for systems, workflows, and everyday plans it authors the same IR from the user's description.
3. An explicit provenance boundary in both the IR and viewer:
   - `sonde-indexed`: topology came from Sonde's graph and carries tiers/freshness.
   - `repository-cited`: a human/agent-authored claim with pinned source references.
   - `user-authored`: a plan or described system, not code-verified.

Do not add an MCP tool that writes HTML. The renderer is a file-producing workflow and belongs in a CLI/library used by a shell-capable skill. However, Claude's review identifies a real access gap: an MCP-only agent cannot invoke `sonde map`. The spike should test that user segment explicitly. If MCP-only use matters, expose the same bounded, deterministic IR through a read-only surface—preferably as a new `query_graph` pattern before adding a fourth advertised tool. It must remain budgeted and paginated; returning an entire repository graph would contradict Sonde's cost-and-determinism thesis.

The first release should cover repository architecture only. Generic workflow, sequence, data-flow, lifecycle, and everyday-plan modes should reuse the IR/viewer later, but they should not delay or dilute the differentiated feature: a trustworthy interactive code map. Generic modes belong primarily to the skill and shared renderer, not to Sonde's repository-analysis core.

## What Archify actually is

Archify v3.0.1 is primarily an agent skill plus a local Node CLI, not a hosted diagram editor. The skill instructs an agent to turn either prose or repository inspection into a typed JSON specification, then run a compiler-like validation and delivery path. The resulting HTML contains its SVG, CSS, JavaScript, and data and can be opened or shared without Archify installed.

Its important architectural choices are:

- Five typed IRs: `architecture`, `workflow`, `sequence`, `dataflow`, and `lifecycle`. Unknown fields are rejected with JSON Schema `additionalProperties: false` rather than ignored.
- Renderer-specific semantic models rather than one lowest-common-denominator graph. Architecture has components/boundaries/connections; sequence has participants/messages/activations; lifecycle has states/transitions, and so on.
- The agent owns semantic abstraction and much of layout judgment. Archify explicitly declines general-purpose auto-layout; coordinates are commonly authored and then mechanically checked.
- A shared viewer is embedded into every output. It provides pan/zoom, search, focus, upstream/downstream reach, directed route probing, deep links, presentation mode, themes, and exports.
- Static meaning is canonical. Animation is opt-in, finite, reader-controlled, honors reduced-motion, and is removed from canonical exports.
- Repository evidence is opt-in and revision-pinned. The candidate records a credential-free origin and full commit SHA; sources use repository-relative paths and line ranges. Validation checks the local Git origin, commit object, blobs, and line ranges before embedding evidence.
- Validation is treated as a product feature. Schema, semantic, geometry, text-fit, route, collision, containment, artifact, provenance, and real-browser checks produce machine-readable diagnostics and repair hints.
- Delivery is atomic and receipt-backed. Archify distinguishes deterministic artifact validation, automated browser evidence, screenshot collection, and human perceptual review instead of treating any one as proof of all four.
- Runtime validation has no package/network dependency: AJV validators are generated at development time and shipped as JavaScript.

The repository structure reinforces this separation: `SKILL.md` is the agent workflow; `schemas/` define the authoring contract; mode-specific `renderers/` compile it; `renderers/shared/` contains validation, geometry, evidence, localization, and output logic; `assets/template.html` is the shared viewer shell; and `bin/archify.mjs` is the product command surface.

Archify is not a code graph extractor. For a real repository, the skill tells the agent to inspect entry points, imports, calls, configuration, and side effects, record source locations, and author claims. Its Git verifier proves that cited paths and ranges exist at the pinned revision; it does not prove that the authored architectural interpretation follows from those lines. That is the largest opportunity for Sonde.

## What is worth copying

### 1. Typed IR as the seam

Do not generate HTML directly from agent prose and do not parse generated Mermaid as an intermediate format. A small, versioned IR makes agent edits reviewable, validation precise, rendering deterministic, and future viewers replaceable.

### 2. One-file offline delivery

A self-contained HTML artifact is a strong fit for Sonde's local-first/no-account positioning. The default viewer should make no network requests, load no CDN scripts or fonts, and require no local server.

### 3. Progressive disclosure

The initial canvas should tell one comprehensible story. Search, focus, relationship inspection, exact path tracing, and evidence details should be available on demand. Sonde's own `sonde doc` dogfood already proved that an exhaustive dependency diagram is unreadable: the first version produced 615 arrows, and even the `src/` slice had 159. The HTML viewer must preserve the same "summary first, completeness behind interaction" principle.

### 4. Truthful interaction

Archify carefully distinguishes authored reachability from impact or blast radius. Sonde can go further: repo-backed reachability and impact can be computed from actual tiered edges, while generic diagrams must retain the weaker `authored reachability` wording. The viewer must never infer a path from geometry.

### 5. Fail-closed validation and receipts

Render only valid IR; write the final HTML atomically; emit a digest and compact receipt; never overwrite an unrelated file; keep artifact checks separate from actual visual review. This matches Sonde's existing "degrade with a warning; never fail silently" invariant.

### 6. Source evidence in the detail surface, not on the main canvas

Clicking a node should open a compact evidence panel with stable identity, file/range, inbound/outbound relationships, tier counts, revision, and freshness. The main diagram should remain legible.

## What Sonde should not copy

- Do not begin with five renderers, four visual presets, video/raster export, share cards, guided presentation, localization catalogs, live preview, and a large browser QA apparatus. Archify's current template alone is over 13,000 lines, and its architecture renderer is roughly 950 lines plus routing, label, and geometry modules. That is a mature second product, not an MVP feature.
- Do not ask an agent to rediscover code topology through file reads when Sonde already has a measured graph. The agent should choose scope and narrative; it must not manufacture repo-backed edges or silently upgrade a heuristic edge.
- Do not reuse manual coordinates for automatically generated repository maps. A deterministic graph layout is necessary when nodes and edges come from an index and change across commits.
- Do not put diagram generation into `LanguageAdapter.extract`. Projection and rendering belong downstream of the store/query layer, preserving extraction purity.
- Do not add an MCP `visualize` tool merely for discoverability. Keep HTML generation outside MCP; if MCP-only clients prove important, return bounded IR through a read-only graph-query surface instead.
- Do not call a standalone HTML snapshot "current." Once detached from the repository it cannot detect later drift. It can truthfully say what revision/index state it describes and support `sonde map --check` when run back in the repo.
- Do not embed source bodies by default. A portable HTML file is easy to share accidentally; structural metadata and copyable `path:line` evidence are enough for the first version.
- Do not visually rank dependencies by total edge volume. `HEURISTIC` volume once created dozens of fabricated-looking module relationships from common filenames and symbol names; layout prominence and default visibility must be driven by resolved (`COMPILER + LEXICAL`) evidence.

## Why Sonde has a stronger foundation for codebase diagrams

Sonde already owns the hard truth plane:

- stable symbol keys that are not line-based;
- exact `COMPILER`, reliable `LEXICAL`, suggestive `HEURISTIC`, `EXTERNAL`, and `UNRESOLVED` outcomes;
- source file, symbol, edge kind, site line, and candidate information in SQLite;
- repository revision, dirty state, parse failures, and index drift;
- graph traversals for callers, callees, imports, inheritance, containment, and tests;
- bounded impact traversal;
- a module aggregation model already used by `sonde doc`;
- a deterministic documentation contract and `--check` behavior.

The current `sonde doc` path is the right starting model, not a source to scrape. `buildModuleGraph` should feed a shared architecture projection object from which Markdown and visual IR are independently rendered. Parsing Sonde's Mermaid output back into a graph would throw away tier counts, omissions, unresolved references, stable IDs, and exact provenance.

One implementation detail is non-negotiable: reuse `resolvedOf` semantics from `src/doc/modules.ts` for default edge selection, ranking, and thickness. Heuristic-only pairs may be available behind an explicit filter, but they must not make a relationship look important merely because ambiguous name matching produced many candidates.

## Proposed product surface

### Native CLI

Suggested commands after the spike passes its gate:

```text
sonde map [path] --output <file.html>
sonde map [path] --spec <file.json>
sonde map [path] --stdout-spec
sonde map [path] --check <file.html>
sonde map [path] --include-tests
sonde map [path] --focus <symbol-or-module> --depth <n>
```

The default is a module-level architecture map. `--focus` can produce a bounded symbol neighborhood or impact view later. `--stdout-spec` gives the skill a deterministic handoff and makes the IR inspectable. Require an explicit output path in the raw CLI; the skill may create a timestamped `.sonde/visuals/<slug>/` working folder so it never silently replaces an earlier artifact.

Keep `sonde doc` unchanged. Its committed Markdown, coarse/fine split, and CI contract solve a different job. `sonde map` is an explorable snapshot and can be generated on demand.

### Access profiles

Treat transport as a capability matrix rather than assuming every agent has a shell:

| Client profile | Repository-backed diagram path | Expected limitation |
|---|---|---|
| Shell + filesystem | Skill invokes `sonde map`; returns the HTML path and receipt | Full experience |
| MCP + artifact/filesystem support | Read-only bounded IR, then a client-side/shared renderer writes HTML | Requires a renderer available outside Sonde MCP |
| MCP-only, no artifact write | Read-only bounded IR for explanation or handoff | Cannot honestly promise an HTML artifact |

The skill must detect the available profile and state the limitation rather than silently falling back to agent-invented topology. A fourth MCP tool is justified only if extending `query_graph` would make its contract incoherent and measured users need the new surface.

### Agent skill

Ship a standards-shaped `skills/sonde-visualize/SKILL.md` in the repository/package and make it installable through normal agent-skill tooling. Its routing logic should be:

1. Codebase or code-impact request: ensure an index exists, report degradation, use `sonde map --stdout-spec` or existing Sonde queries, and never invent repo topology.
2. Described system architecture: author an `architecture` IR with `provenance.mode = "user-authored"`.
3. Ordered process or everyday plan: author `workflow` IR.
4. Back-and-forth interaction: author `sequence` IR.
5. Movement of data, money, or documents: author `dataflow` IR.
6. Status/state transitions: author `lifecycle` IR.
7. Validate, render, verify the artifact, then return the absolute HTML path plus a truthful validation/provenance summary.

For generic modes, the skill should ask only for missing facts that would materially change the result (dates, amounts, required steps, decision rules) and must never label the diagram `sonde-indexed`. Its wording and workflow should be written from Sonde's own contracts rather than closely paraphrasing Archify's skill text; Archify is inspiration and a comparison target, not a template to copy.

## IR recommendation

Use a common envelope with mode-specific payloads. A repo-backed architecture spec might look conceptually like this:

```json
{
  "schemaVersion": 1,
  "diagramType": "architecture",
  "meta": {
    "title": "Sonde module architecture",
    "provenance": {
      "mode": "sonde-indexed",
      "revision": "…",
      "dirty": true,
      "driftedFiles": 2,
      "parseFailures": 0,
      "compilerVersion": "…"
    },
    "omissions": {
      "hiddenEdges": 227,
      "unverifiedPairs": 157
    }
  },
  "nodes": [
    {
      "id": "module:src/query",
      "label": "src/query",
      "kind": "module",
      "facts": { "files": 4, "symbols": 183 }
    }
  ],
  "edges": [
    {
      "id": "dep:src/query->src/store",
      "from": "module:src/query",
      "to": "module:src/store",
      "kind": "references",
      "tierCounts": { "COMPILER": 18, "LEXICAL": 8, "HEURISTIC": 16 }
    }
  ]
}
```

Important rules:

- IDs derive from module paths or Sonde stable keys, never source lines.
- Mixed-tier aggregate edges retain all tier counts. Render solid when at least one resolved edge exists; render dashed only when the relationship is heuristic-only. Edge ranking and thickness use resolved counts first; heuristic counts may be disclosed but never inflate visual authority. Filters must not silently reinterpret a mixed edge.
- `EXTERNAL` and `UNRESOLVED` are counts/facts, not fabricated target nodes. A future explicit package node is allowed only when the external target is actually known.
- `TESTS` is always heuristic and every surface exposing it must display the existing caveat that structural relatedness does not prove coverage.
- Every label, URL, path, and user-authored string is untrusted and escaped.
- The schema rejects unknown fields and version mismatches.

## Deterministic repository layout

Archify can rely on an agent choosing coordinates; Sonde's generated map cannot. For the first architecture renderer, use a bounded deterministic layered layout:

1. Start from the same test/nested-project filtering and `resolvedOf` ranking as `sonde doc`.
2. Keep all selected modules as nodes, but initially draw only a bounded set of dependencies with resolved evidence; show omitted and heuristic-only pair counts separately and let the user reveal the latter explicitly.
3. Collapse strongly connected components for rank assignment.
4. Assign layers from the condensed DAG.
5. Use stable-ID tie-breaking and a fixed number of barycentric ordering sweeps.
6. Route edges orthogonally with deterministic port ordering.
7. Keep layout output in the IR or in a separate compiled-layout structure so rendering is pure.

This is enough for a useful module map. A general graph layout dependency can be evaluated later, but the MVP should not make the HTML depend on a CDN or ship a browser-side physics simulation whose positions change between runs.

## Viewer MVP

The first self-contained HTML should support:

- dark/light theme;
- pan, zoom, reset, keyboard navigation, and reduced motion;
- search by module/symbol label and stable ID;
- click-to-focus detail panel;
- exact upstream/downstream reach over embedded edges;
- exact directed path tracing;
- tier filters and a one-click "resolved only" view;
- visible revision, dirty/drift, parse-failure, tier-composition, omission, and unresolved indicators;
- copyable `path:line` evidence and revision-pinned web links only when a safe supported public remote is known;
- hash-based deep links for focus/path state;
- an always-visible disclosure when test relationships or authored-only facts are present.

Defer PNG/WebP/WebM export, share cards, animated traces, multiple visual presets, live preview, and rich presentation mode until actual use demonstrates demand.

## Internal architecture for Sonde

```text
SQLite / existing queries
          |
          v
pure repository projection  ---> existing Markdown renderer
          |
          v
versioned Diagram IR <--- agent-authored generic IR
          |
          v
deterministic layout compiler
          |
          v
pure HTML/SVG renderer
          |
          v
artifact validator + atomic writer + receipt
```

Suggested files:

```text
src/visualize/
  ir.ts             versioned discriminated unions and validation
  projection.ts     Store rows / ModuleGraph -> repository IR
  layout.ts         deterministic architecture layout
  render.ts         compiled IR -> self-contained HTML
  validate.ts       graph, identity, containment, and artifact checks
  artifact.ts       clobber protection, atomic write, digest receipt
skills/sonde-visualize/
  SKILL.md
  references/
  examples/
```

The renderer should receive plain data and do no repository I/O. Store access and all caller-supplied repository reads remain behind the existing repository boundary. Generated HTML should contain no external requests; ideally it should carry a restrictive CSP, avoid dynamic HTML insertion, encode embedded JSON safely, and never execute repository content.

## Delivery and correctness gates

The minimum trustworthy pipeline is:

1. Validate schema and cross-object references.
2. Validate provenance rules and invariant disclosures.
3. Compile deterministic layout.
4. Render to a private temporary sibling.
5. Parse/check the final HTML and SVG: unique IDs, no dangling endpoints, no non-finite geometry, accessible names, embedded data digest, no external network resources.
6. Atomically publish only after checks pass.
7. Emit a JSON receipt with schema version, repository/index identity, spec digest, artifact digest, byte count, node/edge/tier counts, omissions, and check results.

Tests should prove byte-identical output under shuffled input, correct tier precedence, no heuristic promotion, `TESTS` disclosure, truthful dirty/drift stamps, stable IDs across line movement, clobber refusal, HTML escaping against hostile labels, no external resource URLs, bounded output on dense graphs, and browser behavior at representative desktop/mobile widths. Browser tests belong in development/CI; end users should not need Chromium merely to generate a map.

## Key risks and mitigations

| Risk | Mitigation |
|---|---|
| Feature breadth repeats the predecessor's decay | Ship one architecture renderer and one viewer story first; retain Sonde's small MCP surface. |
| Visualization does not beat the existing document | Make Phase 0 a stop/go experiment with timed architecture questions; do not promote the spike on aesthetic appeal alone. |
| CLI-only rendering excludes MCP-only agents | Detect client capability, provide bounded read-only IR where justified, and disclose when HTML delivery is unavailable. |
| Users confuse authored plans with verified code facts | Required provenance mode, distinct viewer badge, and vocabulary restrictions. |
| Dense graphs become interactive spaghetti | Summary projection by default, exact omission counts, focus/reach/path views, resolved-only filter. |
| A shared HTML leaks private code | No source bodies by default; redact credentials; safe public links only; structural metadata warning before sharing. |
| HTML is stale after generation | Embed revision/dirty/drift state, call it a snapshot, and support `sonde map --check`. |
| Heuristic edges look authoritative | Preserve tier counts, tier-first styling/filtering, and never merge them into an unlabeled edge count. |
| Layout changes create noisy diffs | Stable IDs, deterministic sort/layout, no timestamps, fixed algorithms/version in the receipt. |
| Generic diagram work swallows the code product | Keep generic authoring in the skill and mode schemas; keep code projection in Sonde core. |
| Viewer code becomes a second large application | Strict MVP interaction set, dependency-free runtime, shared semantic detail surface, defer export/presentation extras. |

## Recommended phased plan

### Phase 0: one dogfood spike

Export Sonde's current module graph to a small JSON prototype and render a single Sonde repository map. It may use Archify only as a temporary comparison target, not as a product dependency.

Before looking at the result, write 3–5 concrete architecture questions and a simple protocol. Compare `sonde doc` with the HTML map on answer correctness, time-to-answer, confidence calibration, artifact size, generation time, and layout stability. Include at least one dense graph, one degraded/freshness case, one misleading heuristic-heavy pair, and one MCP-only access walkthrough.

**Go/no-go rule:** proceed only if the map makes at least one recurring, important task materially easier without obscuring provenance or creating a new maintenance burden disproportionate to the gain. "It looks better" is insufficient. If the Markdown and existing graph queries are as effective, retain the spike as research and stop.

### Phase 1: native repository map

Implement the architecture IR, module projection, deterministic layout, self-contained viewer MVP, atomic artifact delivery, receipts, and `sonde map --check`. Acceptance requires the Sonde repository and one larger fixture to remain readable with disclosed omissions.

### Phase 2: structural exploration

Add focused symbol neighborhoods, callers/callees, exact routes, bounded impact views, test-relatedness disclosure, and revision-pinned source links. Add the installable `sonde-visualize` skill for repository requests.

### Phase 3: authored diagram modes

Add workflow and sequence first, then data-flow and lifecycle if demanded. These modes enter through `user-authored` provenance and reuse the viewer; they do not pretend to be Sonde-derived. Only after this is stable should export formats, animation, presentation, or share cards be considered.

## Build, adapt, or depend on Archify?

Recommended: learn from and interoperate with Archify during prototyping, but build a smaller Sonde-native renderer/viewer around Sonde's IR.

- Depending on Archify would provide polished output quickly, but Sonde would inherit a very large capability/quality surface and an agent-authored evidence model that is weaker than its own graph.
- Forking Archify is legally possible under MIT if notices are preserved, but would create a substantial synchronization and maintenance burden inside an Apache-2.0 project.
- A small native viewer preserves Sonde's differentiated semantics, packaging, security boundary, and determinism. Specific MIT-licensed utility code could still be adapted with attribution if an implementation review finds it clearly cheaper than rewriting.
- Optional export to Archify JSON can remain a useful compatibility path for users who want Archify's richer presentation/export suite.

## Sources inspected

- Archify repository and README: https://github.com/tt-a1i/archify
- Archify skill contract: https://github.com/tt-a1i/archify/blob/main/archify/SKILL.md
- Archify schema documentation: https://github.com/tt-a1i/archify/blob/main/archify/schemas/README.md
- Archify repository-authoring rules: https://github.com/tt-a1i/archify/blob/main/archify/references/repository-authoring.md
- Archify viewer-runtime contract: https://github.com/tt-a1i/archify/blob/main/archify/references/viewer-runtime.md
- Archify delivery contract: https://github.com/tt-a1i/archify/blob/main/archify/references/delivery-contract.md
- Archify product/design principles: https://github.com/tt-a1i/archify/blob/main/PRODUCT.md and https://github.com/tt-a1i/archify/blob/main/DESIGN.md
- Archify architecture renderer: https://github.com/tt-a1i/archify/blob/main/archify/renderers/architecture/render-architecture.mjs
- Archify repository evidence verifier: https://github.com/tt-a1i/archify/blob/main/archify/renderers/shared/repository-evidence.mjs
- Archify live repository-backed example: https://tt-a1i.github.io/archify/cases/mco-runtime.architecture.html
- Sonde local design, implementation, README, generated architecture document, and current MCP/CLI surfaces in this workspace.

## Claude

A provenance note first, since it bears directly on this topic: `gh` and `WebFetch` were both unavailable to me for this repository this session, so I could not independently re-fetch Archify's source. What follows leans on two things I *did* verify myself — Sonde's actual code (`src/mcp/server.ts`, `src/doc/modules.ts`, `src/cli/main.ts`, `prd.md`, the design spec) — and Codex's already-landed section above for Archify's specifics (SKILL.md structure, schemas, renderer line counts, viewer-runtime contract). I have not independently confirmed those Archify details; treat them as Codex-sourced, not Claude-verified. That distinction — "I checked this myself" vs. "another agent reported this" — is exactly the provenance boundary this feature needs to enforce for its own output, so it seems right to hold myself to it here too.

### Bottom line

Agree with Codex's core shape: a native, deterministic Sonde compiler for repository-backed diagrams, plus an agent skill that authors the same IR for everything Sonde can't verify (systems, workflows, plans), with an explicit provenance tag distinguishing the two. Two places I'd push further than the existing write-up:

1. **This is a sequencing decision before it's a design decision.** Sonde's own PRD says this plainly, not as something to infer: "prioritize retrieval correctness and freshness over visualizations" (`prd.md:24`), "the product must remain useful without a graph visualization UI" (`prd.md:1000`), "Visualization is not required for MVP" (`prd.md:1297`). Interactive HTML diagrams are explicitly listed as out of scope alongside "IDE extensions and interactive graph visualization" (`prd.md:164`). None of that forbids building this now — but it means the question to answer first isn't "how should Sonde's diagram feature work," it's "what changed since that call was made." If the answer is "nothing, I just saw a cool repo," that's a reason to timebox Phase 0 hard and stop if it doesn't clearly pay for itself, not a reason to skip straight to Phase 1.

2. **A CLI-only `sonde map` is invisible to a whole class of Sonde's actual users.** Sonde's design is explicitly model-neutral and client-neutral, and ships exactly three MCP tools (`find_symbols`, `query_graph`, `get_impact_radius` — verified directly in `src/mcp/server.ts:85-185`) for agents that only have MCP access and no shell. Those agents can call `sonde doc` today only because someone with a terminal ran it and committed the Markdown. An HTML-producing CLI command has the same limitation: an MCP-only client literally cannot invoke it. I'd narrow Codex's "do not add another MCP tool initially" rule: don't add a tool that writes an HTML file — that is a legitimate reason to keep off the MCP surface — but *do* consider a read-only tool that returns the same deterministic IR JSON that `sonde map --stdout-spec` would produce (module nodes, tiered edges, omission counts, provenance block, no HTML). That's structurally identical to what `query_graph` already returns — an envelope around graph data — so it doesn't violate the "small, read-only surface" principle, it extends it by one data shape. An MCP-only agent still can't render the HTML itself, but it can at least get the verified structure and describe it, which is strictly better than falling back to grep because the one tool that has the answer requires a terminal it doesn't have.

### What I'd keep unchanged from the existing write-up

The provenance-tagged IR, the ban on inventing edges or promoting HEURISTIC to look resolved, deterministic layered layout instead of agent-authored coordinates for repo-backed maps, atomic-write-plus-receipt delivery, and reusing `buildModuleGraph` as the shared projection feeding both Markdown and the diagram IR rather than parsing Sonde's own Mermaid output back into a graph. These all follow directly from invariants already in `AGENTS.md` (never fabricate an edge, tier beats score, extraction is pure, degrade with a warning) rather than being new judgment calls, so there isn't much to independently relitigate — they're correct, and any plan should treat them as fixed constraints, not options.

One concrete thing worth adding to the correctness gates: `buildModuleGraph`'s own ranking logic (`src/doc/modules.ts:239-245`) carries a hard-won lesson that the diagram compiler must inherit, not just reference — Sonde's TypeScript and Swift adapters once manufactured 62 fake "references" between two unrelated modules purely because they share filenames like `parser.ts`/`references.ts` and therefore share function names. `resolvedOf` (COMPILER + LEXICAL only, HEURISTIC excluded from ranking) is what prevents that from reaching a human. Any diagram layout or edge-thickness heuristic downstream of this data must preserve that exclusion — it would be easy for a "make busier edges thicker" layout rule to accidentally reintroduce HEURISTIC volume as a visual signal of importance.

### On build-vs-fork

Agree with "learn from, don't depend on, don't fork." One addition: Sonde is Apache-2.0 (verified in `package.json:42`) and Archify is reported MIT by Codex's research. A fork is legally fine either direction, but even the lighter "learn from Archify's docs" approach carries a smaller, easy-to-miss risk: closely paraphrasing Archify's `SKILL.md` wording when writing Sonde's own skill file. The useful IP here is the *pattern* (typed IR seam, fail-closed validation, provenance modes) — that should be reimplemented from the verified facts in this doc, not drafted by rephrasing Archify's actual prose, even with attribution. Cleaner to write Sonde's skill file from this brainstorm doc and Sonde's own invariants, never with Archify's text open as a template.

### Phase 0, concretely

Given point 1 above, I'd make Phase 0 answer a falsifiable question rather than just "build a spike": does a module-level HTML map, generated from Sonde's existing `buildModuleGraph` output on Sonde's own repository, surface something a developer couldn't get from `sonde doc`'s Markdown table in under a minute? If the honest answer after the spike is "not really, the Markdown already told me what I needed," that's a legitimate outcome — it means the PRD's original call to defer visualization was right, and the next-highest-value Sonde work is probably something the backlog already has, not three more phases of a renderer.
