# Decisions

Append-only. Written by whyline; readable without it.

## 2026-08-14 — Use an isolated CodeGraph repository for the clean M0 exercise

**Because:** A project-local Git history keeps unrelated home-directory changes out of the experiment denominator

**Rejected:**

- Reuse the parent /Users/anish repository — its broad dirty worktree would make the M0 result uninterpretable

**Files:** AGENTS.md

<!-- whyline-event: 9353a8ad0db84aafa7bed6aba3c20d76 -->

## 2026-08-15 — Use a structured local activity ledger with generated Markdown efficiency reports

**Because:** token, time, file, and line metrics need reliable aggregation, provenance, retention, and regeneration while remaining human-readable

**Rejected:**

- append-only Markdown as source of truth — difficult to query, correct, version, and write concurrently
- automatic inclusion in agent context — would increase token use and expose private history without being relevant

**Files:** prd.md

<!-- whyline-event: 5d6b886f891945269958538f14b8ec55 -->

## 2026-08-16 — Fully remove the third-party code-review-graph installation rather than repairing its broken hooks

**Because:** its refresh hooks had been exiting 127 on every Edit/Write/Bash for months while a global CLAUDE.md instruction still directed agents to the resulting empty indexes; CodeGraph is being built to replace it, so repair would add ~250ms per tool call for a tool with no populated index

**Rejected:**

- repair hooks to use uvx — pays a per-tool-call latency tax for a tool slated for replacement
- remove hooks but keep the MCP server — leaves agents pointed at empty graphs with no refresh path

**Files:** /Users/anish/.claude/settings.json

<!-- whyline-event: 38efa40293e345f9af6fca78519b7d30 -->

## 2026-08-16 — Reassign the activity ledger from CodeGraph to AgentDock

**Because:** a CodeGraph index is derived and disposable while an activity ledger is authored and irreplaceable, so they need opposite backup, retention and commit policies; AgentDock already owns session boundaries and records the client session id that names the transcript file holding authoritative token counts

**Rejected:**

- keep the ledger in CodeGraph PRD section 20 — the only section referencing no symbol, edge or line of source
- agent-written Markdown ledger — an agent cannot observe its own token usage or elapsed time, so the numbers would be invented rather than measured

**Files:** prd.md

<!-- whyline-event: 19a783052780465a85caa71d697df521 -->

## 2026-08-16 — Keep only stable rules in AGENTS.md and point to the ledger and whyline for current state

**Because:** a hand-maintained status section in a handover file goes stale and then actively misleads the next agent, which is the same failure mode as the stale index this project replaces; stable rules change rarely and can be verified, progress cannot

**Rejected:**

- copy current task/branch state into AGENTS.md — goes stale the moment work continues
- leave AGENTS.md rules-free and rely on whyline alone — whyline is append-only history, not current instructions, so a fresh agent gets no invariants

**Files:** AGENTS.md

<!-- whyline-event: 488a3e1fea054ce6a45041352038f3e9 -->

## 2026-08-16 — Pin better-sqlite3 to ^13.0.0, not ^11.0.0

**Because:** 13.0.3 ships N-API prebuilds (prebuilds/<platform>.node) satisfying the zero-native-compilation constraint; verified 11.10.0 (the version ^11.0.0 resolves to) has no prebuilds dir and compiles from source via node-gyp on this machine

**Rejected:**

- better-sqlite3@^11.0.0 — originally in the brief from a controller memory error; resolves to 11.10.0 which lacks the N-API prebuild layout and triggers a real node-gyp/clang source build, violating the zero-install Global Constraint

**Files:** package.json

<!-- whyline-event: f5a9294b0d284c9ea3eaf301100eb9a0 -->

## 2026-08-17 — Split tsconfig into tsconfig.json (typecheck, includes src+tests+bench) and tsconfig.build.json (build, src-only with rootDir/outDir)

**Because:** tsc --noEmit via 'npm run typecheck' used the build tsconfig, whose include was src/**/* only — tests/ and bench/ were never typechecked despite CI running typecheck on every push. rootDir:src can't coexist with including tests/ in the same config without breaking build's output layout, so the configs had to split.

**Rejected:**

- add tests/**/* to the single existing tsconfig — breaks 'npm run build' because rootDir=src rejects files outside src/
- leave as-is and typecheck only via vitest — vitest strips types instead of checking them, so this wouldn't have caught the escalation at all

**Files:** tsconfig.json, tsconfig.build.json, package.json

<!-- whyline-event: 13bde69cc2a44330bca6dcdcdda8762f -->

## 2026-08-17 — Canonicalize repository roots and re-check existing targets after symlink resolution

**Because:** lexical containment alone cannot prevent an in-root symlink from exposing files outside the repository

**Rejected:**

- lexical path checks only — traversal is blocked but symlink escapes remain readable

**Files:** src/repo/boundary.ts

<!-- whyline-event: bffdee0f5707429eaa23e5870c282e75 -->

## 2026-08-17 — Extend RepoBoundary with directory and metadata reads for discovery

**Because:** the stable SEC-001/002/003 invariant requires every repository read, including ignore files and directory walks, to pass through one canonical containment check

**Rejected:**

- use fs directly in ignore and discovery modules as shown in the plan — violates the repository-wide read boundary

**Files:** src/repo/boundary.ts, src/repo/ignore.ts, src/repo/discover.ts

<!-- whyline-event: 3ef956d492e945d8b3c08672715f9608 -->

## 2026-08-17 — Check schema compatibility before applying idempotent DDL

**Because:** refusing an unsupported index version must not partially mutate that database before reporting the mismatch

**Rejected:**

- execute schema.sql before reading schema_version — can alter a future-version database even though migration is refused

**Files:** src/store/migrate.ts

<!-- whyline-event: 5c38d377b29544229a06628bf7cf210c -->

## 2026-08-17 — Make each store batch insert atomic

**Because:** a duplicate or invalid row must not leave an earlier subset of the same symbol, edge, external, or unresolved batch persisted

**Rejected:**

- execute batch rows individually without a transaction — failures leave partial graph state

**Files:** src/store/repos.ts

<!-- whyline-event: 478dfee6c63e44989332d6e12e2b5847 -->

## 2026-08-17 — bump web-tree-sitter 0.24 -> 0.25 for Task 5 parser plumbing

