# Sonde v0.1 — Design

**Status:** Approved for planning
**Date:** 2026-08-16
**Revision:** 4 (revised after implementing and measuring the opt-in compiler tier; see §17 for the changelog)
**Supersedes for v0.1 scope:** `prd.md` (the PRD remains the long-range vision; this document defines what gets built first)

---

## 1. Purpose of this document

`prd.md` describes a large product: roughly 100 functional requirements, eight MCP tools, multi-language adapters, hybrid retrieval, and a separate activity-analytics subsystem. It is a good vision document and a poor build target.

This spec defines **Sonde v0.1** — the smallest system that proves the thesis, can be verified mechanically, and is worth an OSS release. Everything else in the PRD stays in the PRD.

---

## 2. Context: what we learned before writing this

A mature third-party tool in exactly this category — `code-review-graph`, published on PyPI — was installed on the author's machine. It shipped everything this PRD aspires to: symbol graph at `schema_version 9`, FTS5, embeddings, communities, flows, risk index, wiki generation, multi-repo registry, dead-code detection, and an MCP surface whose tool names match PRD §10 almost exactly.

It was wired in aggressively: a `PostToolUse` hook on every `Edit`/`Write`/`Bash`, a `SessionStart` hook, and a global `~/CLAUDE.md` instruction telling every agent, in bold, to **always** prefer its MCP tools over `Grep`/`Glob`/`Read`.

Its measured state at the time of writing:

| Repo | nodes | edges | embeddings | last indexed |
|---|---:|---:|---:|---|
| `repo-a` (Swift app) | 581 | 2823 | 0 | 2026-05-30 |
| `repo-b` (home directory) | 13 | 152 | 0 | 2026-04-17 |
| `repo-c` | 0 | 0 | 0 | never |
| `repo-d` | 0 | 0 | 0 | 2026-04-18 |
| `repo-e` | 0 | 0 | 0 | never |

Repository names are anonymised; they were private projects. Nothing in the
argument depends on which they were — the evidence is that four of five indexes
were empty and enrichment had never run in any of them.

The MCP server still functioned. The CLI shim the hooks invoked was never on `PATH`, so **every refresh hook exited 127 on every tool call, from installation onward**, while the global instruction kept directing agents to the resulting empty indexes.

### 2.1 What this does and does not prove

**It proves:** silent failure is fatal. The hooks failed from day one, nothing surfaced it, and months passed with agents instructed to trust empty indexes. This drives §8 (freshness must be self-verifying and drift must be reported) and the rule that degraded modes are always visible in the envelope.

**It also suggests:** breadth hid the decay. With twenty tools and six subsystems, nothing obviously pointed at "your index is empty." A small surface plus an explicit drift report makes the same failure loud.

**It does not prove anything about enrichment.** The `embeddings`, `communities`, and `flows` tables were empty because the install was broken, not because they were tried and found wanting. Their value was never observed in either direction.

Embeddings and semantic retrieval are therefore **deferred for time, not rejected on evidence** (§13). To keep that decision falsifiable, the benchmark (§10, Layer 3) must include at least two task classes where lexical + structural retrieval is *expected to lose* to semantic retrieval — a behavioural-description query with no identifier overlap, and a synonym-heavy domain query. If v0.1 loses those, embeddings move up the roadmap on evidence.

### 2.2 Embeddings: the falsification fired, then the remedy failed

Spec §2.1 deferred embeddings for time and demanded falsifying tasks. Those
tasks failed as predicted, so the deferral was tested and local semantic
retrieval was built (`src/enrich/`, `sonde embed`). It does not close the
gap, and the capability is deliberately **not** wired into `find_symbols`.

Measured on the large fixture, query *"where does this library decide which
routing strategy to use at runtime?"* whose answer is `SmartRouter`:

| Model | Document | Result |
|---|---|---|
| all-MiniLM-L6-v2 | name + path + signature | `SmartRouter` ranks **147th** of 9,031 |
| all-MiniLM-L6-v2 | source body | `SmartRouter` 0.281 < `TrieRouter` 0.285 |
| jina-embeddings-v2-base-code | source body | `LinearRouter` 0.623 > `SmartRouter` 0.563 |
| jina-embeddings-v2-base-code | name + path + signature | `SmartRouter` 4th of 5 routers |

Two very different models, four configurations, and the wrong router on top in
three of them. The five routers are near-identical in surface form, and the
fact that distinguishes `SmartRouter` — it holds the others and delegates — is
a *structural* property, not a lexical one. Embedding similarity cannot see it.

**Scope of this claim.** One task, one corpus. It does not show embeddings are
useless; a query whose answer has distinctive vocabulary may well work. It does
show that swapping in a semantic retriever is not a general remedy for the
task class, and that the roadmap should not assume otherwise.

**Structural-role follow-up.** A blind probe then tested whether reusable graph
patterns could answer this task class without fitting queries to known symbols.
The protocol and thresholds were committed before querying, five behavioural
questions about the same Hono fixture were authored separately from the
implementer, and predictions were committed before the answer key was opened.
Structural queries found 2 of 5 answers in the top three (40%):
`Hono.handleError` and `HonoRequest`, both at rank 2. They missed `compose`,
`Context`, and `notFoundHandler`. The one query shape reused across two questions
accounted for only one hit, so no shape generalised to two hits.

The fixed protocol classifies 30-59% as **INCONCLUSIVE**. No structural-role
feature is built from this result, and the behavioural-query gap remains
unsolved for v0.1. The full auditable record, including failed queries, is in
`probes/structural-roles/`.

