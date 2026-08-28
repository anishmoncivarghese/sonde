# Python placement findings

Measured 2026-08-28 against the thresholds committed alone in `9b44c9f`.
Each gate corpus was measured once after a smoke run on the repository's small
Python fixture. No adapter code or threshold was changed after either corpus
number was observed.

## Method

The probe discovers `.py` and `.pyi` files through `discover()`'s explicit
extension override, extracts them with the unregistered `pythonAdapter`, builds
the production export map, binds imports through `resolveForFile`, and invokes
the production resolver.

The gate counts each extracted reference once. It deliberately does not count
`resolveAll.edges` directly: that array also contains structural `IMPORTS`,
`CONTAINS`, and derived `IMPLEMENTS` edges, and one ambiguous reference emits
one edge per candidate. Raw edge counting would therefore bias placement
toward PASS. The probe assigns each reference with the same `SymbolTable`,
`bindImports`, `narrowCandidates`, and `assignTier` components used by
`resolveAll`, then requires a matching disposition in the production resolver
output. A disagreement aborts the probe rather than publishing a number.

`EXTERNAL` is reported in the complete distribution but excluded from the gate
denominator. `COMPILER` remains zero because the pyright tier is explicitly
deferred.

## Corpora

| Corpus | Commit | Python files | Parse-error files | References |
|---|---|---:|---:|---:|
| agentdock | `ea9d1ac3ca08aef29acd724b2abbd410f7925632` | 56 | 0 | 2,951 |
| pydantic | `965c23dd93bd5ca7b86224ba39ccbe79399f117b` | 441 | 1 | 71,726 |

The counts differ slightly from the design-time estimates of 55 and 435 files.
The exact measured commits and discovered counts above are authoritative for
this run. agentdock had an unrelated untracked `.mcp.json`; it is not a Python
source file and was not read by the probe. pydantic was a clean shallow clone.

## Tier distribution

### agentdock

| Tier | Count | Share of all | Gate share |
|---|---:|---:|---:|
| `COMPILER` | 0 | 0.00% | 0.00% |
| `LEXICAL` | 293 | 9.93% | 13.14% |
| `HEURISTIC` | 536 | 18.16% | 24.05% |
| `EXTERNAL` | 722 | 24.47% | — |
| `UNRESOLVED` | 1,400 | 47.44% | **62.81%** |
| **Placed** | **829** | **28.09%** | **37.19%** |

Gate denominator: 2,229 in-repository references.

### pydantic

| Tier | Count | Share of all | Gate share |
|---|---:|---:|---:|
| `COMPILER` | 0 | 0.00% | 0.00% |
| `LEXICAL` | 8,320 | 11.60% | 16.85% |
| `HEURISTIC` | 12,722 | 17.74% | 25.76% |
| `EXTERNAL` | 22,343 | 31.15% | — |
| `UNRESOLVED` | 28,341 | 39.51% | **57.39%** |
| **Placed** | **21,042** | **29.34%** | **42.61%** |

Gate denominator: 49,383 in-repository references.

## Sampled unresolved causes

These causes come from the resolver's recorded reason and name rows; they were
sampled from the measurement output rather than inferred from language
reputation.

### agentdock

| Reason | Count | Share of unresolved |
|---|---:|---:|
| `no_candidate` | 1,329 | 94.93% |
| `unexported_import` | 71 | 5.07% |

The most frequent unresolved names include Python builtins (`str`, `len`,
`print`, `int`, `dict`, `list`, `isinstance`, `setattr`, `bool`, `range`,
`sorted`, `tuple`, `SystemExit`) and member calls whose receiver needs type
information (`mkdir`, `write_text`, `read_text`, `strip`, `join`, `exists`,
`touch`, `splitlines`, `startswith`, `add_argument`, `assertEqual`). The former
shows a measurement-hygiene gap: bare Python builtins have no import binding and
are currently counted as `UNRESOLVED` rather than `EXTERNAL`. The latter is the
expected limit of the zero-setup tier: identifying `Path.mkdir` or an argparse
method requires receiver-type evidence.

### pydantic

