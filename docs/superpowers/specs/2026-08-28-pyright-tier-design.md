# Sonde — pyright-backed `COMPILER` tier for Python — Design

**Status:** Approved for planning
**Date:** 2026-08-28
**Relates to:** `2026-08-25-python-adapter-design.md` (the tree-sitter tier that
failed its gate, §11), `2026-08-16-sonde-design.md` (base design)
**Feasibility evidence:** `probes/pyright-feasibility/FINDINGS.md`
**Gate to re-run, unchanged:** `probes/python-placement/PROTOCOL.md`

---

## 1. Purpose

The tree-sitter Python adapter is built, tested, and **not registered**: it
measured 62.81% unresolved on agentdock and 57.39% on pydantic against a 30%
ceiling fixed before measurement. That result is recorded, and the reviewer note
in `probes/python-placement/FINDINGS.md` shows arithmetically that a builtin
classifier cannot rescue it — on pydantic, the 10,276 unresolved references that
provably are *not* builtins already exceed the 9,018 ceiling a PASS would allow.

The gate's own protocol names the consequence: *"FAIL: Python needs
compiler-grade evidence."* This document specifies that evidence.

The tree-sitter work is not wasted. It remains the zero-setup default and the
substrate this pass promotes: extraction, linking, symbol keys, and the fixture
all stay. What changes is that references the heuristics could not place get
answered by a real type checker.

## 2. Feasibility, already measured

A spike ran before this design existed, because LSP throughput could have made
the whole approach unusable and no amount of design would have revealed that.
Full record in `probes/pyright-feasibility/FINDINGS.md`. The three results that
shaped what follows:

| Finding | Consequence for this design |
|---|---|
| ~210 definition requests/sec, **flat across client concurrency 1, 8, and 32** | No batching, no worker pool. A serial session is already optimal, so §3 can use the simplest possible execution model. |
| pyright is a TypeScript program bundling typeshed; **no Python interpreter required** | The tier needs nothing from the target repository, preserving invariant 5 / SEC-008 exactly as bundling `typescript` does. |
| Definition returned for 84.9% (agentdock) / 65.5% (pydantic) of sampled call sites | Strong enough to justify building. **Not** a predicted gate result — see §8.2. |

The measured serial throughput is not a limitation to engineer around. It is the
reason this design is small.

## 3. Architecture: an in-process async LSP client

### 3.1 A correction to an earlier draft of this design

An earlier draft specified a synchronous **bridge child process**, on the stated
grounds that `indexRepo` was synchronous and making it async would ripple
through the CLI, the MCP server, and the tests.

**That premise was wrong**, and it was caught while writing the implementation
plan against the real source. `run` is declared `async`
(`src/index/pipeline.ts:42`), it already `await`s (line 62), and both
`indexRepo` and `updateRepo` return `Promise<IndexStats>` (lines 224, 231). The
pipeline has always been async. No caller needs to change.

The correction is recorded rather than quietly edited, because the discarded
design was not merely unnecessary — it was actively worse, and the reason is
worth keeping.

### 3.2 Why the bridge was worse, not just redundant

Pyright runs as a separate OS process **either way**: `pyright-langserver` is a
subprocess whichever side of the boundary the client sits on. The bridge
therefore added a *second* Node process whose entire job was relaying JSON
between the pass and the language server.

That relay carried real costs, all of which disappear by deleting it:

| Bridge cost | Status once the client is in-process |
|---|---|
| Extra process spawn per pass (~120 ms measured init) | Gone |
| Double serialisation of every query and result | Gone |
| `execFileSync`'s 1 MB default `maxBuffer` silently truncating pydantic's several-MB response | Not applicable — no stdout channel to overrun |
| Resolving the bridge's own path, differing between `dist/*.js` and `src/*.ts` under vitest | Not applicable — it is an ordinary import |

Three of the four risks originally listed in §11 existed only to manage a
process that did not need to exist.

### 3.3 The design

`runPyrightPass(root, store)` is `async`. It spawns `pyright-langserver
--stdio` directly, speaks JSON-RPC over its pipes, issues one
`textDocument/definition` request per query **serially**, and kills the server
when finished.

```
runPyrightPass (async, in-process)
  spawn pyright-langserver --stdio
  initialize / initialized
  didOpen × files
  definition × N        (serial — concurrency was measured to buy nothing)
  kill
```

Serial issue is not a simplification to revisit later. The spike measured
throughput flat at ~210 req/s across client concurrency 1, 8, and 32, with
latency rising in proportion; a scheduler would add complexity and return
nothing.

### 3.4 Client contract

