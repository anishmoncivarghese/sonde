# Structural roles probe — questions

Corpus: `tests/fixtures/repos/large` (Hono v4.6.3, MIT).

Five behavioural questions. Each asks what a component *does* for a user of the
library, and no question contains the identifier of its own answer.

Answer with the qualified name of the single symbol that best answers the
question, plus the file it lives in.

---

**Q1.** When several handlers are registered for the same route, which component
turns that list into one callable chain that runs them in order and lets each
one hand control to the next?

**Q2.** Which component holds the per-request state that middleware and the
final handler both read from and write to — the object passed to every handler?

**Q3.** When a handler throws, which component converts that thrown value into
an HTTP response instead of letting it escape?

**Q4.** Which component exposes the parsed pieces of an incoming request — path
parameters, query values, headers, and body — to handler code?

**Q5.** When an application is asked to serve a path that matches no registered
route, which component produces the fallback response?