| Reason | Count | Share of unresolved |
|---|---:|---:|
| `no_candidate` | 18,065 | 63.74% |
| `too_ambiguous` | 6,294 | 22.21% |
| `unexported_import` | 3,839 | 13.55% |
| `binding_target_missing` | 143 | 0.50% |

The most frequent names again include builtins (`str`, `int`, `isinstance`,
`list`, `bool`, `float`, `classmethod`, `repr`, `range`, `tuple`, `property`,
`frozenset`, `getattr`, `hasattr`). The corpus also exposes genuine ambiguity
and linking pressure through repeated project/test names (`BaseModel`, `Model`,
`Field`, `TypeAdapter`, `ConfigDict`, `Foo`) and decorator/member vocabulary
(`parametrize`, `benchmark`, `field_validator`, `append`, `skipif`,
`model_validator`, `field_serializer`).

The builtin classification gap means this placement result should not be read
as proof that every unresolved reference requires compiler-grade inference.
It does not change the committed gate result: both corpora remain far above the
30% unresolved ceiling, and the sample also contains substantial ambiguity,
unexported bindings, and receiver-dependent member calls.

## Verdict: FAIL

The fixed PASS threshold requires `UNRESOLVED <= 30%` and placed references
`>= 70%` on every corpus. agentdock measured **62.81% unresolved / 37.19%
placed**; pydantic measured **57.39% unresolved / 42.61% placed**. Both are
FAIL, so the worse verdict is unambiguously **FAIL** without averaging.

Task 11 does not run. Python remains absent from `src/adapters/registry.ts`,
the default discovery allowlist remains unchanged, and `sonde init` continues
to report zero indexed files for Python-only repositories. Per design §2 and
the pre-committed protocol, the recommended next accuracy tier is pyright-backed
`COMPILER` evidence. A future re-measurement should also classify bare Python
builtins explicitly so that the external denominator is as honest as the Swift
gate's corrected methodology.

## Raw outputs

### agentdock

```json
{
  "repo": "../agentdock",
  "files": 56,
  "parseErrorFiles": 0,
  "references": 2951,
  "COMPILER": 0,
  "LEXICAL": 293,
  "HEURISTIC": 536,
  "EXTERNAL": 722,
  "UNRESOLVED": 1400,
  "unresolved": 1400,
  "inRepoReferences": 2229,
  "unresolvedShare": 62.81,
  "placedShare": 37.19,
  "verdict": "FAIL",
  "unresolvedByReason": {
    "no_candidate": 1329,
    "unexported_import": 71
  },
  "topUnresolvedNames": [
    {
      "name": "str",
      "count": 127
    },
    {
      "name": "len",
      "count": 88
    },
    {
      "name": "mkdir",
      "count": 66
    },
    {
      "name": "add_argument",
      "count": 64
    },
    {
      "name": "write_text",
      "count": 63
    },
    {
      "name": "print",
      "count": 60
    },
    {
      "name": "read_text",
      "count": 54
    },
    {
      "name": "int",
      "count": 53
    },
    {
      "name": "dict",
      "count": 45
    },
    {
      "name": "strip",
      "count": 43
    },
    {
      "name": "join",
      "count": 34
    },
    {
      "name": "list",
      "count": 34
    },
    {
      "name": "exists",
      "count": 33
    },
    {
      "name": "touch",
      "count": 33
    },
    {
      "name": "isinstance",
      "count": 26
    },
    {
      "name": "setattr",
      "count": 22
    },
    {
      "name": "one_line",
      "count": 21
    },
    {
      "name": "splitlines",
      "count": 20
    },
    {
      "name": "bool",
      "count": 19
    },
    {
      "name": "startswith",
      "count": 19
    },
    {
      "name": "range",
      "count": 18
    },
    {
      "name": "count",
      "count": 17
    },
    {
      "name": "split",
      "count": 17
    },
    {
      "name": "group",
      "count": 15
    },
    {
      "name": "replace",
      "count": 14
    },
    {
      "name": "sorted",
      "count": 14
    },
    {
      "name": "tuple",
      "count": 14
    },
    {
      "name": "SystemExit",
      "count": 13
    },
    {
      "name": "add_parser",
      "count": 11
    },
    {
      "name": "assertEqual",
      "count": 10
    }
  ]
}
```

