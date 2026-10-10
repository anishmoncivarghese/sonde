# MAP-GATE-1 isolated answerer brief

This brief contains the complete instructions for the answerer. Do not read `PROTOCOL.md`, `BUILD-NOTES.md`, any prior result or audit file, source code, Git history, the Sonde index, or Whyline decisions. Do not run `sonde query`, grep repository content, inspect page source or the DOM, extract embedded JSON, or use a script to calculate an answer.

Use only these artifacts:

- `probes/visual-map/map.html`, through its visible rendered interface
- `probes/visual-map/map-simple.html`, through its visible rendered interface
- `ARCHITECTURE.md`, as the comparison document
- `probes/visual-map/RAW-RESULTS.md`, only as the blank form to fill

Use the browser to interact with the two HTML maps as a reader would. Visible browser find, zoom, scrolling, clicking, hovering, and screenshots are allowed. Do not use developer tools, accessibility-tree extraction, page evaluation, DOM queries, or raw-file reads of either HTML artifact.

For every artifact/question observation below:

1. Start a monotonic timer immediately before opening or switching to the named artifact.
2. Find the answer using only that artifact.
3. Stop the timer when the answer is ready.
4. Record the raw answer, elapsed time, and a low/medium/high confidence statement in `RAW-RESULTS.md` before opening the second artifact for that question.
5. Do not check correctness or revise an earlier answer after seeing the second artifact.

Use this exact order:

1. Q1 from Markdown, then the complete map.
2. Q2 from the complete map, then Markdown.
3. Q3 from Markdown, then the complete map.
4. Q4 from the complete map, then Markdown.
5. C1 from Markdown, then the complete map. C1 is a control, never a map task.
6. Q5 from the simple map, then Markdown.
7. Q6 from Markdown, then the simple map.

Questions:

- Q1: If you change the schema in `src/store/repos.ts`, which modules must you check?
- Q2: Which module is the riskiest to change—the one the most other modules depend on?
- Q3: Is there a dependency cycle between any two modules, and if so which?
- Q4: Which modules does `src/cli` depend on that `src/mcp` does not?
- C1 (control): How many files and symbols are in `src/resolve`?
- Q5: Work enters at `src/cli`. Trace the path by which it reaches `src/store`—which modules does it pass through?
- Q6: Which modules are foundational—they depend on nothing else in the product?

Before the first timed observation, fill the run identity fields and state whether this session had any prior exposure to the answers. After all 14 cells are filled, stop. Do not adjudicate, modify either artifact, or inspect anything outside the allowlist above.