**Because:** 0.24.x exports Parser as a single CJS 'export =' class with Language nested under Parser.Language, set only after Parser.init() runs; the brief's code (and the Task 6 Swift-spike contract) needs the 0.25+ API with Parser and Language as separate named exports and Language.load() as a static

**Rejected:**

- keep 0.24.0 and rewrite parser.ts to the old API — brief's exact code wouldn't match, and future adapter work would target a soon-superseded API

**Files:** src/adapters/typescript/parser.ts

<!-- whyline-event: 7e3b6f7b423c442fafa8eee51f0494c4 -->

## 2026-08-17 — Add optional scopeHint to adapter references after the Swift spike

**Because:** 75% of the stratified sample remained high-fanout heuristic without module or access-control scope, crossing the design's 60% amendment threshold

**Rejected:**

- keep resolution import-only — Swift same-module internal references receive no narrowing signal

**Files:** src/adapters/types.ts, docs/superpowers/specs/2026-08-16-swift-spike-findings.md

<!-- whyline-event: df5af169e6f7497895af22f2c2f5cd78 -->

## 2026-08-17 — Require a Swift grammar/runtime fix before the v0.2 adapter

**Because:** the pinned grammar marked 47 of 200 Duet files as erroneous, a 23.5% rate against the 5% gate, and Node 24 needed baseline WASM compilation to avoid optimizer OOM

**Rejected:**

- treat named extensions and detected SwiftUI constructs as sufficient — symbol boundaries do not compensate for the failed parse-reliability gate

**Files:** docs/superpowers/specs/2026-08-16-swift-spike-findings.md

<!-- whyline-event: 44911ec964c04f3b99fe098aca225aa1 -->

## 2026-08-17 — Assign stable keys after grouping declarations by named scope

**Because:** every overload must receive a normalized signature hash, while non-overloaded symbols keep readable bare keys and identical signatures need deterministic source-order suffixes

**Rejected:**

- suffix only later collisions as in the plan snippet — leaves the first overload bare and violates spec section 6.2

**Files:** src/adapters/typescript/symbols.ts

<!-- whyline-event: 27b7739d541f49e0ae41d8adbaf5e05e -->

## 2026-08-17 — Preserve the source name in aliased re-export records

**Because:** the export-map fixpoint must distinguish export { foo as bar } from a source that exports bar; exportedName alone loses that mapping

**Rejected:**

- set localName to null for every pure re-export as in the plan snippet — aliases cannot be linked to their source symbol

**Files:** src/adapters/types.ts, src/adapters/typescript/modules.ts

<!-- whyline-event: dd5868edd61c490eaeabe6a7ceeafb78 -->

## 2026-08-17 — Resolve bundled grammars relative to the parser module

**Because:** CodeGraph runs with the indexed repository as the process working directory, so cwd-relative lookup searches the target repo for CodeGraph's WASM asset

**Rejected:**

- resolve vendor from process.cwd() — works only when CodeGraph indexes its own checkout

**Files:** src/adapters/typescript/parser.ts

<!-- whyline-event: 31cd34cb0b4744f7996167d7a1c7fa2d -->

## 2026-08-17 — Route tsconfig loading and resolution probes through RepoBoundary

**Because:** config inheritance, path aliases, and package metadata all derive from caller-selected repository paths and must receive the same canonical containment and symlink checks as source reads

**Rejected:**

- call fs directly from tsconfig modules as in the plan snippet — creates a second unchecked repository read surface

**Files:** src/tsconfig/load.ts, src/tsconfig/resolve.ts

<!-- whyline-event: d8312bb312df47d48341829eaf192fe6 -->

## 2026-08-17 — Treat only canonical in-repo workspace package exports as internal

**Because:** node_modules must be readable for resolution but never indexed; following a workspace symlink to packages/ preserves that distinction while regular installed packages remain EXTERNAL

**Rejected:**

- classify any resolvable node_modules target as internal — indexes third-party declarations and violates FR-005

**Files:** src/tsconfig/resolve.ts

<!-- whyline-event: fd5ad90b69374fa3b41665fa66e33194 -->

## 2026-08-18 — Resolve oracle targets through tsc aliases and retain module-scope sources

**Because:** TypeScript reports imported identifiers as alias symbols, while CodeGraph intentionally does not mint symbols for anonymous callbacks; following aliases reaches owning declarations and a <module> source preserves otherwise valid fixture edges

**Rejected:**

- Use the plan snippet literally — barrel imports point at import declarations and anonymous-callback references are silently dropped

**Files:** bench/oracle/extract.ts, tests/fixtures/repos/small/src/auth/session.test.ts

<!-- whyline-event: 9015b4edd5bc44fa861af91766bfdb80 -->

## 2026-08-18 — Exclude fixture repositories from the host TypeScript project

**Because:** fixtures are compiler input with pinned nested tsconfigs, so checking them under CodeGraph's NodeNext config changes their semantics and produces irrelevant host-project errors

**Rejected:**

- Typecheck fixtures with the root project — ignores each fixture's own compiler configuration

**Files:** tsconfig.json

<!-- whyline-event: 141acebc87bf44b488fdb474c17694a1 -->

## 2026-08-18 — Treat unverified internal import bindings as unresolved

**Because:** an imported name absent from the linked export map has no proven owning declaration; preserving that state prevents a same-named global symbol from becoming a fabricated LEXICAL edge

**Rejected:**

- Fall back to the resolved module path — makes an unverified import look exact and can silently target an unrelated candidate

**Files:** src/link/imports.ts, src/resolve/resolver.ts

<!-- whyline-event: 4c6247c3e74242dea7816e7a2e150f36 -->

## 2026-08-18 — Rebuild the global graph atomically while accounting updates by content hash

**Because:** LINK and RESOLVE require every file's imports, exports, references, and symbols, but the current index schema does not persist reusable extraction results; re-extracting the corpus and replacing rows in one transaction preserves correctness while filesIndexed/filesSkipped still report actual content changes

**Rejected:**

- Extract and resolve only changed files — loses unchanged cross-file inputs and cannot re-attempt unresolved references soundly

**Files:** src/index/pipeline.ts

<!-- whyline-event: f9d67c8648da43e8a2b256d2696fad4b -->

## 2026-08-18 — Persist parse failures and distinguish lost-target lifecycle reasons