### pydantic

```json
{
  "repo": "../../../private/tmp/sonde-corpora/pydantic",
  "files": 441,
  "parseErrorFiles": 1,
  "references": 71726,
  "COMPILER": 0,
  "LEXICAL": 8320,
  "HEURISTIC": 12722,
  "EXTERNAL": 22343,
  "UNRESOLVED": 28341,
  "unresolved": 28341,
  "inRepoReferences": 49383,
  "unresolvedShare": 57.39,
  "placedShare": 42.61,
  "verdict": "FAIL",
  "unresolvedByReason": {
    "no_candidate": 18065,
    "too_ambiguous": 6294,
    "unexported_import": 3839,
    "binding_target_missing": 143
  },
  "topUnresolvedNames": [
    {
      "name": "str",
      "count": 3184
    },
    {
      "name": "BaseModel",
      "count": 2546
    },
    {
      "name": "int",
      "count": 2477
    },
    {
      "name": "parametrize",
      "count": 1853
    },
    {
      "name": "isinstance",
      "count": 1294
    },
    {
      "name": "Model",
      "count": 1134
    },
    {
      "name": "Field",
      "count": 913
    },
    {
      "name": "list",
      "count": 704
    },
    {
      "name": "bool",
      "count": 592
    },
    {
      "name": "benchmark",
      "count": 557
    },
    {
      "name": "TypeAdapter",
      "count": 509
    },
    {
      "name": "classmethod",
      "count": 491
    },
    {
      "name": "ConfigDict",
      "count": 449
    },
    {
      "name": "float",
      "count": 440
    },
    {
      "name": "field_validator",
      "count": 348
    },
    {
      "name": "append",
      "count": 307
    },
    {
      "name": "repr",
      "count": 290
    },
    {
      "name": "skipif",
      "count": 238
    },
    {
      "name": "getattr",
      "count": 228
    },
    {
      "name": "T",
      "count": 209
    },
    {
      "name": "range",
      "count": 204
    },
    {
      "name": "Foo",
      "count": 195
    },
    {
      "name": "tuple",
      "count": 194
    },
    {
      "name": "MyModel",
      "count": 186
    },
    {
      "name": "property",
      "count": 186
    },
    {
      "name": "frozenset",
      "count": 155
    },
    {
      "name": "foo",
      "count": 152
    },
    {
      "name": "model_validator",
      "count": 147
    },
    {
      "name": "field_serializer",
      "count": 138
    },
    {
      "name": "hasattr",
      "count": 130
    }
  ]
}
```

---

## Reviewer note: the builtin gap does not explain the FAIL — 2026-08-28

Added after scoring, by a reviewer independent of the implementer. It follows
`probes/swift-narrowing/FINDINGS.md`'s convention: the recorded verdict above is
**not** re-scored here, and no threshold is touched.

Swift's first gate recorded FAIL at 65.09% and was later shown to be a
methodology artifact — SDK references had nowhere to go but `UNRESOLVED`, and a
correct `EXTERNAL` classifier turned the same corpus into a PASS at 25.16%. The
builtin gap identified above is the same *category* of error, so the obvious
question is whether this FAIL is the same kind of artifact.

It is not, and that can be settled arithmetically rather than by re-running.

PASS requires `UNRESOLVED <= 30%` of the in-repository denominator, and `placed`
is unaffected by reclassifying an unresolved reference as `EXTERNAL` (it leaves
the numerator and the denominator together). So the ceiling is
`u_max = (0.3 / 0.7) * placed`.

| Corpus | Placed | Unresolved | `u_max` for PASS | Unresolved that **cannot** be builtins | PASS reachable? |
|---|---:|---:|---:|---:|---|
| agentdock | 829 | 1,400 | 355 | 71 | reachable in principle |
| pydantic | 21,042 | 28,341 | 9,018 | 10,276 | **arithmetically impossible** |

