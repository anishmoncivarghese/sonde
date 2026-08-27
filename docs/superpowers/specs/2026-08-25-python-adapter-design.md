# Sonde — Python language adapter — Design

**Status:** Built and measured — **gate FAILED**. The adapter exists, is tested,
and is deliberately **not registered**. See §11 before proposing changes here.
**Date:** 2026-08-25 (outcome recorded 2026-08-28)
**Relates to:** `2026-08-16-sonde-design.md` (the base design; section numbers
cited as `spec §N` refer to that document)
**Precedent:** `probes/swift-narrowing/FINDINGS.md` (the Swift adapter's gate,
whose thresholds and methodology this document deliberately reuses)

---

## 1. Purpose and motivating case

Sonde indexes TypeScript and Swift. Pointed at a Python repository it reports
`indexed 0 files` — correct behaviour, and useless.

The motivating case is concrete: `~/agentdock`, a real 55-file Python project
(package name `whyline`, `src/` layout, `requires-python >=3.11`), returns
exactly that. It is the decision-recording tool this project's own `AGENTS.md`
depends on, so the gap is not hypothetical.

This document specifies a Python `LanguageAdapter` and, critically, the
**pre-committed measurement gate** that decides whether it ships at all.

## 2. Scope

**In scope.** A tree-sitter-based Python adapter producing symbols and
references at the same tiers the existing adapters produce, wired through the
existing `link/` and `resolve/` pipeline unchanged.

**Explicitly deferred, not rejected.** A pyright-backed `COMPILER` tier — the
direct analog of TypeScript's `--resolve` pass. It is the right eventual shape
and is deliberately sequenced *after* this work, because the gate in §6 exists
to answer whether the zero-setup tier is good enough on its own. Answering that
first is what makes a later compiler tier an accuracy upgrade rather than a
crutch compensating for an unmeasured foundation.

**Rejected.** A symbols-only adapter (`find_symbols` works, no cross-file
edges). It would make `sonde init` print a non-zero file count while
`query_graph` and `get_impact_radius` — the actual product — stayed broken.
That trades an honest zero for a misleading number.

## 3. Why Python is closer to TypeScript than to Swift

Swift needed narrowing *rules* because member lookup has no static resolution
without a real compiler: `view.frame` carries no evidence about which `frame`
it reaches.

Python's import statements are explicit and mechanically parseable —
`import x`, `from x import y`, `from x import y as z` — which is the same class
of evidence a TypeScript import binding provides. That single fact is why this
adapter is expected to place references through import bindings rather than
lean on heuristics, and why the gate in §6 is expected to pass more comfortably
than Swift's did.

The parts of Python that *are* dynamic — attribute access, `getattr`,
`importlib` — get the same treatment they get everywhere else in this system:
`HEURISTIC` or `UNRESOLVED` with a reason, never a guess (invariant 1).

## 4. Extraction (pure)

`extract(path, bytes)` does no I/O, no database access, and no cross-file
lookups (invariant 4). It records import *statements* as binding facts and
never resolves a module name to a file.

### 4.1 Symbols

| Construct | Symbol |
|---|---|
| `function_definition` at module level | function |
| `function_definition` inside `class_definition` | method |
| `function_definition` inside a function | nested function |
| `class_definition` | class |
| Module-level assignment | module variable |

Stable keys follow invariant 9: `py:{relpath}#{scope_chain}`, e.g.
`py:src/whyline/cli.py#Runner.run`. The file-level symbol is `py:{relpath}#`,
which module-level references attribute to — the same fallback the TypeScript
adapter and (after the `enclosingKey` fix) the compiler pass both use.

### 4.2 References

Calls (`foo()`, `obj.foo()`), type references in annotations (`x: Foo`,
`-> Foo`), decorators (`@foo`, `@app.route`), and base classes
(`class Bar(Foo)` → `EXTENDS`).

### 4.3 Import binding facts

Recorded verbatim, resolved later:

| Statement | Binding recorded |
|---|---|
| `import os` | `os` → module `os` |
| `import os.path` | `os` → module `os` |
| `import numpy as np` | `np` → module `numpy` |
| `from .foo import Bar` | `Bar` → symbol `Bar` in module `.foo` |
| `from ..pkg.mod import Baz as Q` | `Q` → symbol `Baz` in module `..pkg.mod` |
| `from x import *` | star import from `x` — unresolvable in extract |

## 5. Resolution and tiers

### 5.1 Tier assignment

| Reference shape | Tier | Rationale |
|---|---|---|
| Bare `foo()` via lexical scope or import binding | `LEXICAL` | Explicit mechanical evidence, same class as a TS import binding |
| `obj.foo()` | `HEURISTIC` | Attribute access requires type inference (invariant 2) |
| `self.foo()` / `cls.foo()` inside class `C` | `HEURISTIC`, candidates narrowed to `C` + resolvable bases | Narrowing raises confidence, **never** tier |
| Import target outside the repository | `EXTERNAL` | Stdlib table, or no repo file for the module |
| `getattr`, `importlib.import_module` | `UNRESOLVED` + reason | Genuinely dynamic; guessing violates invariant 1 |
| More than `AMBIGUITY_CAP` candidates | `UNRESOLVED` + reason | Existing behaviour, unchanged |

The `self.` / `cls.` rule is the analog of Swift's rule 3 (explicit receiver
annotation). It is worth stating that it **remains `HEURISTIC`**: knowing the
receiver's class narrows the candidate set, but it is not type inference and
must not be dressed as resolution.

### 5.2 Package roots are derived, not configured

Walk up from any directory containing `__init__.py` until reaching one that
does not; that directory is an import root. This resolves `src/` layout
automatically — which the motivating corpus requires (`src/whyline/`) — with no
`pyproject.toml` parsing, no `sys.path` emulation, and no execution of
repository code (invariant 5, SEC-008).

### 5.3 Module resolution lives in `link/`

Relative imports (dot-level counting from the containing package), absolute
imports against derived roots, and `__init__.py` re-export chains are
cross-file work and extend `src/link/`. Re-export chains resolve transitively
with a depth cap so that an import cycle terminates rather than hangs.

Star imports resolve through the target module's `__all__` when it defines one,
and through its module-level public names otherwise. A star import from an
external module is `EXTERNAL`.

### 5.4 `EXTERNAL` is built from day one

This is the explicit lesson of `probes/swift-narrowing/FINDINGS.md`. Swift's
first gate recorded **FAIL at 65.09% unresolved** purely because standard
library and SDK references had nowhere to go but `UNRESOLVED`. With `EXTERNAL`
classified correctly, the same corpus measured **PASS at 25.16%**. The
methodology error, not the language, produced the failure.

Python's evidence here is stronger than Swift's curated table ever was: CPython
publishes `sys.stdlib_module_names` as a fixed frozenset. It is vendored as a
static list (union of 3.11–3.13, source version recorded in the file) rather
than computed at runtime, because computing it would mean executing a Python
interpreter.

Classification:

- Top-level module name in the vendored stdlib table → `EXTERNAL` (stdlib)
- Top-level module name resolving to no repository file → `EXTERNAL`
  (third-party)

This mirrors TypeScript's treatment of `node_modules` (spec §4.4).

## 6. The gate

### 6.1 Thresholds

Identical to Swift's, and reused rather than invented so that the bar cannot be
accused of having been set to fit Python:

- **PASS:** `UNRESOLVED` ≤ 30% **and** `LEXICAL + HEURISTIC` ≥ 70%
- **MARGINAL:** `UNRESOLVED` 31–50% → record, stop, report to the human
- **FAIL:** `UNRESOLVED` > 50% → Python requires compiler-grade evidence (§2's
  deferred pyright tier); record and stop

Measured over **in-repository references only**, with `EXTERNAL` excluded from
the denominator — the corrected methodology from Swift's second run, and the
same treatment TypeScript gives `node_modules`.