Internal to the pass, so no cross-process wire format is needed:

```ts
interface DefinitionQuery { file: string; line: number; character: number; }
interface DefinitionTarget { file: string; line: number; character: number; }
```

Positions are LSP-native (0-based line and character). A query answers `null`
when pyright returns no definition — a real answer, recorded as such, never
treated as a failure.

Two constraints survive the redesign:

- **A timeout is mandatory.** Pyright can stall on a pathological file. Bound
  the whole session and kill the server on expiry, degrading with a warning
  (§6) rather than hanging an index.
- **The server must always be killed**, including on the error path, or a
  failed index leaves an orphaned language server holding memory.

### 3.5 Which references are queried

Both `UNRESOLVED` and `HEURISTIC` references, not `UNRESOLVED` alone.

The spike's verdict framed unresolved-only as the viable scope, on cost grounds.
That framing optimised for the gate rather than for the graph. `HEURISTIC`
member access — `obj.method()` — is precisely where a type checker contributes
most, and each ambiguous reference currently emits up to `AMBIGUITY_CAP` (8)
edges, all but one of which is wrong by construction. Replacing them with a
single `COMPILER` edge is a large precision gain that the gate's placement
metric would not even show.

Measured cost of that choice, at 210 req/s:

| Corpus | `UNRESOLVED` only | `UNRESOLVED` + `HEURISTIC` |
|---|---:|---:|
| agentdock | 6.7 s | 9.2 s |
| pydantic | 135 s | 195 s |

Sixty extra seconds on a 436-file repository, for an opt-in pass, in exchange
for replacing tens of thousands of guesses with resolved edges. `LEXICAL`
references are not re-queried: they already carry mechanical evidence, and
spending time to re-derive them would be the exact cost the table above rejects.

## 4. Position recovery and key mapping

### 4.1 Positions without a schema change

`ReferenceRecord` carries `siteLine` but no column, and LSP needs a character
offset. Rather than adding `siteColumn` to the shared type — which would touch
every adapter for one language's benefit — the pass re-parses each Python file
with the already-bundled tree-sitter grammar and reuses `extractPythonReferences`
to recover exact positions.

This mirrors `runCompilerPass`, which re-derives references from source rather
than reading stored ones, and it guarantees the pass and the index agree about
what constitutes a reference. If they ever disagree, that is a bug in one of
them, not a mismatch to paper over.

### 4.2 Definition → stable key

Pyright returns a file and a range. Sonde keys symbols as
`py:{relpath}#{scope_chain}`. `declarationToStableKey` in
`src/resolve/symbolMapping.ts` solves this for TypeScript — find the innermost
symbol whose span contains a position — but it is TypeScript-only: it takes a
`ts.Declaration` and a `CompilerContext`. Python needs its own mapper following
the same approach, not a reuse of that function.

A definition whose target file lies outside the repository root does not map to
a key at all. It is `EXTERNAL` (§5.2).

## 5. Tiers

### 5.1 Assignment

Results of this pass are `COMPILER` tier, which outranks `LEXICAL` and
`HEURISTIC` unconditionally (invariant 3). Confidence does not enter into it:
tier beats score.

A reference the pass queries has three outcomes:

| Pyright result | Outcome |
|---|---|
| Definition inside the repository | `COMPILER` edge to the mapped stable key |
| Definition outside the repository | `EXTERNAL`, attributed to the owning package or `typeshed` |
| No definition | Unchanged — the prior tier stands, including `UNRESOLVED` |

The third row matters. A pass that downgraded references pyright could not
answer would destroy information the tree-sitter tier legitimately had.

### 5.2 The builtin gap closes as a side effect

The failed gate's largest measurement flaw was that `len`, `str`, `isinstance`,
and `range` scored `UNRESOLVED`: builtins are never imported, so §5.4 of the
prior design had no module name to classify and no table to consult.

Pyright resolves them to typeshed's `builtins.pyi`, which is outside the
repository root and therefore `EXTERNAL` by the rule already stated above. No
builtin table is written, and none is maintained. The ~533 (agentdock) and
~10,569 (pydantic) builtin references identified in the failed gate's sampled
causes get classified correctly because the general rule covers them.

This is worth stating precisely because the alternative — hand-curating a
builtin list — was the obvious move and would have been worse: another table to
drift, for a subset of what this rule already handles.

### 5.3 No repository environment is consulted

Pyright is not given a `pythonPath` or `venvPath`. Without one it resolves
third-party imports through bundled typeshed stubs, which yields `EXTERNAL` —
the correct classification — while never reading the target repository's virtual
environment or executing anything in it (invariant 5, SEC-008).