The final column counts unresolved references whose recorded reason proves they
were *not* zero-candidate lookups — `too_ambiguous` (6,294),
`unexported_import` (3,839), and `binding_target_missing` (143). A builtin is by
definition a zero-candidate bare identifier, so none of these can be recovered
by any builtin table however complete.

On pydantic that residue alone is 10,276, already above the 9,018 ceiling.
**Even a perfect builtin classifier cannot produce a PASS there.** agentdock is
reachable only in the degenerate case where essentially every one of its 1,329
zero-candidate references is external, which the sampled names contradict:
`mkdir`, `write_text`, `read_text`, `add_argument`, `splitlines`, and
`assertEqual` are receiver-dependent member calls, not builtins, and resolving
them needs the type evidence the zero-setup tier does not have.

The protocol takes the worse corpus without averaging, so the FAIL stands on
pydantic regardless of what a corrected agentdock run would show.

**What is still worth fixing, and why it is not a re-scoring exercise.** The
builtin gap makes the *number* dishonest even though it does not change the
*decision*: a reference to `len` is genuinely external, and counting it as
unresolved overstates how much of Python is beyond reach. Any future
re-measurement should classify builtins before reporting a share. Separately,
pydantic's 3,839 `unexported_import` results (13.55% of its unresolved) deserve
investigation before they are attributed to the language: pydantic's
`__init__.py` resolves its public names through a `__getattr__` lazy-import
table, which no static export map can follow, but that is a hypothesis about an
unusually dynamic corpus rather than a measured cause.

Neither item changes the recommendation. The zero-setup tier does not clear the
bar on real Python, and the next accuracy tier is pyright-backed `COMPILER`
evidence as design §2 anticipated.

---

## Pyright tier re-measurement — 2026-08-28

This is the Task 6 re-measurement against the thresholds already fixed in
`PROTOCOL.md`. No threshold was changed after either result was seen. Both
corpora are the same commits as the tree-sitter-only run:
`ea9d1ac3ca08aef29acd724b2abbd410f7925632` for agentdock and
`965c23dd93bd5ca7b86224ba39ccbe79399f117b` for pydantic.

### Corrected counting method

The three placed tiers are **distinct reference-site proxies**, never raw edge
counts. For each of `COMPILER`, `LEXICAL`, and `HEURISTIC`, the probe calls
`Store.countReferenceSites()`, which counts distinct
`(src_symbol_id, site_line, kind)` tuples for only `CALLS`, `REFERENCES`,
`IMPLEMENTS`, and `INHERITS`. This excludes structural `CONTAINS`, `IMPORTS`,
and `TESTS` edges and collapses heuristic ambiguity fan-out. `UNRESOLVED`
remains `Store.countUnresolved()`. `EXTERNAL` is excluded from the denominator.

This is a per-reference-site proxy, not the original probe's direct iteration
over every extracted `ReferenceRecord`: multiple same-kind references on one
source line collapse. That is why the `references` totals below should not be
compared as raw extraction totals to the earlier 2,951 / 71,726 figures. The
gate shares are comparable at the intended placement level, and they avoid the
known false-PASS bias of counting structural and ambiguity edges.

Python was enabled in `registry.ts` and default discovery only in the working
tree for these runs, then both edits were reversed before this record was
committed. Python remains unregistered.

### Measurement interruptions and workaround

The first pydantic attempt failed before pyright ran: production indexing hit
`UNIQUE constraint failed: symbol.stable_key`. The corpus contains 88 repeated
Python stable keys, primarily overloads, property accessors, and deliberate
same-scope redefinitions. For measurement only, symbol insertion temporarily
used `INSERT OR IGNORE`, collapsing declarations that already share one stable
identity to a single store row. That edit was also reversed before commit. The
agentdock corpus was rerun under the same setup and produced identical output.

The next pydantic attempt reached pyright but returned unavailable with the
WebAssembly error `Aborted(). Build with -sASSERTIONS for more info.`. Task 4
was reparsing a target file for every answer until the tree-sitter runtime was
exhausted. The pass was fixed to cache one exact declaration-line map per
target file and release parse trees (`c389896`); focused tests passed, and both
corpora were rerun. The failed query was never classified as `EXTERNAL` and no
failed attempt was scored.

