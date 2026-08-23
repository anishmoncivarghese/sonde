# Sonde — Product Requirements Document

**Document status:** Draft for validation  
**Version:** 0.1  
**Date:** 2026-08-15  
**Working product name:** Sonde  
**Distribution intent:** Free and open source  
**Primary interface:** Local CLI and Model Context Protocol (MCP) server

---

## 1. Executive summary

Sonde is a local, deterministic context engine for AI coding agents. It indexes a software repository into a symbol-level relationship graph, combines that graph with lexical and semantic retrieval, and returns the smallest evidence-backed set of source code needed for a task.

Today, coding agents often rediscover a repository repeatedly. They list directories, search text, open entire files, follow imports manually, and consume large numbers of tokens before they can answer a question or make a safe change. Pure vector search is useful but can miss structurally related code. Sending a complete repository map can also become expensive and noisy.

Sonde will perform repository analysis before the LLM is invoked. The model will continue to use self-attention over the context it receives; Sonde does not replace or disable self-attention. Its purpose is to reduce and improve that context.

The product promise is:

> Give any compatible coding agent the minimum sufficient, source-verifiable context for understanding, reviewing, and changing a codebase.

Sonde will be local-first, model-neutral, client-neutral, incremental, inspectable, and benchmarked against ordinary file exploration and existing repository-context systems. The first release will prioritize retrieval correctness and freshness over visualizations, AI-generated summaries, or broad language coverage.

---

## 2. Problem statement

### 2.1 User problem

When a developer asks an AI agent to explain, debug, review, or change a non-trivial repository, the agent must first determine:

- Which files and symbols are relevant?
- What calls or depends on the target code?
- Which tests cover it?
- Which execution paths may be affected?
- Has the code changed since any cached description was produced?
- How much context can be included without overwhelming the model?

Most agent harnesses answer these questions through repeated filesystem searches and file reads. This produces four recurring problems:

1. **Token waste:** irrelevant or overly broad file contents are sent to the model.
2. **Low structural recall:** text search can find a definition while missing indirect callers, implementations, tests, configuration, or generated registrations.
3. **Repeated discovery:** a new task or session frequently repeats exploration already performed earlier.
4. **Unsafe edits:** an agent changes a symbol without seeing downstream consumers or affected tests.

### 2.2 Technical problem

Code retrieval is not a single search operation. Natural-language queries, exact identifiers, runtime flows, imports, inheritance, tests, configuration, and repository history represent different signals. No single one of embeddings, keyword search, AST traversal, or a flat repository map reliably solves every task.

The system therefore needs to:

- Build deterministic structural knowledge from the source.
- Map natural-language tasks to likely starting symbols.
- Expand from those symbols through relevant relationships.
- Rank evidence under an explicit token budget.
- Return actual source snippets with provenance.
- Detect and communicate stale or incomplete index state.

### 2.3 Why now

MCP provides a broadly supported way for agents to discover and invoke repository-context tools. Existing products validate demand for repository maps, symbol retrieval, code graphs, and Graph RAG. However, there remains room for an open, lightweight system that emphasizes measurable context efficiency, freshness guarantees, safe impact analysis, and portable MCP contracts.

---

## 3. Product vision

Sonde should become a reusable context layer between source repositories and coding agents.

```text
Developer question or task
            |
            v
   Client coding agent
            |
            v
      Sonde MCP
            |
    +-------+--------+
    |                |
 Query planner   Freshness check
    |                |
    +-------+--------+
            |
   Hybrid retrieval
   - exact and lexical
   - symbols and graph
   - semantic similarity
   - change and test signals
            |
            v
 Token-budgeted context pack
            |
            v
 Actual source evidence returned to agent
```

Long term, Sonde should answer questions such as:

- “Where is login-session refresh implemented?”
- “What can break if I change this protocol?”
- “Show the execution flow from this route to the database.”
- “Which tests should I run for these uncommitted changes?”
- “Review only the changed code, plus structurally affected callers.”
- “Find unused code, but distinguish proven dead code from uncertain results.”
- “Produce a 5,000-token context package for implementing this issue.”

---

## 4. Product principles

### 4.1 Source is the authority

The graph must be derived from source code and trusted compiler, parser, language-server, or repository signals. An LLM must not be responsible for declaring that metadata is current.

### 4.2 Deterministic core, optional probabilistic enrichment

Symbol definitions, file membership, imports, references, inheritance, and content hashes should be deterministic. Embeddings, natural-language summaries, query rewriting, and reranking may be added as optional enrichments and must never silently override source evidence.

### 4.3 Minimum sufficient context

The objective is not the fewest possible tokens. It is the smallest context that preserves enough evidence and dependency coverage to perform the task correctly.

### 4.4 Every answer is traceable

Results must identify repository revision, file path, symbol, current source range, relationship path, and freshness state. A user or agent should be able to verify why a result was included.

### 4.5 Freshness is a product feature

Stale data must never be presented as current without an explicit warning. Incremental updates and freshness checks are first-class requirements, not background implementation details.

### 4.6 Local-first and private by default

Indexing and deterministic retrieval must work without uploading source code. Optional remote embeddings or model summaries must be opt-in and clearly disclosed.

### 4.7 Agent-oriented tools

The MCP surface should expose high-value engineering concepts such as affected flows and tests, rather than forcing an agent to assemble everything through dozens of primitive graph queries.

### 4.8 Benchmark claims, not marketing guesses

Claims about token savings, correctness, speed, or impact coverage must come from reproducible evaluations.

---

## 5. Goals and non-goals

### 5.1 MVP goals