**Because:** failed files must remain visible with diagnostics but no symbols, and prior symbol locations let inbound references distinguish parse_failed, target_removed, and genuinely external targets

**Rejected:**

- Count parse warnings only and rely on cascade deletion — silently marks failed files healthy and erases inbound evidence

**Files:** src/index/pipeline.ts, src/resolve/resolver.ts, src/store/repos.ts

<!-- whyline-event: ae3a3aaf46f940c0b4d73d09dfdf4c1f -->

## 2026-08-18 — Add metadata-only discovery for stat-first drift checks

**Because:** reusing normal discovery would hash every source file on every tool call, while a metadata-only overload preserves ignore rules and repository-boundary enforcement without content reads; drift then hashes only stored mtime/size mismatches

**Rejected:**

- Call fs directly from drift.ts as in the plan snippet — violates the repository read boundary and duplicates discovery rules

**Files:** src/repo/discover.ts, src/index/drift.ts

<!-- whyline-event: 699da1fa613342d2bb1b0bd37ad2200f -->

## 2026-08-18 — Keep freshness partial while parse failures remain indexed

**Because:** zero filesystem drift does not make an index structurally complete when a file's symbols were dropped after parsing failed

**Rejected:**

- Report fresh whenever driftCount is zero — hides the persisted parse-failure state

**Files:** src/index/drift.ts, src/store/repos.ts

<!-- whyline-event: 535507717b1b47aab9893b97cc9a7003 -->

## 2026-08-19 — Keep CLI indexes in a canonical-root-keyed user cache and expose every resolution outcome in status

**Because:** the index is disposable derived data, and including EXTERNAL and UNRESOLVED alongside edge tiers makes degradation visible

**Rejected:**

- Store indexes in the target repository — violates the cache-location contract and risks polluting commits
- Report only tiers present in the edge table — hides external and unresolved references

**Files:** src/cli/main.ts

<!-- whyline-event: 066cda15a69645e7baf47d18b7a376a4 -->

## 2026-08-19 — Publish the oracle baseline by edge kind and evidence tier with reproducible fixture metadata

**Because:** spec section 10 requires tier-split accuracy and fixture config identification, while temporary benchmark databases keep generated index data out of fixture repositories

**Rejected:**

- Use the plan's kind-only report table — omits the authoritative spec's tier split
- Write .bench-index.sqlite inside each fixture — pollutes repository fixtures with disposable derived state

**Files:** bench/report.ts, ORACLE.md

<!-- whyline-event: ba61bc186dc0497698712815e011ab88 -->

## 2026-08-19 — Task 15 CLI and oracle report reviewed and committed

**Because:** all five subcommands (index/update/status/doctor/clean) match the brief's interfaces, status exposes EXTERNAL/UNRESOLVED alongside edge tiers per the prior whyline decision, bench:oracle produces a tier-split ORACLE.md from a temp-dir index rather than polluting the fixture repo, 106/106 tests pass, typecheck and build are clean

**Rejected:**

- Request further changes before commit — no correctness, security, or spec deviations found; test isolation (HOME override) and WAL-file cleanup in 'clean' are self-evident hygiene improvements over the plan's literal snippet, not risks

**Files:** src/cli/main.ts, bench/report.ts, tests/cli/cli.test.ts

<!-- whyline-event: c82e8ddfe3954dd197513be2b77f05f8 -->

## 2026-08-19 — Wrote Plan 2 of 3 (MCP surface) covering query/pack/mcp modules, CLI additions, and README

**Because:** spec DoD items 1-4 (npx index, 3 MCP tools, drift reporting, published oracle report) need the query/pack/mcp layers Plan 1 never built; splitting the 12-task benchmark into a separate Plan 3 keeps this plan to one coherent subsystem, confirmed with the human before writing

**Rejected:**

- One combined plan for MCP tools and the benchmark — benchmark needs fixture-repo selection (an open spec question) resolved first, and would bloat one document past useful review size
- Scope query_graph's imports_of/imported_by around the missing IMPORTS edge instead of fixing it — diverges from the spec's stated data model (§6) where IMPORTS is a stored edge like any other, and leaves file-level containment permanently unanswerable

**Files:** docs/superpowers/plans/2026-08-19-codegraph-mcp-surface.md

<!-- whyline-event: 2d10334fdeb74a1cb52b20dbe93a47f5 -->

## 2026-08-19 — Model each TypeScript file as an empty-scope symbol and derive file graph edges only from resolved bindings

**Because:** the file symbol gives top-level declarations and references a stable owner, while verified import bindings provide internal or external outcomes without guessing targets

**Rejected:**

- Special-case top-level references inside reference extraction — duplicates containment logic and leaves file-level graph queries without a node
- Create IMPORTS edges directly from raw specifier text — bypasses module resolution and risks fabricated internal targets

**Files:** src/adapters/typescript/index.ts, src/resolve/resolver.ts

<!-- whyline-event: 856f2101202d4a8caf347f80631a3e65 -->

## 2026-08-19 — Aligned the oracle's module-level sentinel with CodeGraph's new file symbol during Task 1 review

**Because:** regenerating ORACLE.md after Task 1 showed CALLS precision drop from 1.000 to 0.250 (3 new FPs, 0 new FNs); tracing it found the oracle's independent ancestry mapper used a literal '<module>' string for top-level references while CodeGraph's file symbol now uses the file's own repo-relative path as qualifiedName, so every newly-captured top-level CALLS/REFERENCES edge could never string-match oracle truth regardless of whether its target was correct — a measurement artifact, not a fabricated edge, confirmed by CALLS recall reaching 1.000 (was 0.500) once the sentinel matched

**Rejected:**

- Leave the oracle harness untouched and defer to Task 13 (README publishing) — would let a misleading precision regression sit in ORACLE.md with no diagnosis attached, undermining the project's 'publish honest numbers' differentiator for no benefit — the fix is one line and independently verifiable from tsc's own AST (rel(sf.fileName) was already computed on the same line for srcFile), so it does not reuse CodeGraph's resolution logic and doesn't compromise oracle independence (spec §10 Layer 2)

**Files:** bench/oracle/extract.ts, ORACLE.md

<!-- whyline-event: fc108dfa2bbb474bbe930e4ddd049cd9 -->

## 2026-08-19 — Use an external-content trigram FTS5 index synchronized by symbol triggers