*(That installation was fully removed on 2026-08-16 — hooks, MCP registrations, generated skill, global instruction file, and all six per-repo data directories.)*

---

## 3. Decisions

### 3.0 The claim, corrected by measurement

The PRD opens by promising context a text search cannot reach. **The benchmark
does not support that promise and it has been withdrawn.** On a real
19,409-line repository a competent agentic search loop scored 1.000 recall on
every task — the same structural evidence Sonde returns.

What the measurements do support:

| Structural tasks, large fixture | Sonde | Agentic search |
|---|---:|---:|
| Recall | 1.00 | 1.00 |
| Tool calls | **1.0** | 8.0 |
| Context tokens | **1,262** | 3,621 |
| Latency | **263 ms** | 38,602 ms |
| Budget overruns | **0/6** | 3/6 |

So the product is a **cost and determinism** play, not a reach play: the same
answers, ~3× less context, ~8× fewer calls, ~147× faster, and never outside the
caller's budget because the packer truncates to it by construction. PRD §8.1's
positioning statement should be read as superseded by this section.

This matters beyond marketing copy. A reach claim would justify building more
retrieval surface; a cost claim justifies making the existing surface cheaper,
faster, and more predictable — and it makes latency and budget compliance
first-class metrics rather than footnotes.


| Decision | Choice | Rationale |
|---|---|---|
| Success criterion | An OSS project others adopt | Sets language, distribution, and benchmark priorities |
| Adoption wedge | Swift (v0.2) | Underserved; Serena's Swift is experimental, Aider's repomap is weak on it |
| Verification substrate | TypeScript (v0.1) | `tsc` provides a mechanical oracle; Linux CI; fast iteration; abundant fixtures |
| Extraction | Tree-sitter core + optional compiler resolution | Zero-setup install, precision when a toolchain is present, tiers record which |
| MCP surface | 3 tools | PRD §23 Risk 5: a large surface burns prompt space and confuses agents |
| Activity ledger | **Moved to AgentDock** | Different durability class; AgentDock already owns sessions and an event ledger |
| Implementation language | TypeScript | First-class MCP SDK, `npx` distribution, TS compiler API is native |
| Index location | User cache dir, keyed by canonical root hash | Derived and disposable; must never pollute or be committed to the repo |
| Tokenizer | `o200k_base` via `js-tiktoken` | Closes PRD §25. Always reported as `estimated`; see §7.5 |

### 3.1 Why the ledger moved

The activity ledger (PRD §20, FR-090–100) is removed from Sonde scope and reassigned to AgentDock (`~/agentdock`, shipping as `whyline`).

- **Durability class differs.** Sonde's index is derived and disposable — delete it, rebuild from source, lose nothing. AgentDock's ledger is authored and irreplaceable. Opposite backup, privacy, and commit policies; merging guarantees one is always wrong.
- **AgentDock already owns the substrate.** `src/whyline/events.py` and `ledger.py` exist. `.whyline/ledger.jsonl` already emits `SessionStarted` with session UUID, agent, and timestamp.
- **The join key already exists.** `hook_entry.py:27` reads `payload["session_id"]` — the same UUID that names Claude Code's transcript file at `~/.claude/projects/<slug>/<session-id>.jsonl`.
- **§20 is the only PRD section** that never mentions a symbol, an edge, or a line of source.

**Measurement principle, recorded for AgentDock:** measure with code, narrate with agents. An agent cannot observe its own token usage, so any agent-written numeric ledger is fiction. Agents may supply task titles and outcome notes; nothing numeric.

---

## 4. Architecture

```
DISCOVER   root → ignore rules → candidate files → content hashes
    ↓
EXTRACT    (path, bytes) → { symbols, references, imports, exports }   ← per-file, PURE
    ↓                                                                     parallel, cacheable
LINK       module specifiers → file paths;  export-map fixpoint         ← cross-file, no types
    ↓
RESOLVE    references + link tables + symbol table → edges              ← tiered by evidence
    ↓                                                    (optional tsc upgrade pass)
STORE      SQLite: symbols, edges, external_refs, unresolved_refs, FTS5
    ↓
QUERY      find / traverse / impact → ranked results
    ↓
PACK       drift check → re-verify source → budgeted evidence + envelope
```

The four-phase split (rather than three) is deliberate: **LINK is where TypeScript's module system is handled, and it needs no type information.** Collapsing it into RESOLVE was the single largest omission in revision 1.

### 4.1 EXTRACT is per-file and pure

The load-bearing constraint. An adapter's extract function takes a path and bytes and returns symbols, unresolved references, and the file's import/export tables. No global state, no database access, no cross-file lookups.

This buys parallelism, content-hash caching, golden-file testability, and an adapter contract small enough to make the Swift adapter tractable in v0.2.

**What purity does *not* buy:** correct cross-file edges. Those require LINK and RESOLVE, which are explicitly not pure and not per-file.

### 4.2 LINK resolves the module graph

Two jobs, both type-free and both mandatory:

**1. Module specifier → file path.** Owned by the `tsconfig` module (§5). Must handle:

- `tsconfig.json` `baseUrl`, `paths`, and `extends` chains
- Extension resolution order: `.ts`, `.tsx`, `.d.ts`, `.js`, then `<dir>/index.*`
- Under `moduleResolution: node16`/`nodenext`/`bundler`, a `./x.js` specifier resolves to `x.ts`
- `package.json` `exports` maps for workspace-internal packages
- Unresolvable specifiers → the import is recorded as `EXTERNAL` (§4.4), never dropped