**No threshold may be adjusted after seeing a result.**

### 6.2 Two process rules

1. **Thresholds are committed in their own commit, before the measurement
   runs.** Swift did this (`04c316b`); it is what makes the rule above
   enforceable rather than aspirational.
2. **The adapter is not registered in `src/adapters/registry.ts` until the gate
   passes.** Build extraction and linking, measure on the probe, then route it.
   On FAIL, Python stays unregistered and `sonde init` continues to honestly
   report 0 files rather than shipping a graph that is not trusted.

### 6.3 Corpus

| Corpus | Size | Role |
|---|---|---|
| `~/agentdock` | 55 `.py` files | The real motivating case; `src/` layout |
| `pydantic` | 435 `.py` files | Primary signal; heavy type-hint usage exercises typed-import resolution |

For scale reference, Swift's gate ran on 376 files / 39,136 lines, so `pydantic`
is a comparable corpus rather than a token second sample.

`pydantic` was selected after measuring candidates rather than by reputation.
`httpx` was the initial choice and was discarded on inspection: it holds 60
`.py` files in total (23 in the package itself), which is close enough to
`~/agentdock`'s 55 that it would not have added an independent signal. Counts
at selection time: `requests` 37, `httpx` 60, `flask` 83, `pydantic` 435,
`django` 2,929.

`pydantic` is fetched by a pinned, checksummed script mirroring
`scripts/fetch-bench-fixture.mjs`, not committed into this repository.

### 6.4 What this gate does not measure

It measures **placement** — whether a reference found candidates — not
**correctness** — whether the target was right.

TypeScript has `ORACLE.md`, scored against `tsc`. Swift shipped on placement
alone because no oracle existed for it. Python is in Swift's position: a real
oracle requires pyright, which is the deferred work in §2.

Consequence, and it is a requirement rather than a footnote: the README's Known
Limitations must state that Python edges are **not verified against a type
checker**. A PASS here must not be allowed to imply more than it measured
(invariant 8).

## 7. File structure

```
src/adapters/python/
  parser.ts       grammar load; shares ensureTreeSitterRuntime()
  symbols.ts      functions, classes, module vars → scope chains, stable keys
  references.ts   calls, attribute access, annotations, decorators, bases
  modules.ts      import statements → binding facts (pure, no resolution)
  stdlib.ts       vendored sys.stdlib_module_names table
  index.ts        the LanguageAdapter object
```

`scripts/fetch-grammars.mjs` gains a pinned, checksummed
`tree-sitter-python.wasm` entry sourced from `tree-sitter-wasms@0.1.12` — the
package already supplying the TypeScript grammar, so no new supply chain is
introduced. Verified available at design time (476,105 bytes):

```
https://unpkg.com/tree-sitter-wasms@0.1.12/out/tree-sitter-python.wasm
sha256 9056d0fb0c337810d019fae350e8167786119da98f0f282aceae7ab89ee8253b
```

`parser.ts` must call `ensureTreeSitterRuntime()` rather than `Parser.init()`
directly. That shared singleton exists because concurrent `Parser.init()` calls
from independent adapters corrupt module-level WASM runtime state; a repository
containing both Python and TypeScript would otherwise hit the race.

## 8. Testing

TDD per the project's conventions: failing test first, real fixtures, no mocks.

A new `tests/fixtures/repos/python-small` covers the cases that decide
correctness rather than merely exercising the parser:

- relative imports at one and two dot levels
- `src/` layout package-root derivation
- `__init__.py` re-export chains
- `self.method()` candidate narrowing (asserting the tier stays `HEURISTIC`)
- a star import, both with and without `__all__`
- a deliberately dynamic `getattr` call that **must** emit `UNRESOLVED` with a
  reason — asserting that it is not silently dropped and not guessed

## 9. Sequencing

