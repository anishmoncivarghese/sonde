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