1. Index a supported repository into a local symbol and relationship graph.
2. Update the graph incrementally after source changes.
3. Find definitions, references, imports, callers, callees, inheritance, and associated tests where supported.
4. Retrieve task-relevant code through a combination of lexical, structural, and optional semantic signals.
5. Produce token-budgeted context packs containing actual source evidence.
6. Expose useful retrieval and impact-analysis operations through MCP and CLI.
7. Report freshness, confidence, unresolved relationships, and index revision.
8. Demonstrate measurable value using a public benchmark and baselines.
9. Operate locally with no mandatory account, cloud database, or hosted model.

### 5.2 Later goals

- Cross-repository graphs and monorepo package boundaries.
- IDE extensions and interactive graph visualization.
- Compiler-grade language-specific adapters.
- Git-history-aware ownership and regression analysis.
- Runtime trace ingestion.
- Framework-aware routes, dependency injection, persistence, and event flows.
- Safe semantic refactoring tools.
- Organization-wide remote index service.

### 5.3 Non-goals for MVP

- Replacing an LLM or its attention mechanism.
- Building a general-purpose graph database.
- Supporting every programming language at launch.
- Editing source code through MCP.
- Executing commands or tests through MCP.
- Producing an always-in-context Markdown dump of the repository.
- Depending on AI-generated summaries for graph correctness.
- Guaranteeing runtime call relationships from static analysis alone.
- Providing a full security scanner or formal program verifier.
- Replacing LSPs, compilers, IDEs, or source-control systems.
- Activity, cost, session, or efficiency analytics of any kind — see §20.

---

## 6. Target users

### 6.1 Primary persona: agent-assisted developer

A developer using Codex, Claude Code, Cursor, Gemini CLI, VS Code, or another MCP-compatible client on a medium or large repository.

Needs:

- Faster repository understanding.
- Lower model and token cost.
- Safer cross-file modifications.
- Less manual selection of files.
- Private, local operation.

### 6.2 Secondary persona: maintainer and reviewer

A maintainer reviewing pull requests or unfamiliar modules.

Needs:

- Risk-ranked change summaries.
- Affected callers and flows.
- Relevant tests and missing coverage.
- Evidence-backed review context.

### 6.3 Secondary persona: tool and agent author

A developer building an agent harness or IDE integration.

Needs:

- Stable structured outputs.
- Predictable token limits.
- Query diagnostics and provenance.
- A client-neutral local API.

### 6.4 Initial language persona

The initial user should work in one or two deliberately supported language ecosystems. Final selection is an early validation decision. Two plausible paths are:

- **Breadth-first:** TypeScript/JavaScript and Python using Tree-sitter and language servers.
- **Differentiation-first:** Swift plus TypeScript, with SourceKit-LSP/index-store integration as the distinctive strength.

Swift support should only be advertised as “deep” after protocol conformances, extensions, package targets, references, and test relationships are evaluated on real Xcode and SwiftPM repositories.

---

## 7. Jobs to be done and core scenarios

### 7.1 Repository orientation

**When** I enter an unfamiliar repository,  
**I want** a compact architecture and module overview,  
**so that** I can identify the likely entry points without reading the entire tree.

Expected behavior:

- Detect languages, packages, targets, entry points, and major communities.
- Return a bounded overview rather than all nodes.
- Link every claim to source or configuration evidence.

### 7.2 Locate an implementation

**When** I describe behavior in natural language,  
**I want** the relevant implementation symbols and supporting context,  
**so that** the agent does not explore blindly.

Expected behavior:

- Combine exact, lexical, semantic, and structural retrieval.
- Explain why each result was selected.
- Return source snippets only after checking file freshness.

### 7.3 Understand a symbol

**When** I ask about a function, type, or method,  
**I want** its definition, callers, callees, related types, and tests,  
**so that** I understand its role and constraints.

### 7.4 Estimate change impact

**When** I plan to modify a symbol or have local changes,  
**I want** a bounded impact radius and affected execution flows,  
**so that** the agent can inspect likely consumers before editing.

### 7.5 Review changes

**When** I review a diff,  
**I want** risk-scored context around changed symbols,  
**so that** review attention goes to behaviorally important changes.

### 7.6 Select tests

**When** code changes,  
**I want** the tests most likely to cover the changed behavior,  
**so that** validation is targeted without pretending that static relationships prove coverage.

### 7.7 Prepare a context pack

**When** an agent has a limited context budget,  
**I want** a ranked bundle of source evidence within that budget,  
**so that** it can answer or implement with less irrelevant input.

---

## 8. Competitive landscape and positioning

Existing systems validate the product category:

- Aider constructs a repository map and graph-ranks important symbols within a token budget.
- Serena provides MCP-based semantic symbol retrieval and refactoring backed by language servers.
- GitNexus exposes a local code knowledge graph, call chains, clusters, and execution flows.
- SondeContext provides symbol-level graph retrieval through MCP.
- SondeMCPServer provides Tree-sitter indexing, Graph RAG, incremental updates, and multiple languages.
- Sourcegraph combines search and code-graph intelligence at large scale.
- Academic systems such as CodexGraph demonstrate repository interaction through code graphs.

Sonde cannot differentiate merely by offering “a graph of functions and calls.” Its intended differentiation is the combination of:

1. Reproducible context-efficiency benchmarks.
2. Explicit freshness and uncertainty semantics.
3. Task-level tools for review, impact, affected flows, and tests.
4. Hybrid retrieval rather than graph-only or embedding-only retrieval.
5. Token-budgeted evidence packs with provenance.
6. Local, zero-account, low-dependency setup.
7. Potentially best-in-class Swift/Xcode intelligence, subject to validation.

### 8.1 Positioning statement

