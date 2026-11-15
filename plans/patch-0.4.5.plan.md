<!-- whyline-plan v1 | source: draft | drafted-by: claude | spec: docs/reviews/2026-11-15-plan-audit.md | created: 2026-11-15T11:30:00+05:30 -->
# Sonde 0.4.5 patch release plan

Independent of every experiment in `plans/now-i-want-you-to-analyse-the-current-ca.plan.md`.
Two confirmed defects are sitting unreleased and one of them has been fixed on
`main` since 2026-10-06; neither should wait for a usefulness gate. Work on a
branch cut from `main`, not from the relay branch.

## Phase 1 — fix what is wrong today

- [ ] PATCH-1: Stop the pyright pass warning about sites that were never Python
  `runPyrightPass` in `src/resolve/pyrightPass.ts` builds its `wanted` set from `store.unresolvedRefSites()` and `store.heuristicEdgeSites()`, neither of which filters by language, then reports every site it did not match. On a repository that mixes Python with TypeScript or Swift, every non-Python unresolved or heuristic site is therefore counted: indexing this repository with `--resolve` prints "4858 stored pyright query site(s) did not match extraction" for six Python files. Restrict `wanted` to sites whose source symbol lives in a `.py` or `.pyi` file, filtering in the store query rather than after the fact. Write the failing test first with a mixed TypeScript-and-Python fixture: assert the warning is absent when every Python site matches, and assert it is still present, with the correct count, when a Python site genuinely fails to match. Verifying the absence matters as much as the presence; a disclosure that fires wrongly trains users to ignore the real one. Change nothing else.

- [ ] PATCH-2: Keep the ungated map out of the supported surface for this release
  `main` carries `sonde map` (`src/map/`, a CLI command, `ARCHITECTURE.html`, an Unreleased CHANGELOG entry and an `AGENTS.md` section), but no usefulness gate has measured that command's output: the Phase 0 runs tested the earlier spike. Releasing from `main` would ship and advertise it. Register the command with Commander's `hidden: true` and prefix its description with "experimental"; leave the code, tests and `ARCHITECTURE.html` in place. Rewrite the Unreleased CHANGELOG entry so it states that the command exists, is experimental, and has not passed a usefulness gate, and remove the sentences claiming what it answers. Keep the transitive-reach description only as a description of behaviour. Add a CLI test that `sonde --help` does not list `map` and that `sonde map --help` still works. Record the decision with `whyline note`, including the rejected alternative of cutting the patch from `v0.4.4` with cherry-picks. If the human prefers to ship the command visibly or to remove it, stop and ask rather than choosing. Change nothing else.

- [ ] PATCH-3: Make the README command inventory match the CLI
  The `## CLI` block in `README.md` omits `sonde doc` and `sonde embed`, although `doc` has its own section higher up and `sonde init` has named it since 0.4.4. Add both to the inventory with their real options, read from `src/cli/main.ts` rather than from memory. Add a test that parses the README block and fails when a registered, non-hidden top-level command is missing from it or when the block names a command that does not exist, so the inventory cannot drift again. Do not add `sonde map`. This task replaces ORIENT-1's documentation half. Change nothing else.

## Phase 2 — verify and release

- [ ] PATCH-4: Verify the packed candidate by clean install
  Run `nvm use && npm run typecheck && npm test`, then `npm pack` and install the tarball into an empty temporary directory outside this repository. Against a throwaway TypeScript project with more than 30 evidenced module pairs, run `sonde doc` and read the output: the sentence above the dependency table must state how many of how many pairs are listed and must not say the table is complete. Against a throwaway project mixing Python and TypeScript, run `sonde index --resolve` and confirm the unmatched-site warning is absent; then break one Python reference so it cannot match and confirm the warning returns with a count of one. Confirm `sonde init` still names `sonde doc`, that `sonde --help` omits `map`, and that missing-index guidance is intact. Record commands and observed output in `docs/patch-0.4.5-clean-install-verification.md`. This task replaces ORIENT-1's verification half. Change nothing else.

- [ ] PATCH-5: Release 0.4.5
  relay-profile: release
  Only after PATCH-4. Bump `package.json` and both version fields in `server.json` to 0.4.5 and move the Unreleased CHANGELOG entries under the new heading. `main` is 23 commits ahead of `origin/main`; push it first and confirm CI is green before publishing anything. Then run npm publish, the Git tag and GitHub release, and the MCP Registry publish as separate commands, checking authentication before each and never chaining them. Query all three registries afterwards and require the MCP Registry to report 0.4.5 with `isLatest: true`. Finally install `@cheppulabs/sonde@0.4.5` from the registry into a clean directory and repeat the two headline checks from PATCH-4. Change nothing else.