`node_modules` is excluded from *indexing* (FR-005) but **must remain readable as resolution input** — `tsconfig` `extends` a published config, and `paths` resolution reads package layout. This distinction is easy to get wrong and must be enforced by a test.

**2. Export-map fixpoint.** `export * from './a'`, `export { x } from './b'`, and `export { default as y } from './c'` mean a module's export set is not knowable from its own text. Computing it requires a fixpoint over the module graph, and barrel files routinely form import cycles, so the algorithm must be cycle-safe (iterate to stability with a visited set; on a cycle, take the union of what is known and mark the residual `EXTERNAL`).

Skipping this makes every barrel-mediated import degrade to bare name matching — and barrels are exactly where name collisions cluster, so quality would be worst where volume is highest.

### 4.3 RESOLVE assigns evidence tiers

For each reference: consult the file's import table, then the linked export map, then the global symbol table. Classify by **how the target was determined**, not by how confident it feels:

| Tier | Meaning | Trust |
|---|---|---|
| `COMPILER` | The TypeScript compiler resolved it | Exact |
| `LEXICAL` | Unqualified identifier resolved through lexical scope and the import table — no type inference required | Reliable |
| `HEURISTIC` | Member access (`x.foo()`) or otherwise ambiguous; `candidate_count` recorded | Suggestive |
| `EXTERNAL` | Target resolved to outside the indexed repo (§4.4) | Exact, but out of scope |
| `UNRESOLVED` | Genuinely unplaceable; `reason` recorded | Unknown |

**The critical correction from revision 1:** member-access calls (`x.foo()`) are **never** `LEXICAL`. Given `x.foo()` where exactly one `foo` is visible in the file, revision 1 classed that as resolved-and-certain. But `x` could be any of a dozen types with a `foo` method. That is the canonical tree-sitter call-graph failure, and tiering it as compiler-grade truth would have quietly poisoned every downstream claim. Without types, member access is `HEURISTIC`. Always.

**Ambiguity cap (added revision 3).** A reference resolving to more than
`AMBIGUITY_CAP` (8) candidates produces **no edges** and one `UNRESOLVED` record
with `reason: "too_ambiguous"` and the candidate count.

This was found by benchmarking against a real 19k-line repository, where the
198-line fixture had hidden it completely. Emitting one edge per candidate
produced 354,291 edges from 9,031 symbols — 73% of the graph was heuristic
noise, and the symbol `get` drew 1,338 inbound edges because every `.get()` call
in the repository linked to every symbol named `get`. An edge with confidence
1/1338 is not evidence; asserting those relationships violates the spirit of
invariant 1 even though each edge is honestly tiered. The cap reduced the graph
to 44,107 edges (an 88% reduction) with no loss on resolvable queries.

The cap is about evidence quality, not syntax: it applies to any heuristic
resolution, not only member access. Applying it to member access alone left
type-position references — which carry no receiver — uncapped.

**The trade-off is deliberate and visible.** On the zero-setup tree-sitter path,
`callers_of` on a common method name returns zero edges and a non-zero unresolved
count rather than a thousand weak ones. Without type inference, member-access
resolution on common names is not solvable; the cap makes that gap legible
instead of papering over it.

The opt-in compiler pass closes part of that gap with exact edges rather than
relaxing the cap. Measured on Hono v4.6.3, `callers_of Hono.route` changed from
zero graph results and 53 unresolved `route` references to eight `COMPILER`
callers and 44 unresolved references. Default indexing took 3.58 s;
`--resolve` took 13.70 s. The cost and remaining unresolved evidence are both
reported rather than hidden.

Sort order is `COMPILER > LEXICAL > HEURISTIC`. Tier is always the primary sort key; `confidence` is a tiebreaker within `HEURISTIC` only (§6.3).

### 4.4 `EXTERNAL` is a first-class outcome

With `node_modules` and `lib.d.ts` excluded from indexing, references to `console.log`, `Promise`, `React.useState`, and every third-party symbol have no in-repo target. Revision 1 sent all of these to `unresolved_ref`.

That was fatal to the differentiator. In a typical application those references are the *majority*, so the "unresolved count" — which §7.3 requires as a completeness caveat — would be permanently enormous and permanently uninformative. Agents would learn to ignore it within two calls, which is precisely the decay mode §2 exists to prevent.

`EXTERNAL` references are stored in their own table with the resolved package or lib name, are excluded from unresolved counts, and are never traversed. The `unresolved` count then means what it claims: *we saw a reference and genuinely could not place it.*

---

## 5. Components

| Module | Responsibility |
|---|---|
| `repo` | Root canonicalization, `.gitignore` + `.sondeignore`, git state, file discovery. **The security boundary** (SEC-001/002/003) lives here and nowhere else. |
| `tsconfig` | `tsconfig` discovery, `extends` chains, `paths`/`baseUrl`, module specifier resolution. Owns all filesystem probing for module resolution. |
| `store` | SQLite schema, migrations, transactions, FTS5, WAL and concurrency (§9.1). Data access only. |
| `adapters/` | `LanguageAdapter` interface + `typescript/`. Pure per-file extraction. |
| `link` | Export-map fixpoint, import-table construction. Cycle-safe. |
| `resolve` | Global symbol table, tier assignment, `EXTERNAL` classification. Optional `tsResolver` upgrade pass. |
| `index` | Orchestration: discover → hash → diff → extract → link → resolve → commit. |
| `query` | Three engines: find, traverse, impact. Plus ranking (§7.4). |
| `pack` | Drift check, read-time source verification, token budgeting, envelope construction. |
| `mcp` | Three tools, schemas, envelope. Thin. |
| `cli` | `index / update / status / search / query / impact / doctor / clean / mcp serve` |
| `bench` | Oracle generation, task runner, metrics. Ships in-repo. |