> **Superseded by measurement (2026-08-23).** The statement below promises
> retrieval that flat maps and probabilistic search cannot match. Benchmarking
> against a real 19,409-line repository showed a competent agentic search loop
> reaching 1.000 recall on every structural task — the same evidence Sonde
> returns. The defensible claim is cost and determinism, not reach: the same
> answers at ~3× less context, ~8× fewer tool calls, ~147× lower latency, and
> zero budget overruns against three of six. See design spec §3.0.


For developers using AI agents on real repositories, Sonde is a local context compiler that turns source code into fresh, evidence-backed, token-budgeted task context. Unlike flat repository maps or probabilistic code search alone, it combines deterministic program relationships with lexical and semantic retrieval and reports exactly why every source fragment was selected.

---

## 9. Functional requirements

Requirements use the labels **P0** (required for MVP), **P1** (important after MVP), and **P2** (future).

### 9.1 Repository discovery

- **FR-001 / P0:** Accept an explicit repository root.
- **FR-002 / P0:** Canonicalize and validate the root before reading files.
- **FR-003 / P0:** Respect `.gitignore` by default.
- **FR-004 / P0:** Support an additional `.sondeignore` file using gitignore-style patterns.
- **FR-005 / P0:** Exclude VCS internals, dependency directories, build products, generated artifacts, binaries, and oversized files using configurable defaults.
- **FR-006 / P0:** Detect Git revision and dirty-worktree state when Git is available.
- **FR-007 / P0:** Detect supported languages and package/build manifests.
- **FR-008 / P1:** Detect monorepo packages, targets, and workspace boundaries.
- **FR-009 / P1:** Let users mark generated or vendored source explicitly.

### 9.2 Parsing and symbol extraction

- **FR-010 / P0:** Extract files, modules, namespaces, types, functions, methods, and tests for supported languages.
- **FR-011 / P0:** Record fully qualified name, signature, visibility, source range, documentation range, and content hash where available.
- **FR-012 / P0:** Use parser-derived symbol boundaries rather than fixed-size line chunks.
- **FR-013 / P0:** Preserve parse diagnostics and partial-index state.
- **FR-014 / P0:** Continue indexing unaffected files when one file fails to parse.
- **FR-015 / P1:** Extract fields, properties, enum cases, endpoints, and configuration declarations.
- **FR-016 / P1:** Support symbols supplied by LSP or compiler indexes in addition to Tree-sitter.

### 9.3 Graph construction

- **FR-020 / P0:** Create `CONTAINS`, `DEFINES`, `IMPORTS`, `CALLS`, `REFERENCES`, `INHERITS`, `IMPLEMENTS`, and `TESTS` edges where supported.
- **FR-021 / P0:** Record the extractor, confidence, source location, and index version for every edge.
- **FR-022 / P0:** Represent unresolved references without inventing target nodes.
- **FR-023 / P0:** Distinguish a statically proven edge from a heuristic edge.
- **FR-024 / P1:** Identify repository entry points and public API surfaces.
- **FR-025 / P1:** Group symbols into modules or communities using deterministic structural signals.
- **FR-026 / P1:** Detect common framework relationships through versioned adapters.
- **FR-027 / P2:** Merge optional runtime traces with static relationships while retaining provenance.

### 9.4 Incremental indexing and freshness

- **FR-030 / P0:** Compute file content hashes and only reparse changed files.
- **FR-031 / P0:** Remove or replace obsolete nodes and edges atomically.
- **FR-032 / P0:** Check requested source files against indexed hashes before returning code.
- **FR-033 / P0:** Return one of `fresh`, `stale`, `partial`, or `unknown` for every query.
- **FR-034 / P0:** Support explicit `index`, `update`, `status`, and `rebuild` CLI operations.
- **FR-035 / P0:** Never serve a stale line range as if it were current; refresh it or return a stale-state response.
- **FR-036 / P1:** Watch files and debounce incremental updates.
- **FR-037 / P1:** Track schema and extractor versions and perform safe migrations or rebuilds.
- **FR-038 / P1:** Record last successful index time and last observed source change.

### 9.5 Search and retrieval

- **FR-040 / P0:** Search exact symbol names, qualified names, paths, signatures, and documentation.
- **FR-041 / P0:** Provide full-text lexical search through SQLite FTS5 or an equivalent local index.
- **FR-042 / P0:** Traverse callers, callees, imports, references, inheritance, implementations, containers, and tests.
- **FR-043 / P0:** Bound traversal by depth, result count, relationship type, and token budget.
- **FR-044 / P0:** Rank seed results separately from graph-expanded results.
- **FR-045 / P0:** Deduplicate overlapping source ranges.
- **FR-046 / P0:** Include a machine-readable selection reason for each result.
- **FR-047 / P0:** Include warnings about uncertain or unresolved relationships.
- **FR-048 / P1:** Support optional local or configured semantic embeddings.
- **FR-049 / P1:** Fuse retrieval scores instead of treating an embedding score as truth.
- **FR-050 / P1:** Support task-aware policies for explanation, debugging, implementation, review, and test selection.
- **FR-051 / P1:** Support reranking using a local or explicitly configured external model.

### 9.6 Source retrieval and context packing

- **FR-060 / P0:** Return actual current source code, not only stored summaries.
- **FR-061 / P0:** Include path, language, symbol identity, line range, content hash, and index revision.
- **FR-062 / P0:** Allow callers to specify a maximum token budget.
- **FR-063 / P0:** Reserve budget for result metadata and avoid exceeding the requested budget by more than a documented tokenizer tolerance.
- **FR-064 / P0:** Prefer complete symbol bodies when they fit; otherwise return clearly marked excerpts.
- **FR-065 / P0:** Include signatures of directly related symbols when their complete bodies do not fit.
- **FR-066 / P0:** Provide omitted-result counts and reasons.
- **FR-067 / P1:** Offer compact and verbose output representations.
- **FR-068 / P1:** Export a human-readable Markdown architecture map on demand; never require it in every model context.