The temporary duplicate collapse is a real registration warning, not a hidden
production fix: registering Python as-is would still make pydantic indexing
fail. Placement passed, but stable-key collision handling must be fixed and
tested before registration is safe.

### Tier distributions

#### agentdock

| Tier | Count | Share of proxy total | Gate share |
|---|---:|---:|---:|
| `COMPILER` | 234 | 7.74% | 27.46% |
| `LEXICAL` | 287 | 9.49% | 33.69% |
| `HEURISTIC` | 101 | 3.34% | 11.85% |
| `EXTERNAL` | 2,171 | 71.82% | — |
| `UNRESOLVED` | 230 | 7.61% | **27.00%** |
| **Placed** | **622** | **20.58%** | **73.00%** |

Gate denominator: 852 in-repository reference-site proxies. Verdict: **PASS**.

#### pydantic

| Tier | Count | Share of proxy total | Gate share |
|---|---:|---:|---:|
| `COMPILER` | 13,794 | 20.04% | 45.77% |
| `LEXICAL` | 6,593 | 9.58% | 21.88% |
| `HEURISTIC` | 4,501 | 6.54% | 14.93% |
| `EXTERNAL` | 38,700 | 56.22% | — |
| `UNRESOLVED` | 5,250 | 7.63% | **17.42%** |
| **Placed** | **24,888** | **36.15%** | **82.58%** |

Gate denominator: 30,138 in-repository reference-site proxies. Verdict:
**PASS**.

### Comparison with tree-sitter only

| Corpus | Tree-sitter unresolved | Pyright unresolved | Change | Tree-sitter placed | Pyright placed | Verdict |
|---|---:|---:|---:|---:|---:|---|
| agentdock | 62.81% | **27.00%** | -35.81 pp | 37.19% | **73.00%** | PASS |
| pydantic | 57.39% | **17.42%** | -39.97 pp | 42.61% | **82.58%** | PASS |

The worse corpus is agentdock at 27.00% unresolved / 73.00% placed. The fixed
gate requires at most 30% unresolved and at least 70% placed, so the overall
placement verdict is **PASS** without averaging.

### EXTERNAL evidence and name-wide deletion bias

Pyright added 1,295 EXTERNAL rows on agentdock, all attributed to its bundled
typeshed. It added 14,419 on pydantic, of which 14,388 were attributed to
typeshed. This confirms the predicted builtin/standard-library classification
path in design §5.2 rather than assuming those references are in-repository.

`deleteUnresolvedFor` deletes by `(source symbol, name)`, not by reference site.
The pass counted 33 extra unresolved rows cleared on agentdock and 1,386 on
pydantic beyond the successfully answered unresolved sites. This is a known
upward bias. A conservative sensitivity check that restores every extra row
still yields PASS: agentdock becomes 29.72% unresolved / 70.28% placed, and
pydantic becomes 21.05% unresolved / 78.95% placed.

### Verdict: PASS, registration not started

Both corpora pass the fixed placement gate, so Task 7 is eligible on placement
alone. Per the Task 6 hard stop, Task 7 was not started. In addition, the 88
duplicate pydantic stable keys found during this run are an operational blocker
that should be resolved before Python registration is attempted. The production
registry and discovery allowlist remain unchanged, and Python-only repositories
still index zero files.

### Raw resolved outputs

#### agentdock

```json
{
  "repo": "../agentdock",
  "files": 56,
  "parseErrorFiles": 0,
  "references": 3023,
  "COMPILER": 234,
  "LEXICAL": 287,
  "HEURISTIC": 101,
  "EXTERNAL": 2171,
  "UNRESOLVED": 230,
  "inRepoReferences": 852,
  "unresolvedShare": 27,
  "placedShare": 73,
  "verdict": "PASS",
  "pyright": {
    "version": "1.1.413",
    "queries": 1884,
    "answered": 1555,
    "noDefinition": 329,
    "upgraded": 251,
    "externalized": 1295,
    "externalAdded": 1295,
    "typeshedAdded": 1295,
    "unresolvedCleared": 1170,
    "extraUnresolvedCleared": 33,
    "skippedNullSites": 0,
    "unmatchedSites": 0,
    "warnings": []
  }
}
```