**Because:** external content avoids duplicating symbol text, triggers keep cascade deletion atomic, and trigram tokenization lets human queries such as 'refresh session' match camelCase identifiers such as refreshSession

**Rejected:**

- Use FTS5's default unicode tokenizer from the plan snippet — treats refreshSession as one token, so the next task's documented human-word query returns no result
- Write FTS rows from Store methods — creates a second synchronization path and can drift on cascades or direct updates

**Files:** src/store/schema.sql, tests/store/store.test.ts

<!-- whyline-event: 39ba349e5b42495bb8e883ef93f651e1 -->

## 2026-08-19 — Read git state through argument-array git subprocesses pinned to the canonical repository root

**Because:** git provides revision and diff semantics without executing repository code, while converting subprocess failures to neutral values preserves the degrade-with-warning architecture for non-git directories and missing tooling

**Rejected:**

- Use shell command strings — permits shell interpretation of repository or revision inputs
- Add a git library dependency — duplicates installed git behavior and expands the dependency surface for two small read-only queries

**Files:** src/repo/git.ts

<!-- whyline-event: d385946b79694669b55555f65017c51a -->

## 2026-08-19 — Centralize canonical-root cache path resolution for CLI and MCP consumers

**Because:** a single indexPathFor implementation guarantees every surface hashes the same canonical repository root into the same disposable cache location

**Rejected:**

- Duplicate the hash logic in the future MCP server — small implementations can drift and create two indexes for one repository

**Files:** src/index/cache.ts, src/cli/main.ts

<!-- whyline-event: 4d471231853e464f85e81540ef09b30e -->

## 2026-08-19 — Normalize find-symbols text into literal trigram terms after exact-name lookup

**Because:** raw user text can contain FTS5 operators or punctuation such as Session.expire, while quoted word terms preserve the exact-qualified > exact-short > BM25 ranking and let human words match camelCase identifiers

**Rejected:**

- Pass query text directly to MATCH as in the plan snippet — qualified-name punctuation can raise FTS syntax errors and user operators can change query semantics
- Use SQL LIKE for path prefixes — percent and underscore in caller input become wildcards instead of literal repository path characters

**Files:** src/query/find.ts, tests/query/find.test.ts

<!-- whyline-event: c342444651f74acdb778391071038bd8 -->

## 2026-08-19 — Make unknown git state explicit rather than defaulting to clean

**Because:** gitState returned dirty:false whenever git could not be consulted, and changedFiles returned [] — both the unsafe direction, because freshness consumes them and a stale index would present itself as current. dirty is now boolean|null and changedFiles is string[]|null, so under strictNullChecks a consumer cannot read unknown as clean or iterate it as empty without narrowing, and Tasks 9-10 are compiler-forced to surface it in the envelope's warnings[] (spec §7.6). Found in review of Plan 2 Task 3; this is whyline's own defect #3 recurring, where blame_line swallowed 'git is broken' as 'no history'.

**Rejected:**

- Default to dirty — true on failure: needs no type change and fails toward assume-stale, but conflates 'definitely modified' with 'unknown' and would mark every non-git directory permanently dirty, which is its own wrong answer for a project that simply is not a git repo
- Keep dirty boolean and add a reason field — more self-describing, but dirty still holds a readable value when it is meaningless, so the silent-failure path stays reachable by a careless consumer
- Fix dirty only and leave changedFiles returning [] — same defect class in the same file, and half a fix would leave a caller deciding what to re-index skipping every file on a failed git read

**Files:** src/repo/git.ts

<!-- whyline-event: 41b9938887094f189af2500263154045 -->

## 2026-08-19 — Disclose in the generator why ORACLE.md's precision is structurally below 1.000

**Because:** The report published precision 0.667 with no account of its false positives, so a reader concludes a third of CodeGraph's edges are wrong. Both FPs in the fixture are explainable: ambiguous member calls deliberately emit every candidate as HEURISTIC (guessing one is forbidden by invariant 1), and constructor calls are modeled by CodeGraph but not by the oracle. It also now prints oracle/actual edge totals and the per-edge step, so the small-fixture caveat is data instead of prose.

**Rejected:**

- Edit ORACLE.md directly — the file is generated by bench/report.ts, so the disclosure would be destroyed by the next npm run bench:oracle — a correction that silently undoes itself
- Exclude constructor calls from CodeGraph's CALLS edges to raise precision — optimising the metric by removing true information; a constructor call is a real call, and the oracle's omission is the gap
- Say only 'small fixture, interpret with care' — the vaguer claim readers cannot check, where the actual counts let them compute the step themselves

**Files:** bench/report.ts

<!-- whyline-event: 4969c4b362bd4a7e8ad1bbbb404dab41 -->

## 2026-08-19 — Compute FAN_IN_P95 live from inbound usage edges only

**Because:** one grouped query is cheap at current scale, always reflects the current graph, and keeps CONTAINS/IMPORTS structure from distorting usage popularity

**Rejected:**

- Persist FAN_IN_P95 during indexing — adds schema and refresh bookkeeping for a value that is inexpensive to compute
- Count all edge kinds — file containment and imports measure structure rather than symbol usage and would flatten ranking signal

**Files:** src/query/rank.ts, tests/query/rank.test.ts

<!-- whyline-event: 7e2ee9e38a0247fdbb35b087a89e9f7c -->

## 2026-08-19 — Resolve graph seeds only when unambiguous and deduplicate neighbors before tier-first ranking

**Because:** choosing an arbitrary same-named symbol fabricates query intent, CALLS plus REFERENCES can describe the same neighbor, and the product contract requires COMPILER then LEXICAL then HEURISTIC before any within-tier score or global limit

**Rejected:**

- Use OR predicates with LIMIT 1 from the plan snippet — silently selects an arbitrary symbol when qualified or short names collide
- Order tiers alphabetically and limit raw edges — HEURISTIC sorts before LEXICAL and duplicate sites can consume the result budget

**Files:** src/query/traverse.ts, tests/query/traverse.test.ts

<!-- whyline-event: c004b7bcd3e24cfd961dfbd0b0108486 -->

## 2026-08-19 — Reuse rank.ts's USAGE_KINDS constant and cite spec §7.4/invariant 3 in traverse.ts's tier-priority sort

**Because:** code review of Task 7 found the fan-in subquery duplicated rank.ts's edge-kind list as a raw SQL literal, risking silent drift from fanInP95's baseline if USAGE_KINDS ever changes, and the tier-before-score sort lacked the inline citation AGENTS.md requires for non-obvious rules

