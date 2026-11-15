<!-- whyline-plan v1 | source: draft | drafted-by: claude | spec: docs/specs/now-i-want-you-to-analyse-the-current-ca.md | created: 2026-11-15T11:45:00+05:30 -->
# Sonde map gate plan

Replaces Phase 0 and Phase 1 of `plans/now-i-want-you-to-analyse-the-current-ca.plan.md`.
The reasons are set out in `docs/reviews/2026-11-15-plan-audit.md`; in short,
the gate as drafted could not produce a valid result and would have applied
its verdict to an artifact it never measured.

Independent of the focused-explanation plan and of `plans/patch-0.4.5.plan.md`,
except that MAP-GATE-4 assumes PATCH-2 has hidden the command.

## Human checkpoint A — before MAP-GATE-1

The repository owner reads `probes/visual-map/audit/HUMAN-RUN-2026-10-06.md`,
corrects anything it gets wrong, and changes its status line to
`**Status:** confirmed by the answerer on <date>.` No agent may make that edit.

## Phase 0 — close the spike gate honestly

- [ ] MAP-GATE-1: Record the spike verdict from the confirmed human run
  Proceed only if the status line of `probes/visual-map/audit/HUMAN-RUN-2026-10-06.md` says it was confirmed by the answerer; otherwise stop and report that Human checkpoint A is outstanding. Write `probes/visual-map/RESULTS.md` recording, for the Phase 0 spike artifacts only, the verdict that record supports under `PROTOCOL.md` §5 for the complete map and for the simple map separately, with every caveat the record lists carried over verbatim rather than summarised: no timings, no confidence, no second round, self-administered, builder-administered. State plainly that the verdict applies to `probes/visual-map/map.html` and `map-simple.html` and not to the output of the `sonde map` command, which was built afterwards and differs. State that the 2026-10-10 relay run remains invalid and contributes nothing. Do not edit `PROTOCOL.md`, either audit record, or any source file, and do not re-run the questions: their answers are published in `CHANGELOG.md`, in commit `3f9cd28` and in the audit directory, so no answerer with repository access is cold. Record the verdict with `whyline note`, naming as rejected the option of a further cold run of the spike. Change nothing else.

## Phase 1 — gate the command that would actually ship

- [ ] MAP-GATE-2: Freeze a protocol and stimuli for the shipped `sonde map` output
  Create `probes/sonde-map/PROTOCOL.md` before anyone answers anything. Pin one permissively licensed repository and revision that is neither this repository nor one the owner maintains, index it with `--resolve` where its language needs it, and generate three stimuli with the current build: `sonde map`, `sonde map --complete` and `sonde doc`. Commit them under `probes/sonde-map/stimuli/` as `simple.html`, `complete.html` and `ARCHITECTURE.md` and write each file's SHA-256 into the protocol; the earlier gate's stimuli were git-ignored local files and its Markdown and maps described different revisions, and neither may recur. Draft at least two orientation questions for the simple map, at least three detail questions for the complete map including one transitive-reach question and one search-dependent question, and one control that the Markdown should win. Draft them from `sonde query` and the index, never by opening a rendered map, and do not compute or write down any answer in this task. Fix the counterbalanced order, the per-cell fields (raw answer, elapsed time, confidence before checking, and the answerer's prior familiarity with the pinned repository), predictions, and a separate PASS, MARGINAL, FAIL and VOID rule for each view modelled on `probes/visual-map/PROTOCOL.md` §5. The answerer must be a human and must not be anyone who built the map or drafted these questions: the owner decided on 2026-10-06 that the map is for human readers, so an agent driving a browser measures the wrong reader. Add `probes/sonde-map/ANSWERER-BRIEF.md` as an allowlist of the three stimuli and a blank `RAW-RESULTS.md` form. Forbid, in the protocol, publishing any answer in a changelog, commit message or decision note before adjudication. Change no source file and nothing else.

## Human checkpoint B — between MAP-GATE-2 and MAP-GATE-3

A human answerer follows `probes/sonde-map/ANSWERER-BRIEF.md` and fills every
cell of `probes/sonde-map/RAW-RESULTS.md`, then commits it unchanged.

- [ ] MAP-GATE-3: Adjudicate the shipped-map experiment
  Proceed only if every cell of `probes/sonde-map/RAW-RESULTS.md` holds a raw answer, an elapsed time and a confidence, and its run-identity block names a human answerer; otherwise stop and report that Human checkpoint B is outstanding. Verify the three stimuli still match the SHA-256 values frozen in the protocol and that the protocol is unchanged since the commit that created it. Then, and only then, adjudicate each cell against `sonde query` on the pinned revision and write `probes/sonde-map/RESULTS.md` with the evidence for every score and a separate verdict per view. Include the checks from `probes/visual-map/PROTOCOL.md` §4.1 that still apply: the dense graph, a dirty or drifted worktree whose stamp must agree with `sonde doc`, and a heuristic-heavy pair that must not look resolved. A `MARGINAL` stops for the human and authorises nothing. Do not alter the raw record, the protocol, a threshold or any source file. Run `nvm use && npm test -- tests/map tests/cli/map.test.ts` to confirm adjudication changed no behaviour, and record the verdict with `whyline note`. Change nothing else.

- [ ] MAP-GATE-4: Apply the verdict to the command
  Read `probes/sonde-map/RESULTS.md`. For each view recorded `PASS`, remove the `hidden` flag that PATCH-2 placed on `sonde map` (or, if only one view passed, keep the command visible and mark the other view experimental in its help text), document the view in `README.md` and the `sonde init` hint naming the exact questions it improved, and clean-install verify its normal and its dirty or drifted output. For each `FAIL`, leave it hidden as research code and say so in `AGENTS.md`; removal is the human's decision and is not taken here. For `MARGINAL` or `VOID`, stop without touching code or documentation. Update the "Generated artifacts" section of `AGENTS.md` in the same change so the stable rule matches what is retained. Do not change projection semantics, add an orientation preface to `ARCHITECTURE.md`, or touch focused explanations. Change nothing else.