### 5.1 Stack

- **TypeScript** — first-class MCP SDK, `npx` distribution
- **`web-tree-sitter` (WASM)** — no native compilation; a meaningful adoption unlock
- **`better-sqlite3`** — guaranteed FTS5, prebuilt binaries
- **Bundled `typescript`** — for the optional resolution upgrade pass; see §5.3
- **`js-tiktoken`** — token estimation (§7.5)

Distribution target: `npx sonde`, no install step, no account.

### 5.2 The adapter contract

```ts
interface LanguageAdapter {
  readonly language: string;
  readonly extractorVersion: string;
  matches(path: string): boolean;
  extract(path: string, bytes: Uint8Array): ExtractResult;  // pure
}

interface ExtractResult {
  symbols:    SymbolRecord[];
  references: ReferenceRecord[];   // unresolved by construction
  imports:    ImportRecord[];      // localName → (specifier, importedName), incl. aliases + default
  exports:    ExportRecord[];      // named, default, and re-export directives (`export * from`)
  diagnostics: Diagnostic[];
}
```

`imports` and `exports` were absent in revision 1, which left the resolver with no input for any cross-file work. Resolution remains deliberately **outside** this interface: adapters may supply an optional resolver, but the default LINK/RESOLVE algorithm is shared.

### 5.3 The compiler pass must not execute repository code

SEC-008 forbids executing repository code during indexing. Loading the repo's own `node_modules/typescript` to gain version fidelity would do exactly that.

**Decision:** Sonde bundles its own `typescript` and never `require`s one from the target repository. The consequence — resolution may differ from the repo's pinned TS version — is accepted and disclosed: the tsc version is reported in `doctor`, in every envelope where the upgrade pass ran, and in the published oracle report (§12).

---

## 6. Data model

- **`repository`** — `root_hash`, `head_revision`, `schema_version`, `extractor_manifest_hash`, `indexed_at`
- **`file`** — `path`, `language`, `content_hash`, `mtime`, `size`, `parse_state`, `diagnostics`, `indexed_at`
- **`symbol`** — `stable_key`, `file_id`, `qualified_name`, `short_name`, `kind`, `signature`, byte and line ranges, `body_hash`, `exported`, `is_test`
- **`edge`** — `src`, `dst`, `kind`, `tier`, `confidence`, `site_line`, `extractor_version`
- **`external_ref`** — `src`, `name`, `package_or_lib`, `site_line`
- **`unresolved_ref`** — `src`, `name`, `kind`, `site_line`, `candidate_count`, `reason`
- **`symbol_fts`** — FTS5 over short name, qualified name, signature, doc

`mtime` and `size` are stored specifically to make the drift check in §8.2 cheap.

### 6.1 Edge kinds

`CONTAINS`, `IMPORTS`, `CALLS`, `REFERENCES`, `IMPLEMENTS`, `INHERITS`, `TESTS`

Reconciliation with PRD FR-020: `DEFINES` is subsumed by `CONTAINS` (a file contains a symbol; a class contains a method — one relation, one direction). `INHERITS` retains the PRD's name; revision 1 silently renamed it `EXTENDS`, which also made the query name ambiguous about direction (§7.2).

**`CALLS` target semantics — the declaration, not the runtime candidates.** Given `interface Handler { handle() }` with 30 implementors and a call site `h.handle()`, Sonde emits **one** `CALLS` edge to `Handler.handle`. Runtime candidates are recovered at query time by fanning out over `IMPLEMENTS`/`INHERITS`, and that fan-out is labelled as inference rather than baked into the graph.

Rationale: it matches what `tsc` answers, which is what makes the oracle (§10) measurable at all; it keeps edge count linear instead of quadratic in implementors; and it keeps the "what actually runs" inference explicit and inspectable.

**`CALLS` ⊂ `REFERENCES`.** Every call site is also a reference. `references_to` returns the union; `callers_of` returns only call syntax. They are stored once, with `CALLS` implying `REFERENCES` at query time — never double-counted.

**Callback passing.** `arr.map(handler)` passes a function without call syntax. This emits a `REFERENCES` edge, not `CALLS`. Documented explicitly because it means `callers_of` under-reports on functional-style code, and that limitation belongs in the tool description rather than in a surprised user's bug report.

### 6.2 Symbol identity

**`stable_key` = `{lang}:{relpath}#{scope_chain}` — never line-based.**

`scope_chain` is the dotted chain of *named* enclosing symbols, e.g. `AuthService.refresh`. Rules:

| Case | Rule |
|---|---|
| `const foo = () => {}` | Minted as a symbol, `kind: "function"`. A name binding exists, so identity is stable. |
| Anonymous callbacks: `arr.map(x => …)`, `useEffect(() => …)` | **Not minted as symbols.** References inside them attribute to the nearest *named* enclosing symbol. This avoids positional keys, which §6.2 forbids. |
| `export default class {}` | `#default`. Local import aliases do not affect the key. |
| Overloads | Key gains a suffix `~{sighash8}` — the first 8 hex chars of a hash of the normalized signature — applied **only** when more than one symbol shares a scope chain. Restores PRD §12.3's "normalized signature" requirement. |
| Generics | Type parameters are stripped for the scope chain; retained in `signature`. `foo<T>` and `foo` are one symbol. |
| Residual collisions | Deterministic `~{n}` by source order, plus a diagnostic. Never a UNIQUE violation, never a silent overwrite. |