1. Grammar fetch entry + `parser.ts`
2. `symbols.ts`
3. `references.ts`
4. `modules.ts` + `link/` module resolution
5. `probes/python-placement/PROTOCOL.md` — thresholds, committed alone
6. Measure; write `FINDINGS.md`
7. **Gate**
8. On PASS only: register in `registry.ts`, README Known Limitations
   (including §6.4's disclosure), CHANGELOG entry

## 10. Known risks

| Risk | Handling |
|---|---|
| Star imports without `__all__` inflate candidate sets | Public module-level names only; over `AMBIGUITY_CAP` becomes `UNRESOLVED`, not a guess |
| Import cycles in re-export chains | Depth cap; terminates rather than hangs |
| Decorator-heavy frameworks (`@app.route`) resolve poorly | Attribute access is `HEURISTIC` by invariant 2; this is expected, not a defect |
| Vendored stdlib list drifts across Python versions | Union of 3.11–3.13 with source version recorded; a missing name degrades to `UNRESOLVED`, never to a wrong edge |
| Placement PASS is read as correctness | §6.4 disclosure is a shipping requirement, not optional |

---

## 11. Outcome — the gate failed, 2026-08-28

The plan in `docs/superpowers/plans/2026-08-25-python-adapter.md` was executed
through Task 10. The adapter is built and tested; the gate in §6 said no, so
Task 11 (registration) never ran.

| Corpus | Files | Unresolved | Placed | Verdict |
|---|---:|---:|---:|---|
| `~/agentdock` | 56 | 62.81% | 37.19% | FAIL |
| `pydantic` | 441 | 57.39% | 42.61% | FAIL |

Both are far above the 30% ceiling fixed in `9b44c9f` before any number
existed. Full record, sampled unresolved causes, and raw output:
`probes/python-placement/FINDINGS.md`.

### What ships and what does not

- `src/adapters/python/` exists, is unit-tested, and is **absent from
  `src/adapters/registry.ts`**.
- `.py` / `.pyi` remain **absent from the default allowlist in
  `src/repo/discover.ts`**, so nothing reaches the adapter in production.
- `sonde init` continues to report `indexed 0 files` on a Python repository.
  That is the correct behaviour, not an outstanding bug: an honest zero beats a
  graph whose edges are wrong more often than right.

### Do not re-litigate this with a builtin table

Two defects in **this document** were found during execution and are recorded
here so they are not rediscovered as if they were news:

1. **§5.4 forgot builtins.** It derived `EXTERNAL` from the stdlib *module*
   table and from "no repository file for this module". Python builtins —
   `len`, `str`, `isinstance`, `range` — are never imported, so they have no
   module to classify and were counted `UNRESOLVED`. This is the same category
   of methodology error that produced Swift's false FAIL.
2. **The FAIL survives that error anyway.** PASS requires
   `unresolved <= (0.3 / 0.7) * placed`. On pydantic the unresolved references
   that provably are *not* builtins — `too_ambiguous`, `unexported_import`,
   `binding_target_missing`, 10,276 in total — already exceed the 9,018
   ceiling. A builtin is by definition a zero-candidate bare identifier, so no
   builtin table, however complete, can reach PASS there. The arithmetic is in
   the reviewer note appended to `FINDINGS.md`.

Fixing the builtin gap would make the reported *number* more honest. It cannot
change the *decision*. Anyone proposing to re-run the gate should read that
reviewer note first and say what it gets wrong.

### The open question worth pursuing

`unexported_import` accounted for 13.55% of pydantic's unresolved references
(3,839). The hypothesis — untested — is that pydantic resolves its public API
through a `__getattr__` lazy-import table in `__init__.py`, which no static
export map can follow. If that is right it is a property of an unusually
dynamic corpus rather than of Python, and a less metaprogramming-heavy corpus
would score better. It would not change the verdict, because the protocol takes
the worse corpus, but it would sharpen what the zero-setup tier actually costs.

### Recommended next step

The pyright-backed `COMPILER` tier deferred in §2 — the direct analog of
TypeScript's `--resolve`. This result is the evidence that it is a requirement
for Python rather than an optional accuracy upgrade, which is precisely what
running the gate first was meant to establish.