**Files:** src/query/traverse.ts, src/query/rank.ts

<!-- whyline-event: 3c33e3b630064883acda27818769aa3d -->

## 2026-08-19 — Resolve impact seeds unambiguously and report only real traversal omissions as truncation

**Because:** impact analysis must not fabricate user intent from colliding names, unknown git state must remain visible, and exact depth or node boundary fits are complete results rather than silent or false cutoffs

**Rejected:**

- Bulk-match every qualified or short name — an ambiguous short name expands an arbitrary user target into multiple seeds
- Treat changedFiles null as an empty diff — hides git failure as no changes
- Mark truncation whenever a counter equals its limit — reports complete exact-fit traversals as partial without an omitted node

**Files:** src/query/impact.ts, tests/query/impact.test.ts

<!-- whyline-event: df95773d08a0476bbc25d9dbb1ec38f3 -->

## 2026-08-19 — Rank impact.ts's reverse-traversal neighbors by tier then score(), batched per BFS level, not alphabetically per edge

**Because:** code review of the already-committed Task 8 found the truncation order was tier-then-stable_key, so MAX_NODES/MAX_DEPTH cutoffs could silently drop a high fan-in/exported neighbor in favor of an alphabetically-earlier low-value one, violating invariant 3's tier-then-score sort guarantee that traverse.ts (Task 7) already honors; batching the per-frontier-node queries into one query per BFS level was needed to sort a whole level together and also cuts the DB round trips the 2s wall-clock budget has to cover

**Rejected:**

- Keep the per-id query loop and only add a JS sort inside it — cannot rank across an entire BFS level, since candidates from different frontier nodes never appear in the same array to sort together
- Move the MAX_DEPTH check back to the top of the while loop — reintroduces false truncation on an exact-depth-fit traversal whose last level has no further unvisited neighbors, contradicting the decision already recorded for this file

**Files:** src/query/impact.ts, src/query/rank.ts, src/query/traverse.ts, tests/query/impact.test.ts

<!-- whyline-event: 0d425b8b8af2451988ecc094ab1e6676 -->

## 2026-08-19 — Defer three Task 8 review findings as accepted, out-of-scope risks rather than fixing them now

**Because:** each is a real but narrow gap that would expand this review beyond Task 8's own files or duplicate low-risk code for marginal benefit: (1) the wall-clock budget starts after seed resolution, so a from_git_diff call touching hundreds of files is not itself time-boxed — narrow because the traversal loop's own comment only ever claimed the BFS is bounded, and seed counts are implicitly capped by realistic diff sizes; (2) changedFiles() (git diff --name-only HEAD) omits untracked new files from from_git_diff seeding — that gap lives in git.ts, already reviewed and committed separately in Task 3, and the plan itself already discloses the coarse, file-level (not line-precise) nature of git-diff seeding; (3) impact.ts's resolveSymbol/uniqueStableKey duplicate traverse.ts's resolveSymbolId/uniqueId almost line-for-line but return different shapes because ImpactResult carries warnings and TraverseResult does not — extracting a shared resolver now would mean re-touching Task 7's already-reviewed file for a non-correctness reason

**Rejected:**

- Fix all seven findings before committing — several require editing already-reviewed files (traverse.ts's resolver, git.ts's changedFiles) for reasons unrelated to Task 8's own correctness, well beyond what this review was scoped to touch

**Files:** src/query/impact.ts, src/repo/git.ts

<!-- whyline-event: 4cf9b852c6874cc294b2886d188fe344 -->

## 2026-08-19 — Require indexed body hashes for source verification and recheck drift after inline refresh

**Because:** readability alone cannot prove returned bytes match the indexed symbol, and an update can introduce a parse failure or race with another source change after the pre-refresh drift scan

**Rejected:**

- Treat a missing expected hash as verified — conflates reading current bytes with proving they are the indexed body
- Return refreshed immediately after updateRepo — can label a newly parse-failed or concurrently changed index complete

**Files:** src/pack/verify.ts, src/pack/refresh.ts, tests/pack/verify.test.ts, tests/pack/refresh.test.ts

<!-- whyline-event: b8d9769c5a44451fb34e0604138a63bf -->

## 2026-08-19 — Degrade verifySymbolBody on a TOCTOU read failure and exclude deleted paths from ensureFresh's verified list

**Because:** review of the already-committed Task 9 found two invariant-8 gaps: verifySymbolBody called boundary.readFile with no try/catch, so a file deleted or made unreadable between the repo-wide drift scan and a later per-symbol verify call would throw and abort every other symbol a caller was verifying in the same batch, instead of degrading just that one symbol; and ensureFresh's successful-refresh branch reported freshness.verified as the raw pre-refresh drift.driftedPaths list, which includes paths deleted during that same refresh — updateRepo correctly removes their file row, so nothing was verified there and listing them as verified would mislead a caller into treating a nonexistent file as a current source of truth

**Rejected:**

- Leave verifySymbolBody uncaught — matches the plan's literal snippet, but the plan's snippet also never validated byte ranges, which this file's own committed implementation had already correctly hardened past
- Report driftCount instead of a path list for verified — loses the per-file detail §7.6's envelope shape calls for; filtering by post-refresh file-row existence keeps the list but drops entries that are wrong instead of removing the whole field

**Files:** src/pack/verify.ts, src/pack/refresh.ts, tests/pack/verify.test.ts, tests/pack/refresh.test.ts

<!-- whyline-event: 125be6d7a4de4b7aaaf6134dad9b88c5 -->

## 2026-08-19 — Preserve unknown provenance and budget rendered structural impact responses honestly

**Because:** git failures must remain nullable and warned, tokenizer accounting must include rendered separators, impact responses must disclose unresolved and structural-test caveats, and ImpactRow has no byte range or body hash contract for safe source packing yet

**Rejected:**

- Coerce unknown git dirtiness to false — presents an unobserved worktree as clean
- Sum each section token count independently — omits separator tokenization and underreports the rendered payload
- Attach seed source bodies by ad hoc database queries — invents an output contract absent from ImpactRow and bypasses the planned verifySymbolBody seam

**Files:** src/pack/tokens.ts, src/pack/envelope.ts, src/pack/impactpack.ts, tests/pack/tokens.test.ts, tests/pack/envelope.test.ts, tests/pack/impactpack.test.ts