### 9.7 Change analysis

- **FR-070 / P0:** Detect uncommitted Git changes and changed source ranges.
- **FR-071 / P0:** Map changed ranges to enclosing symbols.
- **FR-072 / P0:** Estimate impact using reverse structural edges with explicit depth and confidence.
- **FR-073 / P0:** Locate structurally related tests.
- **FR-074 / P1:** Identify affected entry-point-to-leaf execution paths.
- **FR-075 / P1:** Risk-rank changes using public API status, fan-in, fan-out, changed complexity, test relationships, and uncertain edges.
- **FR-076 / P1:** Generate a bounded review context pack containing the diff, enclosing symbols, selected callers/callees, contracts, and tests.

### 9.8 Diagnostics and explainability

- **FR-080 / P0:** Expose index statistics, parse failures, unresolved edges, ignored files, and supported-language coverage.
- **FR-081 / P0:** Provide a query explanation containing seed retrieval, graph expansion, ranking factors, exclusions, and final budget allocation.
- **FR-082 / P0:** Permit disabling optional semantic or model-assisted stages.
- **FR-083 / P1:** Provide a developer trace mode with timing by retrieval stage.
- **FR-084 / P1:** Export sanitized benchmark traces without source content.

---

## 10. MCP product surface

The MCP server should expose a small, coherent tool set. Too many overlapping tools increase discovery tokens and make agent behavior less predictable. All tools should use stable structured output schemas and return compact summaries before large payloads.

### 10.1 `get_architecture_overview`

Returns a bounded overview of languages, packages, modules, entry points, important symbols, and communities.

Suggested input:

```json
{
  "focus_path": "optional/path",
  "depth": 1,
  "token_budget": 3000
}
```

### 10.2 `semantic_search_nodes`

Finds likely symbol or file seeds for a natural-language or exact query. Despite the name, the implementation may combine exact, lexical, and optional embedding retrieval.

Suggested input:

```json
{
  "query": "refresh expired login session",
  "kinds": ["function", "method", "type", "file"],
  "paths": ["src/"],
  "limit": 20
}
```

### 10.3 `query_graph`

Performs safe, predefined graph queries without exposing arbitrary SQL.

Suggested input:

```json
{
  "pattern": "callers_of",
  "node_id": "swift:Auth.SessionManager.refresh()",
  "depth": 2,
  "limit": 50
}
```

Initial patterns:

- `callers_of`
- `callees_of`
- `imports_of`
- `imported_by`
- `references_to`
- `implementations_of`
- `inheritors_of`
- `tests_for`
- `contained_by`
- `contains`

### 10.4 `get_impact_radius`

Returns risk-ranked upstream and downstream symbols potentially affected by changing one or more symbols.

Suggested input:

```json
{
  "node_ids": ["typescript:src/auth.ts#refreshToken"],
  "direction": "both",
  "max_depth": 3,
  "include_tests": true,
  "token_budget": 4000
}
```

The output must distinguish direct, transitive, heuristic, and unresolved impact.

### 10.5 `detect_changes`

Maps a Git diff or working-tree changes to graph nodes and assigns explainable risk factors.

Suggested input:

```json
{
  "base": "HEAD",
  "include_untracked": true,
  "paths": []
}
```

### 10.6 `get_affected_flows`

Finds bounded paths connecting changed or selected symbols with entry points, external interfaces, persistence, or tests.

This should be P1 unless the initial parser can recover call edges with adequate precision.

### 10.7 `get_review_context`

Returns a token-budgeted evidence package for reviewing changes.

Suggested input:

```json
{
  "base": "HEAD",
  "token_budget": 8000,
  "include_tests": true,
  "risk_threshold": "medium"
}
```

### 10.8 `get_context_for_task`

The highest-level retrieval operation. It takes a task and returns the best available context pack.

Suggested input:

```json
{
  "task": "Fix duplicate token refresh requests when two API calls fail together",
  "task_type": "debug",
  "focus_paths": [],
  "token_budget": 6000,
  "include_tests": true,
  "max_graph_depth": 2
}
```

### 10.9 Common output envelope

Every tool should return a consistent envelope:

```json
{
  "schema_version": "1",
  "repository": {
    "root_id": "sha256-of-canonical-root",
    "revision": "git-commit-or-null",
    "dirty": true
  },
  "freshness": {
    "state": "fresh",
    "indexed_at": "2026-08-15T00:00:00Z",
    "stale_paths": []
  },
  "summary": "Human- and model-readable compact summary",
  "results": [],
  "warnings": [],
  "diagnostics": {
    "truncated": false,
    "omitted_count": 0,
    "estimated_tokens": 0
  }
}
```

### 10.10 MCP safety annotations

MCP tool definitions should correctly describe read-only and idempotent behavior. Tool annotations must be treated as metadata rather than a security boundary. The server itself must enforce repository scoping and input validation.

---

## 11. Proposed system architecture

### 11.1 Components

```text
sonde CLI / MCP server
        |
        +-- Repository manager
        |     - root validation
        |     - ignores
        |     - Git state
        |
        +-- Index coordinator
        |     - discovery
        |     - hashing
        |     - incremental transactions
        |
        +-- Language adapters
        |     - Tree-sitter adapter(s)
        |     - LSP/compiler adapter(s)
        |     - framework enrichers
        |
        +-- Storage
        |     - SQLite relational graph
        |     - FTS5 lexical index
        |     - optional vector index
        |
        +-- Retrieval planner
        |     - query classification
        |     - seed retrieval
        |     - graph expansion
        |     - score fusion
        |     - deduplication
        |
        +-- Context packer
        |     - fresh source reads
        |     - token accounting
        |     - provenance
        |
        +-- Interfaces
              - MCP stdio
              - CLI JSON/text
              - later: local HTTP/UI
```

