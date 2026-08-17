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
