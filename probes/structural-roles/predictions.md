# Structural roles probe — blind predictions

The answer key remained unopened while this document and the accompanying SQL
were prepared. Query shapes and their question assignments were fixed before
any probe SQL was executed.

## Pre-query structural hypotheses

The plan supplied five starting roles. A **delegator** implements an interface
and holds a member typed as that interface. A **facade** has broad outbound call
fan-out and relatively few inbound callers. An **entry point** is exported,
widely imported, and not itself called. A **terminal handler** refers to an
error/exception or response boundary and is reached from multiple callers. A
**policy holder** contains sibling members that refer to a shared interface.

The five questions suggest four counted query shapes:

1. **Handler-chain assembler (Q1).** Rank callable symbols that refer to several
   handler/callback declarations, are themselves called by application-source
   symbols, and coordinate multiple outbound calls. This is a callable variant
   of the facade role: the expected discriminator is fan-in plus handler-type
   breadth, not a target-name match.
2. **Lifecycle carrier (Q2 and Q4, reused verbatim).** Rank exported classes and
   interfaces by how broadly other source files call or reference their
   contained members, with member breadth as a secondary signal. A request-wide
   state object and a request-data facade should both be unusually visible
   through their members. The same top-three list is used for both questions;
   no question-specific reranking is allowed.
3. **Exception boundary (Q3).** Rank callable symbols that directly reference
   declarations whose names identify error or exception types, then break ties
   by inbound calls and outbound coordination. This is the plan's terminal
   handler role specialized by structural contact with an exception boundary.
4. **Fallback terminal (Q5).** Rank response-producing callable symbols that
   are referenced as values by runtime classes or methods and also have inbound
   calls. This treats the fallback as a stored terminal policy rather than an
   entry point; target names and path-specific vocabulary are not used.

All shapes exclude `benchmarks/` and `perf-measures/`. Test-only symbols are
also excluded because the questions concern library runtime behavior.

## Blind results

The prewritten SQL was executed once against the indexed Hono v4.6.3 fixture.
No counted query was revised after its output was inspected.

### Q1 — Handler-chain assembler

Shape: **Handler-chain assembler**.

Confidence: **low**. The handler-type breadth signal produced candidates, but
the leading row has no outbound call targets and the other rows look like an
adapter and a development helper. The result is retained without tuning.

| Rank | Qualified name | File | Handler types | Inbound callers | Inbound source files | Outbound call targets | Outbound target files |
|---:|---|---|---:|---:|---:|---:|---:|
| 1 | `Node.gHSets` | `src/router/trie-router/node.ts` | 3 | 1 | 1 | 0 | 0 |
| 2 | `handle` | `src/adapter/lambda-edge/handler.ts` | 3 | 0 | 0 | 2 | 2 |
| 3 | `inspectRoutes` | `src/helper/dev/index.ts` | 2 | 2 | 2 | 5 | 5 |

### Q2 — Per-request state carrier

Shape: **Lifecycle carrier**, reused verbatim for Q2 and Q4.

Confidence: **low**. Broad member use found three exported structural hubs,
but the shape cannot distinguish mutable request state from response typing or
JSX surface area. The ranked output is retained as-is.

| Rank | Qualified name | File | External user files | Externally used members | Members | Direct reference files |
|---:|---|---|---:|---:|---:|---:|
| 1 | `ClientResponse` | `src/client/types.ts` | 53 | 5 | 14 | 0 |
| 2 | `HonoRequest` | `src/request.ts` | 51 | 14 | 40 | 2 |
| 3 | `JSX.IntrinsicElements` | `src/jsx/intrinsic-elements.ts` | 44 | 13 | 117 | 2 |

### Q3 — Exception-to-response boundary

Shape: **Exception boundary**.

Confidence: **medium**. All three candidates contact multiple error-like
declarations; the second row also has the strongest direct role signal in its
qualified name. Ranking remains determined solely by the prewritten metrics.

| Rank | Qualified name | File | Error targets | Inbound callers | Inbound source files | Outbound call targets |
|---:|---|---|---:|---:|---:|---:|
| 1 | `timeout.timeoutPromise` | `src/middleware/timeout/index.ts` | 3 | 0 | 0 | 7 |
| 2 | `Hono.handleError` | `src/hono-base.ts` | 2 | 1 | 1 | 2 |
| 3 | `timeout` | `src/middleware/timeout/index.ts` | 2 | 1 | 1 | 0 |

### Q4 — Request-data facade

Shape: **Lifecycle carrier**, reused verbatim for Q2 and Q4.

Confidence: **medium**. The second row's member breadth and cross-file use are
consistent with a request-data facade, but the fixed shared query ranks a
response type first and a JSX interface third.

| Rank | Qualified name | File | External user files | Externally used members | Members | Direct reference files |
|---:|---|---|---:|---:|---:|---:|
| 1 | `ClientResponse` | `src/client/types.ts` | 53 | 5 | 14 | 0 |
| 2 | `HonoRequest` | `src/request.ts` | 51 | 14 | 40 | 2 |
| 3 | `JSX.IntrinsicElements` | `src/jsx/intrinsic-elements.ts` | 44 | 13 | 117 | 2 |

### Q5 — Fallback terminal

Shape: **Fallback terminal**.

Confidence: **low**. The query produced three adapter handlers, all with zero
recorded inbound references and callers. That contradicts the shape's stored
terminal-policy hypothesis, so this is recorded as an unsuccessful query
rather than revised after inspection.

| Rank | Qualified name | File | Response depth | Response targets | Handler targets | Inbound references | Inbound reference files | Inbound callers | Inbound call files |
|---:|---|---|---:|---:|---:|---:|---:|---:|---:|
| 1 | `streamHandle` | `src/adapter/aws-lambda/handler.ts` | 1 | 2 | 1 | 0 | 0 | 0 | 0 |
| 2 | `handle` | `src/adapter/lambda-edge/handler.ts` | 2 | 1 | 3 | 0 | 0 | 0 | 0 |
| 3 | `handle` | `src/adapter/service-worker/handler.ts` | 2 | 1 | 2 | 0 | 0 | 0 | 0 |

## Query-attempt ledger

`queries.sql` contains every attempted query verbatim: one counted query for
Q1, one reused counted query for Q2 and Q4, one counted query for Q3, and one
counted query for Q5. No exploratory or revised SQL was run.