<!-- whyline-event: cda3283d64fc46288ad849e2ebd61086 -->

## 2026-08-19 — Keep MCP handlers thin while preserving query_graph's top-level evidence buckets

**Because:** all freshness, querying, and budgeting stays in existing library functions, but spec section 7.2 requires compiler/lexical/heuristic buckets at the tool response top level; shared envelope metadata still supplies nullable git provenance and downgrade warnings

**Rejected:**

- Nest query_graph under a generic results field — breaks the documented evidence-bucket response shape and existing client expectations
- Reimplement freshness or query SQL in MCP handlers — duplicates the tested pack and query layers and lets CLI/MCP behavior drift

**Files:** src/mcp/schemas.ts, src/mcp/server.ts, tests/mcp/server.test.ts

<!-- whyline-event: 39d52a9856c642aca66fcc41dcbad75c -->

## 2026-08-19 — Route CLI graph reads through the same freshness and packing contracts as MCP

**Because:** terminal users need the same drift detection, inline refresh, nullable provenance, and downgrade warnings as MCP clients; impact can delegate directly to packImpactResponse and search/query wrap the same pure query engines after ensureFresh

**Rejected:**

- Open the SQLite index directly as in the plan snippet — bypasses Guarantee B and lets CLI report stale structure while MCP refreshes it
- Test search with path before query — contradicts the documented search <query> [path] command signature

**Files:** src/cli/main.ts, tests/cli/cli.test.ts

<!-- whyline-event: 0aa519224e0a429d91caf970964b8095 -->

## 2026-08-19 — Publish the generated oracle report verbatim and qualify README guarantees to implemented behavior

**Because:** the README must expose current unflattering accuracy numbers without hand-copied drift, while source freshness is absolute only for bytes actually returned and TESTS edges are not yet produced

**Rejected:**

- Summarize or round the oracle table — hides per-tier false positives and breaks the spec requirement to publish the report
- Claim current test coverage relationships — tests_for is intentionally empty until TESTS-edge production lands

**Files:** README.md, ORACLE.md

<!-- whyline-event: 528ecc9aa9084fe28f400075ba32d778 -->

## 2026-08-19 — Estimate MCP/CLI response token counts from the indent:2 JSON actually transmitted, not a compact stringify

**Because:** review of the already-committed Tasks 10-13 found diagnostics.estimatedTokens for find_symbols and query_graph, and impactpack.ts's own per-row packing budget for get_impact_radius, were all measured against JSON.stringify(value) while jsonContent (mcp/server.ts) and emit (cli/main.ts) both transmit JSON.stringify(value, null, 2) — measured directly at ~50% understatement for representative payloads, far past the documented ±10% client-tokenizer tolerance (spec §7.5); for get_impact_radius this wasn't just a diagnostics inaccuracy but an actual budget-enforcement gap, since packToBudget's greedy inclusion decision is driven by that same understated text

**Rejected:**

- Leave diagnostics.estimatedTokens as a compact-JSON estimate — the ±10% tolerance spec §7.5 documents is meant to cover estimator-vs-client-tokenizer drift, not an avoidable serialization-format mismatch entirely under CodeGraph's own control
- Measure the full transmitted envelope including its own estimatedTokens field — self-referential (the field would have to describe its own size) and not what either flagged finding required to close the ~50% gap

**Files:** src/pack/tokens.ts, src/pack/impactpack.ts, src/mcp/server.ts, src/cli/main.ts, tests/pack/tokens.test.ts, tests/pack/impactpack.test.ts

<!-- whyline-event: 3520da9c173f43168353cedd4044f427 -->

## 2026-08-20 — Expose the selected impact edge tier on every affected row

**Because:** Phase 3 must score whether transitive impact evidence is compiler, lexical, or heuristic, and the traversal already selects and ranks that exact edge tier

**Rejected:**

- Infer tier later from viaKind or score — edge kind does not encode evidence quality and would fabricate benchmark utility

**Files:** src/query/impact.ts, tests/query/impact.test.ts

<!-- whyline-event: 465cf589b1924e4a8d4898ef025a1bcc -->

## 2026-08-20 — Use a purpose-built medium fixture with five hand-verifiable Notifier implementations

**Because:** the fixed benchmark categories need a wide interface, deep calls, synonym gaps, and real tests whose stable keys and ground truth remain deterministic without network access

**Rejected:**

- Clone an external repository — exact evidence and symbol identities would depend on network state and could not be hand-verified in the committed harness
- Use CodeGraph itself as the fixture — it has no interface with five implementations, so wide-interface tasks would be fabricated

**Files:** tests/fixtures/repos/medium/tsconfig.json, tests/harness/fixtures.test.ts

<!-- whyline-event: e7675a1c334b496f945f3e8d1badea29 -->

## 2026-08-20 — Separate deterministic task seeds, hand-verified ground truth, and live AgentTrace results in one benchmark contract

**Because:** Tasks 4-10 need a stable seam where CodeGraph queries and live agent transcripts can be scored into the same TaskResult without putting model execution into deterministic tests

**Rejected:**

- Use one untyped JSON result shape — loses exhaustiveness for traverse, impact, and find seeds and lets benchmark producers drift from scorers

**Files:** bench/harness/types.ts

<!-- whyline-event: ba86e81fc8a14d7c841d7e7cbca36eef -->

## 2026-08-20 — Validate every benchmark evidence key against the indexed fixture and model one explicit true negative

**Because:** hand-written ground truth must never cite nonexistent symbols, file symbols use an empty scope-chain key, and impact-retry-policy intentionally measures correct empty impact with recall 1

**Rejected:**

- Require non-empty evidence for all 12 tasks — contradicts the deliberate true-negative task and later scorer semantics
- Use ts — path#path for test files: violates the file-symbol stable-key contract ts:path# and would force false zero recall

**Files:** bench/harness/tasks.ts, tests/harness/tasks.test.ts

<!-- whyline-event: f6950b56fafb4385b91ad4e657b9a87e -->

## 2026-08-20 — Score deterministic CodeGraph retrieval with required-evidence recall and required-match tier utility

**Because:** recall must treat the explicit true negative as complete, while tier utility must measure only required evidence that was actually matched rather than being diluted by helpful, distractor, or supplementary graph nodes