**`kind` vocabulary** (a public contract agents filter on): `file`, `module`, `class`, `interface`, `type`, `enum`, `function`, `method`, `property`, `variable`, `test`.

**Renames are an explicit v0.1 non-goal.** `relpath` is part of the key, so renaming a file invalidates every key in it. PRD §13.3's rename inference is deferred. Documented so agents do not cache `stable_key` across renames.

### 6.3 `tier` vs `confidence`

Not redundant. `tier` is categorical provenance (§4.3). `confidence` is a numeric score meaningful **only within `HEURISTIC`**, computed as `1 / candidate_count` after import-scope narrowing. `COMPILER` and `LEXICAL` edges always carry `confidence = 1.0`.

Ranking must never let a high-confidence heuristic edge outrank a lexically- or compiler-resolved one. Tier is the primary sort key; `confidence` breaks ties within a tier.

### 6.4 `TESTS` edges

A symbol is `is_test` by adapter heuristics (path patterns such as `*.test.ts`, `__tests__/`, and enclosing `describe`/`it`/`test` calls). A `TESTS` edge is emitted from a test symbol to non-test symbols it references **directly** — references arriving through a barrel re-export are excluded, since a test importing a barrel would otherwise link to the entire module.

Fan-out is capped at 25 targets per test symbol, ranked by reference count then proximity; the cap is reported when it binds.

`TESTS` edges are **always `HEURISTIC`**. A test referencing a symbol is evidence of relatedness, never proof of coverage, and every surface exposing them must say so (PRD §7.6).

---

## 7. MCP tools

### 7.1 `find_symbols`

Seed retrieval. Exact qualified name → exact short name → FTS5/BM25 over name, signature, and doc.

```json
{
  "query": "refresh expired session",
  "kinds": ["function", "method", "class"],
  "paths": ["src/"],
  "limit": 20,
  "include_external": false
}
```

Returns `stable_key`, path, line range, kind, signature, and a selection reason. **No source bodies** — signatures only, keeping the tool cheap. Ranking: exact qualified match, then exact short name, then BM25, with a path-focus boost.

### 7.2 `query_graph`

The reverse queries text search cannot answer.

Patterns: `callers_of`, `callees_of`, `references_to`, `imports_of`, `imported_by`, `implementations_of`, `inheritors_of` (downward: who extends X), `inherits_from` (upward: what X extends), `tests_for`, `contained_by`, `contains`

Revision 1 had a single ambiguous `extends_of`. Both directions are needed and are now named unambiguously.

Output shape is the point:

```json
{
  "compiler":   [],
  "lexical":    [],
  "heuristic":  [],
  "external":   { "count": 12 },
  "unresolved": { "count": 2, "names": ["refresh", "handle"] },
  "truncated":  false
}
```

Not a flat list. An agent reading this knows what was found, how it was determined, and what could not be placed.

### 7.3 `get_impact_radius`

The headline workflow. Reverse-traverses `CALLS`, `REFERENCES`, `IMPLEMENTS`, **and `INHERITS`** from the target symbols, attaches `TESTS` edges, and packs to a token budget.

`INHERITS` was missing from revision 1's traversal, which meant changing a base class would not surface its subclasses — a concrete defect in the headline tool.

Accepts `from_git_diff: true`, which absorbs `detect_changes` without adding a fourth tool.

**Must always** state that structural test edges do not prove coverage, and surface the unresolved count (now meaningful, per §4.4) as a completeness caveat.

### 7.4 Ranking

Revision 1 specified "distance × confidence × exported × fan-in", which is dimensionally invalid — it multiplies a quantity you want small by an unbounded count, so a 500-caller utility would top every result set and *farther* results would rank higher.

Replaced with an additive weighted sum over normalized features, applied **within** a tier:

```
score = 0.40 · 1/(1 + distance)
      + 0.25 · min(1, log(1 + fan_in) / log(1 + FAN_IN_P95))
      + 0.20 · exported
      + 0.15 · path_focus_match
```

`FAN_IN_P95` is computed per repository at index time. Weights are constants in v0.1, tuned against the benchmark, and reported by `--explain`.

### 7.5 Token budgeting

Tokenizer: `o200k_base` via `js-tiktoken`. Counts are **always** reported as `estimated`, with a documented tolerance of ±10% against the actual client tokenizer (closing PRD §25 and making FR-063 implementable).

Allocation order under budget: (1) envelope and provenance — reserved first, never truncated; (2) seed symbol bodies; (3) related signatures; (4) tests; (5) supplementary neighbours. Complete symbol bodies are preferred; when one does not fit, a marked excerpt is returned with `partial_body: true` (FR-064). Overlapping ranges are merged before counting (FR-045).

### 7.6 Response envelope

```
schema_version · repository{root_hash, revision, dirty}
freshness{state, indexed_at, drift_count, verified[]}
summary · results[] · warnings[]
diagnostics{truncated, omitted_count, estimated_tokens, tsc_version|null}
```

MCP tools are read-only **with respect to the repository** (SEC-010). They do write to the index on the refresh path (§8.3); that is not a repository mutation, and §9.1 covers the concurrency it implies.

---

## 8. Freshness

This section exists because of §2, and revision 1 got it wrong in a way worth stating plainly.

### 8.1 Two guarantees, not one

Revision 1 claimed "the index can be arbitrarily stale and the tool still never lies." That conflates two different guarantees, and read-time verification delivers only the first.