### 11.2 Recommended implementation stack

The language should be selected after a short spike, not solely by preference.

Candidate A — TypeScript:

- Strong MCP SDK support and distribution through npm.
- Good Tree-sitter ecosystem.
- Easy single-command installation for many agent users.
- SQLite through a mature native or WASM-backed library.

Candidate B — Rust core with TypeScript or direct MCP wrapper:

- Strong performance and single-binary distribution.
- Higher implementation cost and potentially slower iteration.

Candidate C — Python:

- Fast experimentation and mature analysis libraries.
- Packaging and multi-platform language-server management may be less smooth.

**Provisional recommendation:** TypeScript for the MVP, unless the Swift/Xcode spike shows that a native Swift or Rust component materially improves index quality or distribution.

### 11.3 Storage choice

Use SQLite initially.

Reasons:

- No external service.
- Transactional incremental updates.
- Sufficient graph traversal for repository-scale adjacency queries.
- FTS5 for lexical retrieval.
- Simple backup, migration, debugging, and deletion.

Do not require Neo4j for the local product. A dedicated graph database may be evaluated later for organization-scale, cross-repository deployment.

### 11.4 Index location

Default options to validate:

1. `.sonde/index.sqlite` inside the repository and ignored by Git.
2. A global cache keyed by canonical root and repository identity.

Provisional behavior:

- Store configuration in `.sonde/config.json` if the user opts into project-local configuration.
- Store disposable indexes in the user cache directory by default to avoid repository pollution.
- Never commit the binary index automatically.
- Permit an optional portable metadata export for debugging and CI artifacts.

---

## 12. Data model

The exact schema will evolve, but the semantic contract should begin with the following entities.

### 12.1 Repository

- `id`
- `canonical_root_hash`
- `display_name`
- `vcs_type`
- `head_revision`
- `schema_version`
- `created_at`
- `indexed_at`
- `extractor_manifest_hash`

### 12.2 File

- `id`
- `repository_id`
- `relative_path`
- `language`
- `content_hash`
- `git_blob_hash`
- `byte_length`
- `line_count`
- `generated_state`
- `parse_state`
- `parse_diagnostics`
- `indexed_at`

### 12.3 Symbol

- `id`
- `file_id`
- `stable_key`
- `qualified_name`
- `short_name`
- `kind`
- `signature`
- `visibility`
- `start_byte` / `end_byte`
- `start_line` / `end_line`
- `documentation_start_byte` / `documentation_end_byte`
- `body_hash`
- `exported`
- `test_symbol`
- `extractor`
- `extractor_version`

Stable IDs must not be based only on line numbers. A practical stable key can combine language, repository-relative path, qualified symbol identity, and normalized signature, with collision handling.

### 12.4 Edge

- `id`
- `source_symbol_id` or `source_file_id`
- `target_symbol_id` or `target_file_id`
- `kind`
- `source_location`
- `resolution_state`
- `confidence`
- `provenance`
- `extractor_version`

### 12.5 Unresolved reference

- `source_symbol_id`
- `reference_text`
- `relationship_kind`
- `source_location`
- `candidate_count`
- `reason`

### 12.6 Optional enrichment

- `entity_id`
- `enrichment_kind`
- `provider`
- `model`
- `input_hash`
- `value`
- `created_at`

This table may store embeddings or summaries. Enrichments must be invalidated by content hash and must be removable without harming deterministic graph operation.

### 12.7 Query trace

Disabled or ephemeral by default unless needed for local diagnostics:

- Query classification
- Seed candidates and scores
- Traversed edges
- Ranking features
- Selected and omitted evidence
- Timing and token estimates

Source-bearing traces must never be uploaded automatically.

---

## 13. Indexing pipeline

### 13.1 Cold start

1. Validate and canonicalize repository root.
2. Read ignore rules and discover candidate files.
3. Detect languages, manifests, packages, and targets.
4. Hash candidate files.
5. Parse supported files and extract symbols.
6. Resolve within-file relationships.
7. Resolve cross-file imports and references.
8. Identify tests and entry points.
9. Write nodes and edges in transactions.
10. Build lexical search indexes.
11. Optionally create embeddings after deterministic indexing succeeds.
12. Persist coverage and diagnostic summary.

### 13.2 Incremental update

1. Detect added, modified, moved, and deleted files.
2. Re-hash affected files.
3. Parse changed files into a staging transaction.
4. Re-resolve edges originating from changed symbols.
5. Re-resolve reverse candidates that referenced renamed or deleted symbols.
6. Invalidate affected enrichments by content hash.
7. Commit atomically.
8. Update repository freshness record.

### 13.3 Rename handling

File or symbol renames should be inferred using Git rename information when available and content/similarity heuristics otherwise. The system must not require identity preservation for correctness; it may delete and recreate nodes while reporting the change as a probable rename.

### 13.4 Partial failure

If a language adapter fails:

- Preserve the last known index only if marked stale.
- Continue processing unrelated files.
- Return the affected paths and diagnostics.
- Do not claim complete impact coverage.

---

## 14. Retrieval and ranking design

### 14.1 Stage 1: query interpretation

Classify the request into one or more intents:

- Locate
- Explain
- Trace
- Debug
- Implement
- Review
- Refactor
- Test selection
- Architecture

Extract exact identifiers, path hints, error strings, frameworks, and changed files. MVP classification should use deterministic rules with an optional model-assisted query rewrite later.

### 14.2 Stage 2: seed retrieval

Generate candidates from:

- Exact qualified-name match
- Exact short-name match
- Path and filename match
- FTS/BM25 over names, signatures, docs, and selected source text
- Optional vector similarity
- Git-changed symbols
- Explicit user focus paths