**Rejected:**

- Divide tier utility by every returned node — penalizes useful supplementary context and contradicts the TaskResult contract
- Use process.cwd as the impact boundary — ignores each task's declared fixture and would make future fixture-specific reads unsafe or misleading

**Files:** bench/harness/codegraphRunner.ts, tests/harness/codegraphRunner.test.ts

<!-- whyline-event: f7e9a8fe33ca40a480989f9a1d53f3a6 -->

## 2026-08-20 — Aggregate benchmark results per baseline and exclude unmeasured tier utility from its mean

**Because:** agentic search and find-only CodeGraph tasks have no tier value, so treating null as zero would falsely depress utility; mixed baselines must also be rejected before publication

**Rejected:**

- Coerce null tier utility to zero — confuses unmeasured evidence with measured zero utility

**Files:** bench/harness/metrics.ts, tests/harness/metrics.test.ts

<!-- whyline-event: 9d2cfb3b0dc04d269b64dcc99cc8fa1e -->

## 2026-08-20 — Score agent traces by deterministic qualified-name containment and reject task-ID mismatches

**Because:** The published answer text remains directly auditable, while an explicit ID check prevents silently applying a trace to unrelated ground truth

**Rejected:**

- LLM judge — it would add nondeterminism, cost, and an unvalidated second model decision
- Semantic fuzzy matching — it would make benchmark scores harder to reproduce and audit

**Files:** bench/harness/traceScorer.ts

<!-- whyline-event: 50dd2e3cdf2c4e3f8a5f8874b1c33494 -->

## 2026-08-20 — Publish only complete baseline summaries and route trace reads through RepoBoundary

**Because:** A partial trace set must not look like a comparable 12-task mean, and benchmark trace paths are still caller-derived repository reads covered by the security boundary

**Rejected:**

- Aggregate any traces found — an interrupted run could publish a misleading partial baseline
- Read traces directly with node — fs: it violates the repository-read invariant

**Files:** bench/harness/report.ts

<!-- whyline-event: 66a37620c996499ca843e4e4e2075f5c -->

## 2026-08-20 — Require the freshness eval to prove inline refresh and verified paths, not merely a non-fresh state

**Because:** The DoD promises zero stale bytes and zero unreported drift; an ambiguous partial state would disclose drift but would not prove the eval mutation was successfully refreshed

**Rejected:**

- Assert only state is not fresh — that allows partial failures to pass without demonstrating refreshed data

**Files:** tests/harness/driftEval.test.ts

<!-- whyline-event: ed2cb3d78b6443ea841f3ac28f2a7dbe -->

## 2026-08-20 — Bound and sandbox the live baseline loop while keeping trace summaries source-free

**Because:** A live comparison must expose the intended grep/glob/read tools without following symlinks, silently accepting unsupported patterns, leaking read contents into summaries, or allowing an unbounded paid loop

**Rejected:**

- Copy the plan handlers verbatim — they can throw on escaping symlinks and glob ignores its requested pattern
- Record full tool results — read_file results would put fixture source into the trace summary

**Files:** bench/harness/runLiveBaseline.ts

<!-- whyline-event: 1f9ca28ef90b4aefaa29e585936a7ee2 -->

## 2026-08-20 — Make MCP client verification reproducible and leave external-client signoff explicitly manual

**Because:** The checklist must index the target, pass its root explicitly, and validate the actual seven-field envelope without claiming client runs that were not performed

**Rejected:**

- Use the proposed checklist verbatim — it omits indexing, depends on launch cwd, and incorrectly says the envelope has six fields
- Pre-fill client results from unit tests — the SDK in-memory transport is not Claude Code or MCP Inspector

**Files:** docs/mcp-client-verification.md

<!-- whyline-event: 3b3c4cbd95274547b6e967ff9aa5b8ed -->

## 2026-08-20 — Do not accept the Phase 3 benchmark scores until ground truth and scoring semantics are corrected

**Because:** The supposed nextDelay true negative has a real test caller, the four impact tasks do not score required depth-2 evidence, context budgets and distractors are unused, and substring matching produces demonstrated false-positive recall

**Rejected:**

- Accept the green harness tests — they validate task shape and evidence-symbol existence but not factual ground truth, depth, budget enforcement, or scorer precision

**Files:** bench/harness/tasks.ts, bench/harness/codegraphRunner.ts, bench/harness/traceScorer.ts, BENCHMARK.md

<!-- whyline-event: f9010e6d9b4944fc8f8e60d55db9b56f -->

## 2026-08-20 — Keep v0.1 DoD items 2 and 5 open after Phase 3 Tasks 1-11

**Because:** The committed report has no agentic baseline results and the MCP checklist explicitly says neither required external client run has been performed

**Rejected:**

- Count a PENDING report and an unsigned checklist as completed verification — neither satisfies the design's measured-baseline or two-client acceptance criteria

**Files:** BENCHMARK.md, docs/mcp-client-verification.md

<!-- whyline-event: de338c7229434f53bd9bde110d172bd4 -->

## 2026-08-20 — Remediate Phase 3 validity before spending on external acceptance

**Because:** Ground truth, depth selection, and scoring must be trustworthy before live model repetitions or client signoff can produce evidence worth publishing

**Rejected:**

- Run the live baseline first — it would spend budget against tasks already proven to score incorrect answers
- Patch only the failing examples — dead budgets and tautological tier utility are methodology defects requiring shared scoring changes

**Files:** docs/superpowers/plans/2026-08-21-codegraph-phase3-remediation.md

<!-- whyline-event: 313caca5093d473693ea29829bfa40ce -->

## 2026-08-20 — Model benchmark tasks as one or more explicit seeds and verify declared transitive depths against the indexed fixture

**Because:** Completeness may require multiple graph queries, and category labels are only credible when required evidence at depth two or greater is asserted against the graph rather than inferred from prose

**Rejected:**

- Keep one seed per task — the queue prompt asks for both enqueue writers and pending readers, which one callers_of query cannot answer
- Retain an empty true-negative — recall alone cannot distinguish a correct empty answer from an arbitrary wrong answer

**Files:** bench/harness/types.ts, bench/harness/tasks.ts, tests/harness/tasks.test.ts

<!-- whyline-event: 29f6a638441c4442b4596a250152ef63 -->

## 2026-08-20 — Score only budget-admitted evidence and define heuristic utility as marginal required recall