#### pydantic

```json
{
  "repo": "../../../private/tmp/sonde-corpora/pydantic",
  "files": 441,
  "parseErrorFiles": 1,
  "references": 68838,
  "COMPILER": 13794,
  "LEXICAL": 6593,
  "HEURISTIC": 4501,
  "EXTERNAL": 38700,
  "UNRESOLVED": 5250,
  "inRepoReferences": 30138,
  "unresolvedShare": 17.42,
  "placedShare": 82.58,
  "verdict": "PASS",
  "pyright": {
    "version": "1.1.413",
    "queries": 37763,
    "answered": 30947,
    "noDefinition": 6816,
    "upgraded": 14441,
    "externalized": 14419,
    "externalAdded": 14419,
    "typeshedAdded": 14388,
    "unresolvedCleared": 23091,
    "extraUnresolvedCleared": 1386,
    "skippedNullSites": 0,
    "unmatchedSites": 0,
    "warnings": []
  }
}
```

---

## Authoritative re-run after the stable-key fix — 2026-08-28

The previous pyright measurement was taken with symbol insertion temporarily
using `INSERT OR IGNORE`, because pydantic's 88 colliding stable keys made
production indexing fail with `UNIQUE constraint failed: symbol.stable_key`.
That made the run non-authoritative by this project's own standard: a number
measured under a modified indexer is a hypothesis, not a result.

The collision is now fixed properly in the extractor (`fix: guarantee unique
Python stable keys`), and both corpora extract **zero** duplicate keys. This
is the fresh run against the unchanged thresholds in `PROTOCOL.md`.

Python was again enabled in `registry.ts` and default discovery in the working
tree only, and both edits were reverted before this record was committed.
Python remains unregistered.

### Results

| Corpus | Files | COMPILER | LEXICAL | HEURISTIC | EXTERNAL | UNRESOLVED | Unresolved share | Placed | Verdict |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| agentdock | 56 | 234 | 287 | 101 | 2,171 | 230 | **27.00%** | 73.00% | PASS |
| pydantic | 441 | 13,601 | 6,595 | 4,669 | 38,700 | 5,245 | **17.42%** | 82.58% | PASS |

Worse corpus is agentdock. Verdict: **PASS**, unchanged.

### Effect of the stable-key fix on the measurement

agentdock is byte-identical to the collapsed run — it had no colliding keys of
consequence. pydantic moved only slightly (`COMPILER` 13,794 → 13,601,
`HEURISTIC` 4,501 → 4,669, `UNRESOLVED` 5,250 → 5,245), and its gate shares are
unchanged at 17.42% / 82.58%.

So the temporary collapse did not manufacture the earlier PASS. That was worth
establishing rather than assuming, and it is now established by measurement
instead of by argument.

### The margin is thin on the worse corpus, and that is the number to quote

`deleteUnresolvedFor` clears every unresolved row with a given name under a
symbol, not only the answered site (`src/store/repos.ts:302`), so one answered
site can clear rows pyright never answered. `runCompilerPass` behaves
identically, so this is inherited precedent rather than a new bias — but it
moves the gate numerator, and the gate is a published bar.

Reversing it completely:

| Corpus | Extra rows cleared | Unresolved share with them restored | Margin to the 30% ceiling |
|---|---:|---:|---:|
| agentdock | 33 | 29.72% | **+0.28 pts** |
| pydantic | 1,377 | 21.03% | +8.97 pts |

Both still pass. But agentdock passing by 0.28 points is roughly three
references from FAIL, and any future change to how declarations are keyed,
counted, or cleared could move it either way. The honest summary of this gate
is **"passes, narrowly, on the worse corpus"** — not "passes".

A site-scoped variant of `deleteUnresolvedFor` would remove the ambiguity
entirely and is the obvious next hardening if this margin ever matters.
