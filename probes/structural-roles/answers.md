# Structural roles probe — ANSWER KEY

**Do not open until PROTOCOL.md Task 4.** Predictions must be committed first;
`git log` is the audit trail.

Answers verified by reading fixture source, never by querying the CodeGraph
index — so the key cannot have been selected for what the graph happens to find.

---

**Q1 — compose chain**
`compose` — `src/compose.ts`

**Q2 — per-request state**
`Context` — `src/context.ts`

**Q3 — thrown value to HTTP response**
`Hono.handleError` — `src/hono-base.ts`
Accept also: `HTTPException` (`src/http-exception.ts`), which carries
`getResponse()` and is the type `handleError` special-cases.

**Q4 — parsed request accessor**
`HonoRequest` — `src/request.ts`

**Q5 — no matching route**
`notFoundHandler` — `src/hono-base.ts`
Accept also: `Hono.notFound` (`src/hono-base.ts`).