**Because:** Recall@k needs a real context bound, distractors and helpful evidence must affect auditable outputs, and the tier metric must vary with HEURISTIC evidence rather than count every non-compiler hit as automatically useful

**Rejected:**

- Keep unrestricted result scoring — maxContextBudgetTokens would remain dead data and large responses could buy recall
- Weight LEXICAL and HEURISTIC identically — with no COMPILER producer that makes tier utility tautologically one

**Files:** bench/harness/codegraphRunner.ts, bench/harness/metrics.ts, bench/harness/types.ts

<!-- whyline-event: 48d8ef2329cd40f7b0cea587cd3a3dad -->

## 2026-08-20 — Use identifier/path boundaries and a cumulative tool-result budget for agent traces

**Because:** Deterministic transcript scoring should not count start inside restart, and the live baseline must not exceed the same per-task evidence budget CodeGraph is scored under

**Rejected:**

- Retain case-insensitive substring matching — it produced a demonstrated false positive
- Limit only final answer tokens — unrestricted read_file results would still give the live agent unbounded repository context

**Files:** bench/harness/traceScorer.ts, bench/harness/runLiveBaseline.ts

<!-- whyline-event: a5d32495f17040b1af1913fe231bf03c -->

## 2026-08-20 — Validate every result and trace before publishing expanded benchmark methodology and outcomes

**Because:** A generated report must reject duplicate, missing, wrong-baseline, malformed, non-finite, inconsistent, or over-budget inputs before presenting means, and it must expose success, context, distractors, helpful hits, and tier contribution definitions beside the numbers

**Rejected:**

- Trust TypeScript types at the JSON boundary — trace files are runtime data and can bypass compile-time contracts
- Keep the compact legacy table — it hid the scoring proxy and made the tautological tier result hard to detect

**Files:** bench/harness/report.ts, bench/harness/traceScorer.ts, BENCHMARK.md

<!-- whyline-event: 961b38224cbe4eb1a84522e7273c10fe -->

## 2026-08-21 — Scope changed-file paths to a nested RepoBoundary

**Because:** MCP targets may be subdirectories of a larger Git worktree, and impact seeds must use the same root-relative paths as the index

**Rejected:**

- Return top-level Git paths and filter later — leaks repository-layout assumptions into every caller and failed to match indexed paths

**Files:** src/repo/git.ts

<!-- whyline-event: 438175b5ac9847cbae2a140d2e0c0033 -->

## 2026-08-21 — Accept the MCP surface after two independent-client passes

**Because:** Claude Code and MCP Inspector each exercised all three built tools and confirmed the envelope, tier buckets, and impact diagnostics against the same synthetic target

**Rejected:**

- Treat the automated SDK test as sufficient — spec section 12 explicitly requires Claude Code and another client

**Files:** docs/mcp-client-verification.md

<!-- whyline-event: 95ef9f6b06494b35a41df0b2b9261dec -->

## 2026-08-23 — Report over-budget agentic traces instead of discarding them

**Because:** the CodeGraph arm packs TO the budget so its recall already pays for truncation, while the agentic arm is unconstrained; discarding over-budget traces kept the baseline's recall unconstrained and measured the two arms asymmetrically in the baseline's favour

**Rejected:**

- raise the task budgets until the baseline fits — rigs the benchmark in the opposite direction and abandons the minimum-sufficient-context premise
- keep throwing on over-budget traces — discards a real answer and reports it as an error, losing the recall information entirely

**Files:** bench/harness/traceScorer.ts

<!-- whyline-event: 7c4331409bed4f0f8a2a477ae4569c07 -->

## 2026-08-23 — Drive the agentic baseline with Claude Code headless on a subscription rather than the Anthropic API SDK

**Because:** spec section 10 Layer 3 asks for a strong agentic loop and Claude Code is the alternative developers actually use, so it is a more honest bar than a hand-rolled three-tool harness, and it removes per-token billing from the benchmark

**Rejected:**

- the existing @anthropic-ai/sdk path — bills per token, and re-running after any CodeGraph change means paying twice
- a local or weaker model — a weak baseline inflates CodeGraph's apparent value

**Files:** bench/harness/claudeCodeBaseline.ts

<!-- whyline-event: 9ebfbc82945146288117cc9009873422 -->

## 2026-08-23 — Score both benchmark arms with a single shared evidence matcher

**Because:** the CodeGraph arm required exact stable-key membership while the agentic arm substring-matched prose, so the two published columns measured different things and structurally favoured the verbose arm; a more precise CodeGraph answer scored zero while naming a path in prose scored full marks

**Rejected:**

- hold both arms to exact stable-key matching — agents emit prose, not stable keys, so it would crater the baseline artificially
- leave the asymmetry and disclose it — an incomparable headline number is not rescued by a footnote

**Files:** bench/harness/evidenceMatch.ts

<!-- whyline-event: 4fe7de03a48b4ee4bc6dd3fefcf16443 -->

## 2026-08-23 — Cap heuristic candidate fan-out at 8 and record the overflow as too_ambiguous

**Because:** on a real 19k-line repository the uncapped fan-out produced 354291 edges from 9031 symbols, 73 percent heuristic noise, with the symbol get drawing 1338 inbound edges because every .get() call linked to every symbol named get; an edge at confidence 1/1338 is not evidence and asserting it violates the spirit of invariant 1

**Rejected:**

- keep all edges and filter at query time — the index still carries 300k edges and every consumer must remember to filter
- leave it and document that heuristic edges on common names are low value — ships a graph that is 73 percent noise

**Files:** src/resolve/tiers.ts

<!-- whyline-event: 029a9f52d2bd4899b845791d12c8b193 -->

## 2026-08-23 — Benchmark against a pinned real repository rather than only a hand-written fixture

**Because:** the 198-line medium fixture is about 1400 tokens, so the agentic baseline read all of it, which cannot test whether structural retrieval beats exhaustive reading; the large fixture exposed the fan-out explosion, the TSX parse failures, and the interface-method impact gap, none of which were visible at 198 lines

**Rejected:**

- generate a large synthetic fixture — predictable naming makes grep easier than in real code and reviewers discount self-authored corpora

**Files:** bench/harness/tasksLarge.ts

<!-- whyline-event: 026ba72ea19d4366a6e07abb2c4dee1c -->