Pointing pyright at a project venv would improve third-party *attribution*, not
placement, and is deliberately out of scope (§10).

## 6. Degradation

Invariant 8 governs every failure here. The pass is a promotion over an index
that is already committed and usable, so nothing it does may invalidate the
tree-sitter graph.

| Failure | Behaviour |
|---|---|
| Language server fails to start or exits early | Warning in the envelope; index stands, `compilerUpgraded` is null |
| Session timeout | Warning naming the timeout and the query count; server killed; index stands |
| Malformed JSON-RPC response | Hard failure with a warning — **never** a partial result silently accepted |
| Pyright returns no definition for a reference | Not a failure; the prior tier stands |

The existing `CompilerUnavailable` pattern in `src/resolve/compilerPass.ts` is
the model. The predecessor tool this project replaces failed by exiting 127 in
silence for months; every row above exists so that cannot recur.

## 7. Dependency

`pyright@1.1.413` ships as a **hard dependency**, matching how `typescript` is
bundled today.

**Accepted cost:** ~19 MB added to every install, including TypeScript-only
users who will never invoke it — roughly a 35% increase on the current
dependency tree (`typescript` 23 MB, `better-sqlite3` 26 MB, `web-tree-sitter`
5.7 MB).

**Rejected:** an optional or peer dependency with visible degradation. It would
keep the default install lean and is well supported by invariant 8, but it puts
a manual install step in front of exactly the users this feature exists for, and
`--resolve` silently doing less is the friction `sonde init` was built to
remove. Recorded here because the tradeoff is real and may be worth revisiting
if install size becomes a complaint.

Bundling also preserves invariant 5 by construction: Sonde never loads a
type checker from the target repository, in either language.

## 8. The gate

### 8.1 Same thresholds, unchanged

Re-run against `probes/python-placement/PROTOCOL.md` exactly as committed:
PASS at `UNRESOLVED` ≤ 30% **and** placed ≥ 70%, over in-repository references
with `EXTERNAL` excluded from the denominator. Same corpora — agentdock and
pydantic. Worse corpus wins; no averaging.

No threshold may be adjusted after seeing a result. This is a second attempt at
a bar that has already been published, not a new bar.

### 8.2 What the spike does not predict

The spike's 65–85% definition-hit rate is **not** a forecast of the gate result,
and must not be reported as one. It sampled regex-identified call sites rather
than Sonde's extracted reference set, and many returned definitions point into
typeshed — correctly `EXTERNAL`, which is excluded from the gate denominator and
could move the measured share substantially in either direction.

Only a fresh measurement is authoritative. That is the same discipline Swift's
findings imposed on their own retroactive estimate.

### 8.3 Registration remains conditional

Python is registered in `src/adapters/registry.ts`, and `.py` / `.pyi` are added
to the default allowlist in `src/repo/discover.ts`, **only** on a PASS. Both
changes land in one commit, because either alone is a silent no-op: the registry
decides which adapter handles a file, discovery decides whether the file is ever
offered to one.

On a FAIL or MARGINAL, Python stays unregistered and `sonde init` continues to
report zero indexed files for Python repositories.

## 9. File structure

```
src/resolve/
  pyrightPass.ts      async runPyrightPass(root, store) — mirrors compilerPass.ts
  pyrightClient.ts    the LSP client: spawn, JSON-RPC framing, definition, kill
src/adapters/python/
  (unchanged — this pass consumes the existing extractor)
```

`pyrightClient.ts` is an ordinary module, imported normally. Nothing about it
needs special build treatment, which is one of the costs the discarded bridge
design carried (§3.2).

## 10. Out of scope

- **Venv-aware third-party attribution.** Improves package naming, not
  placement (§5.3).
- **Incremental re-query.** A full-repository pass is the v1. Restricting
  queries to changed files on `sonde update` is an obvious later optimisation
  and is not required to answer the gate.
- **Extending the bridge to other languages.** Nothing here is Python-specific
  in principle, but generalising before a second consumer exists is speculation.

## 11. Known risks

| Risk | Handling |
|---|---|
| Pyright stalls on a pathological file | Mandatory bounded session timeout; kill the server and degrade with a warning (§6) |
| A thrown error leaves an orphaned language server | The kill must live in a `finally`, not only on the success path (§3.4) |
| Pyright version drift changes definition behaviour | Pinned exact version; the version is read from the installed package and stored alongside the index, as `TSC_VERSION` already is |
| The pass makes the gate pass while producing wrong edges | Placement is not correctness. The gate measures placement only; this limitation is already disclosed in the README and stays disclosed |
