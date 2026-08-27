# Pyright LSP feasibility spike — 2026-08-28

A throwaway spike, run to decide whether a pyright-backed `COMPILER` tier for
Python is architecturally viable before designing one. The probe code is not
kept; these numbers are the deliverable.

## Question

TypeScript's `--resolve` tier works because the TypeScript compiler API runs
**in-process** (`src/resolve/compilerPass.ts`). Pyright exposes no stable
programmatic API, so the realistic access path is its language server over LSP:
one `textDocument/definition` request per reference site.

At the measured Python reference counts (`probes/python-placement/FINDINGS.md`),
that could be prohibitive. pydantic alone has 28,341 unresolved references.

## Method

`pyright@1.1.413` installed from npm into a scratch directory. A minimal
JSON-RPC client drove `pyright-langserver --stdio`: `initialize`, then
`textDocument/didOpen` for a size-ranked file sample, then
`textDocument/definition` at call-site positions spread deterministically
across that sample. Request latency and wall-clock throughput were recorded
separately, and the first request was timed on its own because it blocks on
background analysis.

No Python interpreter was involved. Pyright is a TypeScript program and bundles
typeshed, so the tier would require no toolchain from the target repository —
the same property that lets Sonde bundle `typescript` rather than load the
repo's (invariant 5, SEC-008).

## Results

| Corpus | Files opened | Init | First request | mean | p50 | p95 | max | Definition returned |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| agentdock | 20 of 56 | 118 ms | 256 ms | 6.73 ms | 1 ms | 32 ms | 79 ms | 84.9% |
| pydantic | 60 of 436 | 116 ms | 148 ms | 4.92 ms | 1 ms | 21 ms | 155 ms | 65.5% |

### Concurrency buys nothing

Pydantic, 499 requests, varying client concurrency:

| Concurrency | Wall | Throughput | mean latency | p95 |
|---:|---:|---:|---:|---:|
| 1 | 2,416 ms | 206.5 req/s | 4.84 ms | 22 ms |
| 8 | 2,331 ms | 214.1 req/s | 24.32 ms | 75 ms |
| 32 | 2,339 ms | 213.3 req/s | 82.39 ms | 190 ms |

Throughput is flat at **~210 req/s** while per-request latency rises almost
exactly in proportion to concurrency. The server processes definition requests
serially; a concurrent client only queues them. **Any batching or worker-pool
design would be wasted complexity**, which is worth knowing before it is built.

### Projected cost at 210 req/s

| Corpus | Unresolved references only | Every reference |
|---|---:|---:|
| agentdock | 6.7 s | 14.1 s |
| pydantic | 135.0 s | 341.6 s |

## Verdict: viable, if scoped to unresolved references

Six seconds on a typical project and just over two minutes on a 436-file one is
an acceptable cost for an opt-in `--resolve` pass. Resolving *every* reference
is not: it would triple the cost to re-derive answers the tree-sitter tier
already has.

## What this does NOT establish

The "definition returned" column is **not** comparable to the gate's placed
share, and must not be reported as though it were.

- It samples call sites found by regex, not Sonde's extracted reference set.
- A returned definition frequently points into typeshed — correctly `EXTERNAL`,
  not a placed in-repository edge. Since `EXTERNAL` is excluded from the gate
  denominator, this could move the measured share substantially in either
  direction.

The honest reading: pyright answers 65–85% of call-site definition queries where
the tree-sitter tier placed 37–43% of references. That is a strong signal that
the tier is worth building, and it is not a predicted gate result. Only a fresh
run against the thresholds already fixed in `probes/python-placement/PROTOCOL.md`
can produce one.