| | Guarantee | Mechanism | Status |
|---|---|---|---|
| **A** | Returned bytes match disk | Read-time hash + re-read | **Absolute** |
| **B** | Returned edges reflect current source | Requires knowing about files *not* in the result set | **Not free** |

The decisive argument for B: **you cannot detect a missing result by verifying the results you have.** A `callers_of(X)` query returning five verified callers never stats the sixth file that added a call five minutes ago. For an impact tool, a false negative — "nothing breaks" — is the worst possible failure.

Sonde's claim is therefore narrowed to what it can actually deliver:

> **Never returns stale bytes, and always reports structural drift.**

### 8.2 Repo-level drift check

On every tool call, before answering: `stat` every indexed file and compare `mtime` and `size` against the stored values. Hash only the mismatches. This is cheap — a syscall per file, no reads — and bounded well under the PRD §17.1 latency targets.

- **drift = 0** → `fresh`
- **drift ≤ AUTO_REFRESH_LIMIT** (default 25 files) → re-extract, re-link, and re-resolve the affected subgraph, then answer → `refreshed`
- **drift > limit** → answer from the existing index, state `partial`, and report `drift_count` plus the command to reindex

Untracked new files count toward drift. A `partial` answer is never presented as complete.

### 8.3 Edge lifecycle on re-extraction

Revision 1 said "re-extract that one file and update the store," which left two failure modes undefined:

- **Symbol deleted.** Inbound edges are not cascade-deleted (that would silently under-report). They are **demoted to `unresolved_ref`** with `reason: "target_removed"`, so the loss is visible in the unresolved count.
- **Symbol added.** All `unresolved_ref` rows whose `name` matches a newly-appeared symbol are **re-attempted** within the refresh transaction. Without this, `callers_of(newSymbol)` would return empty and be labelled `refreshed`.

### 8.4 Tier downgrade is disclosed

The `COMPILER` tier requires a `tsc` `Program`. Building one for a single-file inline refresh costs seconds, and keeping one warm for a 100k-line repo would breach PRD §17.1's 300 MB idle-memory cap.

**Decision:** the inline refresh path does **not** run the compiler. Edges for a refreshed file are re-derived at `LEXICAL`/`HEURISTIC` tiers, and the envelope carries an explicit warning that affected edges were downgraded pending a full `sonde update`. The tier system makes this honest rather than invisible — which is the entire reason it exists.

### 8.5 States

`fresh` · `refreshed` · `partial` (drift over the auto-refresh limit, or a file failed to parse) · `stale` (a requested file is unreadable; metadata returned, never a cached body) · `unknown` (no index, or a schema-version mismatch)

`sonde status` reports drift and tier distribution, so decay is visible rather than silent.

---

## 9. Error handling

| Failure | Behavior |
|---|---|
| One file fails to parse | Record `parse_state=failed` + diagnostics, drop its symbols, **keep indexing**. Inbound edges → `unresolved_ref`, `reason: "parse_failed"`. Freshness becomes `partial`. (FR-014) |
| No `tsconfig` / compiler pass unavailable | Skip the upgrade. Cross-file edges cap at `LEXICAL`/`HEURISTIC`. `doctor` reports it; **every envelope warns**. Degraded, not broken. |
| Module specifier unresolvable | Recorded as `EXTERNAL` with the raw specifier. Never dropped, never guessed. |
| Index interrupted | Batched transactions — previous valid index or a resumable state, never a half-written graph. (FR-031) |
| Schema version mismatch | Refuse to read; freshness `unknown`; instruct rebuild. Never guess. |
| `extractor_manifest_hash` change | A grammar or extractor-version bump forces a full rebuild. Incremental reuse across extractor versions is not sound. |
| Traversal blowup | Bounded by depth, result count, node budget, wall clock. Cycle-safe visited set. (SEC-012) |
| Path escape / symlink out of root | Rejected at the `repo` boundary. (SEC-002) |

**Principle:** degrade with a warning, never fail silently, never fabricate.

### 9.1 Concurrency

SQLite in WAL mode, `busy_timeout` 5s. One writer at a time. The MCP server's refresh path (§8.2) takes a write transaction; a concurrent `sonde index` will block it, and on timeout the server answers from the existing index with `partial` rather than failing. Two MCP clients on one index are safe under WAL. The index is per-canonical-root, so worktrees of the same repo get separate indexes.

---

## 10. Testing

### Layer 1 — Golden extraction

`fixture.ts` → expected `{symbols, references, imports, exports}` JSON. Per-file purity makes this nearly free. Catches grammar and query regressions on every commit.

### Layer 2 — Oracle differential testing

The oracle measures the **tree-sitter resolution path only**: the zero-setup
default, and the only tier whose accuracy is in question. `COMPILER` edges come
from the TypeScript compiler itself, so scoring them against that same compiler
would measure nothing; they are exact by construction and excluded from the
accuracy figures.

Run TypeScript's language service over a fixture repo to obtain ground-truth
references and call sites. Run Sonde's default path over the same repo.
Diff. Emit precision and recall **per edge kind, split by tree-sitter tier**.

Four things make this non-trivial, and all four must be built before the numbers mean anything:

1. **Scope filtering.** `tsc` resolves into `node_modules` and `lib.d.ts`; Sonde deliberately does not. The oracle must be filtered to in-repo targets, or recall is crushed by references Sonde should never have had.
2. **Granularity mapping.** `tsc` returns identifier *positions*; Sonde stores symbol→symbol pairs. The mapper from positions to enclosing symbols must be built **independently, from `tsc`'s own AST ancestry**. Reusing Sonde's containment logic would produce correlated errors — the oracle would silently agree with the bug it exists to catch.
3. **Semantics agreement.** The oracle measures declaration-target resolution, matching §6.1. Settling `CALLS` semantics is a prerequisite, not a detail.
4. **Config pinning.** `tsc` answers vary with `paths`, `include`, `skipLibCheck`, and project references. Each fixture pins its config, and the config hash is recorded in the report.

**Expected, correct divergences** — documented, not fixed: type-only references, JSX intrinsics, `export =` / `import =`, decorators, declaration merging. The tree-sitter path will systematically miss these, and that is by design.

**CI gating:** on *deltas*, not absolute floors — no drop greater than 2 points versus the last release, per edge kind. Absolute thresholds would drive overfitting to `tsc`, which for a deliberately heuristic tier is the wrong objective. Absolute numbers are published (§12), not gated.

**Sequencing:** semantics (§6.1) → oracle → resolver. Revision 1 said "oracle before resolver," which was right but incomplete: it put the measurement before the definition being measured.

### Layer 3 — Benchmark harness

**12 tasks, adversarially selected and disclosed as such.** Revision 1 specified 30 drawn uniformly. Modern agentic search is genuinely good at "who calls `X`" in TypeScript, where names are near-unique and imports explicit — a uniform sample would show parity and invite the wrong conclusion.

Selection criteria, published with the results so the sampling bias is visible:

- Transitive impact at depth ≥ 2 (4 tasks)
- `implementations_of` across a wide interface (2 tasks)
- Completeness claims — "what did I miss" (2 tasks)
- Test selection for a change (2 tasks)
- **Semantic-disadvantage controls** (2 tasks): behavioural description with no identifier overlap, and a synonym-heavy domain query — the classes where v0.1 is *expected to lose* to embeddings, per §2.1

Baselines: (a) a strong agentic search loop — grep/glob/read with a competent agent, not naive grep; (b) Sonde. PRD §19.1's repository-map and competitor baselines are deferred to v0.2.

Metrics: required-evidence recall@k, input tokens, tool calls, wall-clock latency, **and tier-utility** — whether the compiler/lexical/heuristic/unresolved split changes agent behaviour at all. If the tiering is the thesis, it must be instrumented.

End-to-end task success is measured but reported as **preliminary**: model pinning, repetition counts, and the success judge are all still open in PRD §25, and one person cannot stabilize that variance for a v0.1 claim.

Fixture repos (small / medium / large, permissive licenses) are selected during planning.

---

## 11. The Swift spike (Phase 1)

A **throwaway** validation, not an adapter. Two parts, roughly two days total.

**Part A — extraction (half day).** Parse a slice of a real Swift application with tree-sitter Swift. Symbols and references only.

Pass criteria: protocol conformances and `extension` blocks are attributable to a declaring type from a single file's syntax alone; result builders and property wrappers do not prevent symbol-boundary detection; `ExtractResult` needs no Swift-specific fields.

**Part B — resolution, on paper (half day).** This is the part that matters, and revision 1 omitted it.

Swift's module-wide `internal` default means **there are no import statements to narrow candidates within a module.** §4.3's entire narrowing strategy — import table, then export map — has *zero signal* for same-module references. Part A would pass all three criteria while the architecture is in trouble.

Take 20 real references from that slice and work out, by hand, what §4.3 would produce with no import scope available. Record the tier distribution.

**Fail response:** if the answer is "everything is `HEURISTIC` with a large `candidate_count`," then Swift needs a module-scope substitute — SwiftPM target boundaries and file-level `fileprivate`/`private` narrowing — designed **before** the TypeScript adapter hardens around an import-centric assumption. That is why this runs in Phase 1 rather than v0.2.

The spike is deleted afterwards. Its output is a written finding, not code.

---

## 12. Definition of done — v0.1

1. `npx sonde index` works on a TypeScript repo with no install step
2. Three MCP tools verified in Claude Code **plus one other client** (PRD §21 Phase 2 exit)
3. Zero stale **bytes** and zero unreported **drift** across the eval suite (§8.1)
4. **Oracle report published in the README** — precision/recall per edge kind and tier, with `tsc` version and fixture configs, including unflattering numbers
5. 12-task benchmark against a strong agentic-search baseline, published with the adversarial selection criteria stated

Criterion 3 is worded deliberately. Revision 1 said "zero stale snippets," which §8's own mechanism makes structurally impossible — it would have measured nothing. The falsifiable claim is about drift reporting.

Item 4 remains the differentiator: no system in the PRD §8 competitive list publishes its own edge accuracy.

---

## 13. Out of scope for v0.1

Embeddings and semantic search (**deferred for time, not rejected** — §2.1) · communities · flows · architecture overview · `get_context_for_task` · review context packs · risk scoring · activity ledger · Swift adapter · Python adapter · watch mode · visualization · cross-repo graphs · rename inference (§6.2) · source editing via MCP

---

## 14. Risks

| Risk | Mitigation |
|---|---|
| Surface area outruns maintenance again | Three tools, one adapter, five dropped tables. Scope is the mitigation. |
| Heuristic edges too imprecise to trust | Oracle differential testing measures it before ship; tiers expose it rather than hide it. |
| A strong agentic baseline matches Sonde | The honest risk. Adversarial task selection tests where a graph *should* win; parity on those is a real negative result and a reason to stop. |
| Latency loses to ripgrep (~30 ms) | Drift check is stat-only; latency is a tracked benchmark metric, not an afterthought. |
| Oracle overfitting | Delta-gated CI, not absolute floors; independently-built position→symbol mapper. |
| Crowded category, no adoption | Swift wedge (v0.2); published accuracy numbers; `npx` friction removal. |
| Benchmark shows no improvement | A valid outcome, reached cheaply and early — by design. |

