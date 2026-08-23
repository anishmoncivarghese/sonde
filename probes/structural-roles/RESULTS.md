# Structural roles probe — results

## Verdict: INCONCLUSIVE

The blind probe produced **2 hits out of 5 questions (40%)**. The protocol fixed
`30-59%` as **INCONCLUSIVE**, so the result is recorded and feature work stops.
No reusable query shape accounted for two hits: the lifecycle-carrier shape was
reused verbatim for Q2 and Q4 but hit only Q4.

## Blind integrity

The blind held. Before the answer key was opened, `git log --oneline -3` showed:

```text
fd6a785 test: record blind structural predictions before revealing answers
f4db397 test: add blind structural probe questions
6893a1e test: fix structural-probe success criteria before collecting data
```

Only after verifying that order was `answers.md` opened. No counted query was
revised after inspecting its results, and no question was marked TUNED.

## Per-question score

| Question | Accepted answer | Predicted top 3 | Rank | Shape | Result |
|---|---|---|---:|---|---|
| Q1 — compose a handler chain | `compose` | `Node.gHSets`; `handle` (`src/adapter/lambda-edge/handler.ts`); `inspectRoutes` | — | Handler-chain assembler | MISS |
| Q2 — per-request state | `Context` | `ClientResponse`; `HonoRequest`; `JSX.IntrinsicElements` | — | Lifecycle carrier | MISS |
| Q3 — thrown value to response | `Hono.handleError` (also accepts `HTTPException`) | `timeout.timeoutPromise`; `Hono.handleError`; `timeout` | 2 | Exception boundary | HIT |
| Q4 — parsed request accessor | `HonoRequest` | `ClientResponse`; `HonoRequest`; `JSX.IntrinsicElements` | 2 | Lifecycle carrier | HIT |
| Q5 — unmatched-route fallback | `notFoundHandler` (also accepts `Hono.notFound`) | `streamHandle`; `handle` (`src/adapter/lambda-edge/handler.ts`); `handle` (`src/adapter/service-worker/handler.ts`) | — | Fallback terminal | MISS |

## Query attempts and raw results

[`queries.sql`](queries.sql) is the verbatim query ledger. It contains all four
queries attempted: one for Q1, one reused without changes for Q2 and Q4, one for
Q3, and one for Q5. No exploratory or revised SQL was run.

### Q1 — Handler-chain assembler

```text
qualified_name  path                                handler_type_count  inbound_callers  inbound_source_files  outbound_call_targets  outbound_target_files
Node.gHSets     src/router/trie-router/node.ts      3                   1                1                     0                      0
handle          src/adapter/lambda-edge/handler.ts  3                   0                0                     2                      2
inspectRoutes   src/helper/dev/index.ts             2                   2                2                     5                      5
```

This query failed. Handler-type breadth selected an internal trie member, an
adapter handler, and a development helper rather than the chain assembler.

### Q2 and Q4 — Lifecycle carrier, reused verbatim

```text
qualified_name        path                           external_user_files  externally_used_members  member_count  direct_reference_files
ClientResponse        src/client/types.ts            53                   5                        14            0
HonoRequest           src/request.ts                 51                   14                       40            2
JSX.IntrinsicElements src/jsx/intrinsic-elements.ts  44                   13                       117           2
```

The same query missed Q2 and hit Q4 at rank 2. Cross-file member use identifies
broad structural hubs, but does not distinguish mutable request state from a
request-data facade, response typing, or JSX surface area.

### Q3 — Exception boundary

```text
qualified_name         path                             error_target_count  inbound_callers  inbound_source_files  outbound_call_targets
timeout.timeoutPromise src/middleware/timeout/index.ts  3                   0                0                     7
Hono.handleError       src/hono-base.ts                 2                   1                1                     2
timeout                src/middleware/timeout/index.ts  2                   1                1                     0
```

This query hit `Hono.handleError` at rank 2. Direct contact with multiple
error-like declarations was useful, though the leading result was a timeout
helper rather than the library-wide exception boundary.

### Q5 — Fallback terminal

```text
qualified_name  path                                   response_depth  response_target_count  handler_target_count  inbound_references  inbound_reference_files  inbound_callers  inbound_call_files
streamHandle    src/adapter/aws-lambda/handler.ts       1               2                      1                     0                   0                        0                0
handle          src/adapter/lambda-edge/handler.ts      2               1                      3                     0                   0                        0                0
handle          src/adapter/service-worker/handler.ts   2               1                      2                     0                   0                        0                0
```

This query failed. All three results were adapter handlers with no recorded
inbound references or calls, contradicting the stored-terminal-policy shape.

## Generalisation assessment

No shape generalised to two hits. The lifecycle-carrier query was genuinely
reused for two questions, but produced only one hit. The exception-boundary
shape produced one hit and was used for only one question. The other two shapes
missed.

The most likely limitation is that these aggregate patterns identify hubs and
type vocabulary more readily than behavioral roles. Dynamic callback flow and
stored handler indirection do not leave enough resolved `CALLS`/`REFERENCES`
evidence to distinguish the chain composer or fallback policy, while broad
type surfaces dominate cross-file member-use counts.

Per the fixed protocol, this is neither a PASS nor a softened positive result.
It is **INCONCLUSIVE**, and no structural-role feature is built from it.

---

## Controller note added after scoring: Q2 was unwinnable

Q2's accepted answer, `Context` in `src/context.ts`, **is not in the index at
all**, so no query could have found it. `src/context.ts` fails to parse, and
`src/index/pipeline.ts:83` discards every symbol from any file carrying a parse
diagnostic:

```ts
if (result.diagnostics.length > 0) {
  failed.set(file.path, result.diagnostics);   // whole file discarded
} else {
  extracted.set(file.path, result);
}
```

Eight of Hono's 346 files contribute zero symbols for this reason, including
`src/context.ts`, `src/types.ts`, and `src/utils/body.ts`. The implementer had
no way to know: a query for the per-request carrier returns plausible wrong
answers (`ClientResponse`, `HonoRequest`) rather than nothing, because a
different `Context` exists at `src/jsx/context.ts`.

The question was authored against fixture source, not against the index, which
is what let a symbol the tool cannot see become an accepted answer.

**Effect on the verdict: none.** Excluding Q2 gives 2 hits of 4 (50%), still
inside the 30-59% INCONCLUSIVE band. Q1 (`compose`) and Q5 (`notFoundHandler`)
were genuine misses — both live in cleanly-parsed files and were verified
present in the index. The reusability condition also fails independently: the
lifecycle-carrier shape was reused for Q2 and Q4 and hit only once.

The probe stands. The defect it exposed is tracked separately.