### 14.3 Stage 3: graph expansion

Expand selected seeds according to task policy.

Examples:

- Explain: container, callers, callees, implemented interfaces.
- Debug: callers, callees, error handlers, state mutations, tests.
- Implement: interfaces, sibling implementations, call sites, tests.
- Review: changed symbols, reverse dependencies, public contracts, tests.
- Refactor: all references, implementations, exports, generated registrations.

Every expansion should be bounded and cycle-safe.

### 14.4 Stage 4: score fusion

Initial ranking features may include:

- Exact identifier score
- Lexical relevance
- Semantic relevance if enabled
- Graph distance from seed
- Relationship type weight
- Path focus match
- Changed-symbol boost
- Test relevance
- Public API importance
- Fan-in or centrality
- Freshness penalty
- Generated/vendor penalty

Use a simple explainable weighted score or reciprocal-rank fusion first. Trainable reranking is not required for MVP.

### 14.5 Stage 5: evidence selection

Select evidence under the budget:

1. Required seed definitions.
2. Contracts and signatures.
3. Highest-value relationship evidence.
4. Relevant tests.
5. Supplementary neighboring code.

Avoid returning overlapping ranges. Large functions may be excerpted around relevant statements, but the output must state that the body is partial.

### 14.6 Stage 6: source verification

Before returning each snippet:

- Recompute or verify the current file hash.
- Resolve the current source range.
- Refresh the file or mark the result stale.
- Read from the canonical validated repository root.

### 14.7 Token accounting

MVP may use an approximate tokenizer chosen by client/model family. The output should report that the count is estimated. A caller may specify tokenizer identity later.

Budget allocation must include:

- Common response envelope
- Paths and provenance
- Code snippets
- Relationship summaries
- Warnings

---

## 15. Markdown role

Markdown is useful as an export and as durable human-authored guidance, but not as the graph database.

Supported future exports may include:

- `architecture.md`
- `module-map.md`
- `changed-impact.md`
- `context-pack.md`

Exports must contain index revision and generation time. They should be regenerated on demand and should not be automatically inserted into every agent prompt.

Human-authored files such as `AGENTS.md`, `README.md`, and architecture decision records may be indexed as documentation evidence with lower authority than parsed source for claims about actual code relationships.

---

## 16. Security and privacy requirements

- **SEC-001:** Restrict all reads to canonical paths beneath the configured repository root.
- **SEC-002:** Detect and safely handle symlinks that escape the root.
- **SEC-003:** Reject path traversal, absolute-path injection, and invalid encodings in MCP inputs.
- **SEC-004:** Do not upload source, snippets, embeddings, traces, or file paths by default.
- **SEC-005:** Require explicit configuration before using an external embedding or model provider.
- **SEC-006:** Respect ignore rules and offer secret-pattern exclusions.
- **SEC-007:** Treat repository content as untrusted data, not instructions for the MCP server.
- **SEC-008:** Do not execute repository code during indexing.
- **SEC-009:** Do not load language-server executables from the repository without an explicit trust policy.
- **SEC-010:** Use read-only MCP tools for MVP.
- **SEC-011:** Avoid arbitrary SQL, shell, or unrestricted graph-query execution through MCP.
- **SEC-012:** Bound query depth, result count, source bytes, execution time, and memory.
- **SEC-013:** Sanitize logs and make telemetry opt-in.
- **SEC-014:** Provide a command to delete all index and enrichment data for a repository.
- **SEC-015:** Document that static analysis can expose secrets to the local model client if ignored files are included.

---

## 17. Non-functional requirements

### 17.1 Performance targets for MVP

Targets are provisional and must be measured on reference hardware.

- Index 100,000 lines of supported source in under 60 seconds without optional embeddings.
- Apply a one-file incremental update in under 2 seconds at p95 for typical files.
- Return exact symbol lookup in under 150 ms at p95 after index warm-up.
- Return depth-two graph queries in under 500 ms at p95 for repositories below one million lines.
- Produce a context pack in under 2 seconds without an external model reranker.
- Keep idle MCP memory below 300 MB for a 100,000-line repository.

### 17.2 Reliability

- A malformed file must not corrupt the index.
- Interrupted indexing must leave either the previous valid index or a recoverable transaction.
- Schema migrations must be versioned.
- Unsupported syntax must produce diagnostics rather than fabricated relationships.
- Queries must be deterministic when optional probabilistic stages are disabled.

### 17.3 Portability

- MVP target platforms: macOS and Linux.
- Windows support is P1 unless distribution is already portable at low cost.
- MCP stdio is required.
- CLI output must support structured JSON for integration tests.

### 17.4 Accessibility and usability

- Installation should require one documented command where possible.
- `sonde doctor` should diagnose parser, database, MCP, and repository configuration.
- Errors should state a corrective action.
- The product must remain useful without a graph visualization UI.

---

## 18. CLI requirements

Proposed commands:

```text
sonde init [path]
sonde index [path]
sonde update [path]
sonde watch [path]
sonde status [path]
sonde doctor
sonde search <query>
sonde query <pattern> <symbol>
sonde context --task <text> --budget <tokens>
sonde changes [--base <revision>]
sonde mcp serve [path]
sonde mcp setup [client]
sonde export architecture --format markdown
sonde clean [path]
```

`clean` must resolve and display the exact index target and should remove only Sonde-owned data.

---

## 19. Evaluation strategy

Evaluation is part of the product, not a post-launch task.

### 19.1 Baselines

Compare at least:

1. Agent with ordinary file listing, text search, and file reads.
2. Agent with a static repository map.
3. Agent with Sonde deterministic retrieval.
4. Agent with Sonde hybrid retrieval.
5. Where practical, established open-source tools configured comparably.

### 19.2 Benchmark task classes

