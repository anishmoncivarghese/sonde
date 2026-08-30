# Sonde — `sonde doc`, deterministic architecture documentation — Design

**Status:** Approved for planning
**Date:** 2026-08-30
**Relates to:** `2026-08-16-sonde-design.md` (base design; `spec §N` refers to it)

---

## 1. Purpose

Sonde knows a repository's structure precisely enough to answer *who calls this*
and *what breaks if I change it*. Only an agent can see that today. A human
opening the repository sees the same directory listing they always did.

`sonde doc` renders the graph as documentation a person can read: what the
modules are, how they depend on each other, and what each one exposes.

### 1.1 The precedent that makes this risky

`code-review-graph` — the predecessor documented in `spec §2` — shipped **wiki
generation**, and the conclusion drawn from its failure was that *"breadth hid
the decay. With twenty tools and six subsystems, nothing obviously pointed at
'your index is empty.'"*

So this feature is one the predecessor had, and it was part of the surface area
that made its rot invisible. Generated architecture docs are usually worthless
for exactly one reason: they are a snapshot, the code moves, and a stale
document is worse than none because people trust it.

Sonde has an answer no other generator has. It already tracks drift. A document
that **reports its own staleness** is a direct extension of invariant 8 rather
than a bolt-on, and §4 makes that the load-bearing property of the format.

## 2. Scope

**In scope.** A deterministic generator producing a module-level Markdown
document from the graph, plus the CLI surface to write, print, or verify it.

**Explicitly deferred, not rejected.** An LLM prose layer. Sonde's credibility
rests on never guessing; piping the graph to a model that writes narrative
attaches a fabrication surface to the one artifact most likely to be read and
trusted. Facts first, prose later as an opt-in clearly marked as generated.
Requiring an API key would also falsify the README's "No account or hosted
service is required."

**Rejected.** An agent-facing compact overview. The measured benchmark already
shows Sonde answering structural questions in 1 tool call against agentic
search's 8, so the headroom is small and the audience is users who do not yet
exist.

## 3. The module model

### 3.1 A module is a source file's immediate parent directory

Mechanical, language-agnostic, needs no configuration. Measured against real
repositories: this repository yields 16 modules, which is readable. A flat
project collapses to one or two — correctly, because a flat project has no
module structure to draw.

Deliberately not: package manifests (absent in most languages), a configurable
depth (a knob needing defence), or heuristic clustering (a guess, forbidden by
invariant 1 in the one artifact people trust most).

### 3.2 Dependencies are aggregated, and carry their evidence

For each ordered pair of modules, the generator counts the underlying symbol
edges grouped by tier:

```
src/cli → src/store    412 edges  (COMPILER 380, LEXICAL 32)
src/pack → src/query    18 edges  (HEURISTIC 18)
```

The first is resolved fact. The second is inference, and the document says so:
rendered dashed in the diagram, annotated in the table.

This is what makes aggregation safe. A single heuristic edge between two modules
is weak evidence; fifty is strong, because even when each individual target is
uncertain, fifty references in one module landing on candidates in another is
real evidence of coupling. Carrying the counts lets a reader judge that instead
of trusting an undifferentiated arrow.

It matters concretely. Measured on this repository:

| | `LEXICAL` | `HEURISTIC` | `COMPILER` |
|---|---:|---:|---:|
| default | 5,664 | **5,227** | — |
| `--resolve` | 3,886 | 4,270 | 6,883 |

Without `--resolve`, roughly **48% of edges are heuristic**. A diagram drawing
those as plain arrows would publish inference as fact.

### 3.3 Public surface is derived from edges, not the `export` keyword

A module's surface is the set of its symbols referenced from **outside** it.

This scales: it is bounded by actual coupling rather than declaration count, so
a large repository does not produce thousands of lines. It is also more
meaningful — a change to it is a real architectural change, not someone adding
an unused helper.

**Known limitation, disclosed rather than hidden.** For a library, symbols
exported but never referenced internally are still the real contract with
consumers, and this definition omits them. The committed document is about
*internal architecture*; a package's external API is a different document and is
out of scope (§9).

### 3.4 Two invariants bind the output directly

- **Invariant 7** — `TESTS` edges are always `HEURISTIC`, and *every surface
  exposing them must say so*. If the document shows test relationships, that
  label is mandatory.
- **Invariant 8** — the header must carry the tier composition, so a reader can
  tell whether they hold a `--resolve` document or a mostly-heuristic one.

## 4. The document contract

### 4.1 Determinism is the load-bearing property

The generator MUST produce a byte-identical file when run twice against an
unchanged repository. Everything else in this section follows from that.

**Stamp the commit SHA, never wall-clock time.** A header reading
`Generated 2026-08-30T13:04Z` changes on every run, produces a spurious diff
every time, and within a month everyone adds the file to `.gitignore`. A header
reading `Describes commit a063ac6` is stable *and* more useful, because Sonde
can then report that the working tree has moved past it.

Concretely this requires: stable sort on every list (by module path, then symbol
name), no timestamps in the body, no absolute paths, and no iteration order that
depends on a hash map.

### 4.2 The freshness stamp must not lie

`gitState` returns `revision: string | null` and `dirty: boolean | null`, both
deliberately nullable with an invariant-8 warning attached. The stamp handles
all three cases explicitly:

| Git state | Stamp |
|---|---|
| Clean worktree at a revision | `Describes commit <sha>` |
| Dirty worktree | `Describes commit <sha> plus uncommitted changes` |
| `revision` is `null` | `Describes an unversioned working tree` |

A dirty worktree that stamped only the SHA would claim to describe a commit it
does not describe. That is the failure this whole feature is built against.

### 4.3 Committed coarse, generated fine

The committed document carries the **module layer only**: the module list,
the dependency graph, and each module's cross-module surface. Adding a module is
a real architectural event, so the diff is rare and worth reading in review.

Symbol-level detail is **generated on demand** and never committed. It churns
constantly, would be unreadable on a large repository, and has little re-read
value — you want it while asking a specific question, and then you want it
current rather than as of the last commit.

The committed document *points at* the command for detail rather than embedding
it.

This is not a new principle. `AGENTS.md` already states it for a different
artifact: *"stable rules are written in the handover file; volatile state is
pointed to, never copied, because a hand-maintained status section goes stale
and then actively misleads."* That split held across the Python work.

## 5. CLI surface

One generator, three sinks:

| Command | Behaviour |
|---|---|
| `sonde doc [path]` | Writes the module document to `ARCHITECTURE.md` |
| `sonde doc --stdout` | Prints it; writes nothing |
| `sonde doc --check` | Regenerates, compares, exits non-zero if it differs |
| `sonde doc --module <path>` | Prints symbol-level detail for one module; never written to disk |

`--check` is what makes the committed file self-policing in CI, and it is only
possible because of §4.1. It is specified now and may be implemented last.

### 5.1 Never clobber a file Sonde did not write

`sonde init` already solved this problem for `.mcp.json`: it refuses to
overwrite a file it cannot safely account for, and reports instead of guessing.
The same discipline applies.

The generated file carries a marker line identifying it as Sonde-generated. On
write:

- File absent → create.
- File present with the marker → overwrite.
- File present **without** the marker → refuse, report the path, and suggest
  `--stdout`. Someone's hand-written architecture document is not Sonde's to
  replace.

### 5.2 Merge conflicts resolve by regenerating

A deterministic generated file still conflicts when two branches both
regenerate it. The resolution is `sonde doc`, not hand-merging. The README must
say so, because the alternative is people hand-editing a generated file.

## 6. Failure and degradation

The document is derived from an index that may be absent, stale, or partial.
Invariant 8 governs each case, and none may produce a confidently wrong page.

| Condition | Behaviour |
|---|---|
| No index for the repository | Refuse with a message naming `sonde index` |
| Index has drifted | Generate, and state the drift in the header |
| Files with `parse_state` of `partial` or `failed` | Generate, and name the count in the header |
| Repository has no resolvable modules | Refuse rather than write an empty document |
| Git unavailable | Stamp per §4.2's third row; never omit the stamp |

## 7. File structure

```
src/doc/
  modules.ts     derive modules from file paths; aggregate edges by tier
  render.ts      ModuleGraph → Markdown (pure; no I/O, no store access)
  index.ts       the generator entry point and the marker constant
```

New store read queries live in `src/store/repos.ts` beside the existing ones.
`render.ts` is pure over a plain data structure, which is what allows the
determinism requirement in §4.1 to be tested directly rather than through the
filesystem.

This mirrors `src/pack/` and `src/query/`, which are likewise separate concerns
over the same store.

## 8. Testing

TDD per project convention: failing test first, real fixtures, no mocks.

The tests that decide correctness rather than merely exercising the renderer:

- **Determinism.** Rendering the same `ModuleGraph` twice is byte-identical, and
  the output does not change when input arrays are shuffled.
- **Evidence is carried.** A dependency backed only by `HEURISTIC` edges renders
  differently from one backed by `COMPILER` edges (§3.2).
- **The `TESTS` disclosure appears** wherever test relationships do (invariant 7).
- **Freshness honesty.** A dirty worktree does not stamp a bare SHA; a
  repository with no revision still gets a stamp (§4.2).
- **Refusal to clobber.** An `ARCHITECTURE.md` without the marker is not
  overwritten, and the exit is non-zero with the path named (§5.1).
- **`--check`** exits zero on a current file and non-zero on a stale one.

## 9. Out of scope

- **The LLM prose layer** (§2), deferred deliberately.
- **A package's external API document.** §3.3 covers internal coupling; the
  contract a published package offers consumers is a different artifact.
- **Cross-repository or multi-root documentation.**
- **Rendering anything but Markdown.** GitHub renders mermaid natively, which is
  the only viewer that matters for a committed file.

## 10. Known risks

| Risk | Handling |
|---|---|
| Generated file becomes a merge-conflict magnet | Determinism (§4.1) makes regeneration the resolution; documented in §5.2 |
| A large repository produces an unreadable document | Module layer only, and surface derived from coupling rather than declarations (§3.3) |
| Readers mistake heuristic arrows for facts | Evidence counts and dashed rendering (§3.2); tier composition in the header |
| Non-deterministic output creates diff noise on every run | Explicitly tested (§8), not merely intended |
| The document rots the way the predecessor's wiki did | The freshness stamp is in the header, and `--check` fails CI (§5) |
