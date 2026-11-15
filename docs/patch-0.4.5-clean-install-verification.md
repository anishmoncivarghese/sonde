# 0.4.5 clean-install verification

Run on 2026-11-15 against the packed candidate (`npm pack`), installed into an
empty directory outside the repository, with an empty `HOME` so no earlier
index or configuration could leak in. Node 24.15.0.

| Check | Command | Observed |
|---|---|---|
| The hidden command is not offered | `sonde --help` | No `map` line. `doc` and `doctor` listed. |
| The table no longer claims completeness | `sonde doc --stdout .` on a throwaway TypeScript project with 36 evidenced module pairs | "The table below lists the 30 strongest of 36 evidenced pair(s); run `sonde doc --module <path>` for a module's complete set." No occurrence of "is complete". The existing "6 lighter dependencies are not listed" line agrees with it. |
| The false warning is absent | `sonde index . --resolve` on a throwaway project with three Python and two TypeScript files, one TypeScript reference left unresolved on purpose | "indexed 5 files, 12 symbols, 12 edges (0 external, 1 unresolved, 0 parse failures); compiler upgraded 1 edge(s)". No warning. Before the fix that unresolved TypeScript site would have been reported as an unmatched pyright site. |
| The compiler tier still runs for Python | same run | "compiler upgraded 1 edge(s)". This is the check that matters most: a filter on `file.language` would have removed the warning by removing the pass. |
| `sonde init` still points at the document | `sonde init . --yes` | "Run `sonde doc` to generate an architecture document." |

## One check in the plan could not be run, and should not have been planned

PATCH-4 asked for the warning's *presence* to be verified from a clean
install by breaking a Python reference. That cannot be done, and the reason is
worth keeping.

The warning compares reference sites stored in the index with sites the pass
re-extracts from the same files. Every `index` and `update` run rebuilds the
stored sites from a fresh extraction first, so within one run the two always
come from the same source. An unmatchable site planted directly into the
SQLite index was gone after the next `sonde update --resolve`, with no
warning. Nothing a user does to their working tree can make the two disagree.

So the warning is an internal-consistency alarm, not a user-facing condition:
it fires only if the extractor disagrees with itself, for instance a reference
recorded without a column. Its presence is covered where it can be, in
`tests/resolve/pyrightPass.test.ts`, which plants the site and calls the pass
directly. That is also why 4858 false firings were pure noise: on a healthy
install the correct count is always zero.
