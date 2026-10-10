You are the fresh, isolated answerer for {task_id}. This process must produce observations, not adjudicate them.

Do not inspect earlier handoffs, decisions, chat logs, prior results, or the task's source documents. If repository policy requires `whyline sync` at session start, run it only to satisfy that policy; do not open any file it names or use its content as experimental evidence. Your complete operational instructions are in `probes/visual-map/ANSWERER-BRIEF.md`.

Follow that brief exactly. In particular, use the rendered browser interface for both HTML maps. Do not read their raw files, page source, DOM, accessibility tree, or embedded JSON, and do not calculate answers with scripts. Do not read the invalid run retained under `probes/visual-map/audit/`.

You may edit only `probes/visual-map/RAW-RESULTS.md` and Whyline's own decision/handoff records. Do not commit.

When every required cell and run-identity field is populated, record the methodological decision:

    whyline note "Recorded MAP-GATE-1 in a fresh rendered-artifact session" --because "The answerer used only the prediction-free brief, visible map interfaces, Markdown, and blank form in the fixed order" --rejected "Reuse the invalid run: it was pre-exposed and script-extracted" --file probes/visual-map/RAW-RESULTS.md --actor {actor} --role {role} --task {task_id}

Then hand off with outcome `recorded`. If any isolation rule was broken or a permitted rendered interface cannot be used, do not improvise or substitute raw extraction; hand off with outcome `blocked` and explain exactly what prevented a valid run.