- Find a symbol from an exact identifier.
- Find behavior described without identifier overlap.
- Trace a call path across files.
- Identify implementations of an interface or protocol.
- Determine callers affected by a signature change.
- Select relevant tests for a change.
- Review a bug-introducing diff.
- Implement a small cross-file feature.
- Fix a repository issue requiring non-local context.
- Explain a module or subsystem.

### 19.3 Ground truth

Each retrieval task should define:

- Required evidence symbols.
- Helpful evidence symbols.
- Distractors.
- Acceptable relationship paths.
- Maximum context budget.

Ground truth should be human-reviewed and version-pinned.

### 19.4 Retrieval metrics

- Recall@k for required symbols.
- Precision@k.
- Mean reciprocal rank.
- Required-evidence coverage within token budget.
- Graph-edge precision by relationship kind.
- Test-selection recall.
- Stale-result rate.

### 19.5 End-to-end metrics

- Task success rate.
- Patch acceptance or tests passing.
- Input tokens.
- Output tokens.
- Tool-call count.
- Wall-clock time.
- Cost where applicable.
- Incorrect-file edit rate.
- Dependency-breakage rate.

### 19.6 MVP go/no-go criteria

The project should proceed beyond MVP if, on the selected benchmark:

- Deterministic Sonde retrieval reduces median agent input tokens by at least 30% without a statistically meaningful task-success decrease; **or**
- It improves task success by at least 10 percentage points at an equal context budget; and
- Required-evidence recall is at least 90% for supported structural task classes; and
- Stale source is never silently returned in the evaluation suite.

If these criteria are not met, investigate retrieval policy and graph accuracy before adding languages, UI, or hosted features.

### 19.7 Performance claims

No public token-reduction percentage should be claimed from metadata compression alone. Measurements must include tool descriptions, tool calls, returned metadata, source snippets, follow-up exploration, and the final task attempt.

---

## 20. Analytics and telemetry

Default: no network telemetry.

Local anonymous counters may be available through `sonde status`:

- Indexed files, symbols, and edges.
- Parse and resolution coverage.
- Query latency.
- Results selected and omitted.
- Estimated context tokens.
- Freshness checks and refreshes.

Any future telemetry must be opt-in, documented, source-free, path-sanitized, and independently disableable.

### 20.1 The activity ledger moved to AgentDock

**Status: removed from Sonde scope on 2026-08-16.**

An expanded draft of this section specified an opt-in activity ledger (tokens, lines, files, time, tool calls) with generated Markdown efficiency reports, together with FR-090–100, the `get_activity_report` MCP tool, the activity-event data model, the `sonde activity *` CLI commands, and Risk 9.

All of it is reassigned to AgentDock. Reasons:

1. **Opposite durability classes.** A Sonde index is derived and disposable — delete it, rebuild from source, lose nothing. An activity ledger is authored and irreplaceable. They require opposite backup, retention, privacy, and commit policies, so any single decision is wrong for one of them.
2. **AgentDock already owns the substrate.** It has an event ledger, and it already emits session-start events carrying the client-provided session ID, the agent name, and a timestamp.
3. **The join key already exists there.** AgentDock records the same session identifier that names the coding client's own transcript file, so token and tool-call measurements can be read from an authoritative source rather than reconstructed.
4. **This was the only section of this PRD** that never referenced a symbol, an edge, or a line of source.

One design constraint travels with it: **measure with code, narrate with agents.** Tokens, tool calls, lines, and files are obtainable deterministically from client transcripts and version control. An agent cannot observe its own token usage or elapsed time, so an agent-written numeric ledger records invention rather than measurement. Agents may contribute task titles and outcome notes; nothing numeric.

Section numbering below is preserved so that existing cross-references remain valid.

---

## 21. Delivery plan

### Phase 0 — Validation and spikes

Deliverables:

- Choose the first two language ecosystems.
- Spike Tree-sitter extraction and cross-file reference resolution.
- If Swift is selected, compare Tree-sitter, SourceKit-LSP, and index-store data.
- Test SQLite adjacency-query performance on small, medium, and large repositories.
- Define 30 initial benchmark tasks before building the full MCP surface.
- Test three existing tools on the same tasks and document gaps.

Exit criteria:

- Evidence that at least one high-value gap is not already solved adequately.
- A stable initial node/edge schema.
- A measured path to incremental indexing.

### Phase 1 — Deterministic index and CLI

Deliverables:

- Repository discovery and ignore handling.
- Parser adapter interface.
- Symbol extraction for initial languages.
- SQLite schema and migrations.
- Imports, contains, definitions, and initial call/reference edges.
- Incremental hashing and updates.
- Exact and FTS search.
- CLI query and diagnostics.

Exit criteria:

- No silent stale reads.
- Structural retrieval benchmark operational.
- Edge accuracy sampled and documented.

### Phase 2 — MCP and context packs

Deliverables:

- MCP stdio server.
- Architecture, search, graph, impact, changes, and task-context tools.
- Common structured output envelope.
- Token budgeting and source verification.
- Setup docs for major MCP clients.

Exit criteria:

- At least two independent clients complete benchmark tasks.
- End-to-end token and success metrics recorded.

### Phase 3 — Hybrid retrieval and review intelligence

Deliverables:

- Optional embeddings.
- Rank fusion and query policies.
- Test relationships.
- Review-context and affected-flow tools.
- Explainable risk scoring.

Exit criteria:

- MVP go/no-go thresholds met or a documented decision made.

### Phase 4 — Open-source public beta

Deliverables:

- Stable installation.
- Security review and threat model.
- Public benchmark repository and results.
- Contribution guide, code of conduct, issue templates, and roadmap.
- Versioned MCP schemas.

---

## 22. Open-source strategy

Recommended license candidates:

- Apache-2.0 for permissive use with an explicit patent grant.
- MIT for maximal simplicity.

The choice should be made before accepting external contributions. Apache-2.0 is the provisional recommendation.

Repository expectations:

- Public architecture decisions.
- Reproducible benchmark fixtures.
- Language-adapter contribution contract.
- No benchmark results accepted without configuration and version disclosure.
- Security policy and private vulnerability-reporting path.
- Clear distinction between core open-source features and any future hosted service.

“Free for all” should mean the local indexer, graph, retrieval planner, MCP server, benchmark harness, and core language adapters remain usable without payment or an account.

---

## 23. Key risks and mitigations

### Risk 1: crowded category

**Risk:** The project duplicates established repository-map and code-graph MCP tools.  
**Mitigation:** Benchmark competitors first and focus scope on measurable context packing, freshness, impact, and review workflows.

### Risk 2: inaccurate call graphs

**Risk:** Dynamic dispatch, reflection, macros, dependency injection, and framework registration reduce static precision.  
**Mitigation:** Track provenance and confidence, use language-server/compiler indexes where available, retain unresolved edges, and never describe heuristic reachability as guaranteed.

### Risk 3: retrieval omits critical context

**Risk:** Fewer tokens can reduce task success.  
**Mitigation:** Optimize required-evidence recall, include uncertainty warnings, allow budget expansion, and compare end-to-end success rather than tokens alone.

### Risk 4: stale index

**Risk:** Returned source ranges or dependencies no longer match files.  
**Mitigation:** Content hashes, transactional updates, source verification at read time, and explicit freshness states.

### Risk 5: excessive MCP complexity

**Risk:** Too many tools consume prompt space and confuse the agent.  
**Mitigation:** Maintain a small task-oriented surface, common schemas, clear descriptions, and usage evaluation across clients.

### Risk 6: expensive AI enrichment

**Risk:** Summaries and embeddings add latency, cost, privacy concerns, and invalidation complexity.  
**Mitigation:** Make them optional and hash-cached; ensure deterministic retrieval remains fully functional without them.

### Risk 7: indexing large repositories

**Risk:** Cold start, memory, and index size become prohibitive.  
**Mitigation:** Stream discovery, batch transactions, incremental parsing, package-level indexing, and measurable resource budgets.

### Risk 8: generic product name

**Risk:** “Sonde” conflicts conceptually and in search results with several existing projects.  
**Mitigation:** Treat Sonde as a working name and perform package, domain, repository, and trademark checks before public launch.

---

## 24. Decisions made in this draft

1. The core artifact is a queryable local index, not an expanding Markdown file.
2. Symbol-aware parsing is required; fixed 100-line chunks are rejected for core indexing.
3. Metadata updates are automatic and source-derived, not dependent on agent self-reporting.
4. SQLite is the provisional MVP database.
5. The graph is combined with lexical search and optional embeddings.
6. Actual current source is returned as evidence.
7. MCP tools are read-only in MVP.
8. Freshness, uncertainty, provenance, and token budgeting are public product contracts.
9. Evaluation is defined before feature expansion.
10. Visualization is not required for MVP.
11. Activity and efficiency analytics belong to AgentDock, not Sonde — see §20.

---

## 25. Decisions still required

### Product decisions

- Which user pain is the launch headline: token efficiency, safer changes, review intelligence, or Swift/Xcode understanding?
- Is the initial audience individual developers or agent-tool authors?
- Is a native macOS application part of the product, or is CLI/MCP sufficient initially?
- What final product name avoids confusion with existing Sonde projects?

### Technical decisions

- Initial language pair.
- TypeScript, Rust, Python, Swift, or a mixed implementation.
- Tree-sitter-only initial indexing versus LSP integration in MVP.
- Local index directory and multi-worktree behavior.
- Tokenizer strategy across model clients.
- Optional embedding provider and local vector storage.
- How strongly `CALLS` can be supported per initial language.

### Evaluation decisions

- Reference repositories and licenses.
- Which existing tools can be fairly compared.
- Which model/client combinations to pin.
- How many benchmark repetitions control model variance.
- Whether task success is judged by tests, human review, an evaluator model, or a combination.

---

## 26. Immediate next actions

1. Select three representative repositories: small, medium, and large.
2. Write the first 30 retrieval and impact questions with ground-truth symbols.
3. Run those questions using ordinary agent exploration and at least two existing open-source code-context systems.
4. Choose the first language pair based on observed gaps and personal ability to maintain adapters.
5. Implement a thin parser spike that emits files, symbols, imports, and references into SQLite.
6. Measure index time, query time, graph accuracy, and context tokens before designing a UI.
7. Finalize the MVP MCP schemas only after observing how two different agents use the CLI primitives.

---

## 27. Reference systems and specifications

- [Model Context Protocol specification](https://modelcontextprotocol.io/specification/)
- [MCP tools specification](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/docs/specification/2026-07-28/server/tools.mdx)
- [Aider repository map](https://aider.chat/docs/repomap.html)
- [Serena](https://github.com/oraios/serena)
- [GitNexus](https://github.com/nxpatterns/gitnexus)
- [SondeContext](https://github.com/sondecontext/sondecontext)
- [SondeMCPServer](https://github.com/nahisaho/SondeMCPServer)
- [Sourcegraph code context](https://sourcegraph.com/docs/cody/core-concepts/context)
- [Sourcegraph SCIP and precise code navigation](https://sourcegraph.com/docs/code-navigation/precise-code-navigation)
- [CodexGraph research paper](https://arxiv.org/abs/2408.03910)

---

## 28. One-sentence success definition

Sonde succeeds when a coding agent can solve repository-level tasks with fewer input tokens and equal or better correctness, while every selected source fragment remains fresh, explainable, and verifiable.