---

## 15. Traceability

**Implemented in v0.1:** FR-001–007, FR-010–014, FR-020–023, FR-030–035, FR-040–047, FR-060–066, FR-070–073, FR-080.

**Deferred:** FR-008/009, FR-015/016, FR-024–027, FR-036–038, FR-048–051, FR-067/068, FR-074–076, FR-083/084, and PRD §13.3 rename handling.

**Deferred with correction** — revision 1 claimed these as carried, but no section implemented them:

- **FR-081** (full query explanation: seed retrieval, expansion, ranking factors, exclusions, budget allocation) — v0.1 ships the CLI `--explain` flag only; the MCP envelope carries `summary`/`warnings`/`diagnostics`, not a structured explanation object. Full FR-081 is v0.2.
- **FR-082** (disable optional semantic stages) — vacuous in v0.1, which has none. Removed from the carried list rather than claimed.

**Removed from Sonde entirely:** FR-090–100 (moved to AgentDock).

---

## 16. Open questions for planning

1. Fixture repo selection (small / medium / large, permissive licenses)
2. `AUTO_REFRESH_LIMIT` default — 25 is a guess and should be set from measured refresh latency
3. Ranking weights in §7.4 — initial values are guesses, to be tuned against the benchmark

The compiler-pass default is no longer open: it is opt-in through
`sonde index --resolve` and `sonde update --resolve`. Default indexing
remains zero-setup and byte-for-byte unchanged in its tiering behavior.

---

## 17. Revision history

**Revision 4 (2026-08-23)** — after implementing and measuring the compiler
tier:

- **Optional `--resolve` pass implemented.** A bundled TypeScript Program maps
  declarations back to adapter-identical stable keys and promotes or inserts
  exact `COMPILER` edges after the deterministic index commits.
- **The ambiguity-cap gap was measured closed in part.** `Hono.route` now has
  eight compiler callers under `--resolve`, while 44 unresolved `route`
  references remain visible.
- **Compiler provenance is durable.** The bundled tsc version is reported by
  `doctor` and every envelope backed by a resolved index; inline refresh clears
  it and warns about the tier downgrade.
- **Oracle scope narrowed explicitly.** Accuracy figures cover the tree-sitter
  path only; comparing compiler-derived edges back to the same compiler is not
  an independent validation.

**Revision 2 (2026-08-16)** — after independent technical review. Material changes:

- **§8 rewritten.** Revision 1's "never lies" claim was false for edges. Split into two guarantees, narrowed the claim, added the repo-level drift check, defined edge lifecycle on re-extraction, and disclosed compiler-tier downgrade on inline refresh.
- **§4.2 LINK phase added.** Module specifier resolution and the export-map fixpoint were entirely absent; barrel files would have degraded every import to bare name matching.
- **§4.3 tiers restructured.** Member-access calls demoted out of the resolved tier — revision 1 would have laundered the canonical tree-sitter failure as compiler-grade truth.
- **§4.4 `EXTERNAL` added.** Without it, `console.log` and React flood the unresolved bucket and destroy the completeness signal the product rests on.
- **§5.2 `ExtractResult` extended** with import/export tables; the resolver previously had no input.
- **§6.1 `CALLS` semantics pinned** to declaration targets, making the oracle measurable. `CALLS ⊂ REFERENCES`. `INHERITS` restored.
- **§6.2 symbol identity specified** for arrows, anonymous callbacks, default exports, overloads, generics, and collisions.
- **§7.3** `INHERITS` added to impact traversal — base-class changes previously would not surface subclasses.
- **§7.4 ranking formula replaced**; the original was dimensionally invalid.
- **§7.5 tokenizer chosen**, closing PRD §25 and making FR-063 implementable.
- **§2.1** corrected an invalid inference: empty enrichment tables were evidence of a broken install, not of enrichment's value. Reframed as a time-boxed deferral with falsifying benchmark tasks.
- **§10 Layer 3** cut from 30 tasks to 12 adversarially-selected ones against a stronger baseline; tier-utility added as a metric.
- **§11** Swift spike gained Part B, the resolution paper exercise — the original could not answer its own question.
- **§15** stopped claiming FR-081/082 as implemented.

**Revision 3 (2026-08-23)** — after benchmarking against a real 19k-line
repository (Hono v4.6.3, MIT):

- **§4.3 ambiguity cap added.** Heuristic candidate fan-out produced 354,291
  edges from 9,031 symbols, 73% of them noise. Capped at 8 candidates; graph
  reduced 88% with no loss on resolvable queries.
- **`REFERENCES` extraction extended to type positions.** Type annotations,
  array element types, parameter and return types, and generic arguments were
  producing no edge at all, so `references_to` missed every type-only use.
- **Oracle scoring corrected.** It recorded call sites as both `CALLS` and
  `REFERENCES`, measuring against a storage model §6.1 explicitly rejects.
  Overall oracle recall 0.444 → 0.889.
- **Benchmark arms unified.** The Sonde arm required exact stable-key
  membership while the agentic arm substring-matched prose, so the two published
  columns were not comparable and favoured the verbose arm.
- **TSX grammar routed by extension.** `matches()` accepted `.tsx` while the
  parser only ever loaded the TypeScript grammar; 38 of 346 files failed to
  parse. Remaining failures: 8.
