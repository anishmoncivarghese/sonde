# MCP client verification (DoD item 2)

Spec §12 requires all three MCP tools to be verified in Claude Code and in one
other client. This is a manual procedure: run it, record the client versions and
results inline, and do not mark the DoD item complete while any checkbox remains
open.

## Automated preflight

The repository test suite already connects through the MCP SDK client and checks
tool discovery plus successful calls to all three tools. That is useful preflight
coverage, but it does not replace the two independent-client checks below.

On 2026-08-21, verification included the complete 242-test suite,
`npm run typecheck`, `npm run build`, and
`node dist/cli/main.js mcp serve --help`; all completed successfully.

## 1. Build and index a target repository

Use a scratch or otherwise approved TypeScript repository whose source may be
shared with the selected client. Replace both absolute paths below.

```sh
nvm use && npm run build
node /absolute/path/to/CodeGraph/dist/cli/main.js index /absolute/path/to/target
node /absolute/path/to/CodeGraph/dist/cli/main.js mcp serve --help
```

Record the target revision so both clients test the same repository state:

- Target repository: `tests/fixtures/repos/medium` (synthetic fixture)
- Target revision: `9db05363b158ca68242b8ef9725f86b038dbf0f8`, plus the same temporary
  tracked-source mutation in both clients
- CodeGraph implementation commit: `dcbdd3c`

## 2. Claude Code

Add this to `.mcp.json` in the target repository. Passing the target explicitly
avoids depending on the client process's working directory.

```json
{
  "mcpServers": {
    "codegraph": {
      "command": "node",
      "args": [
        "/absolute/path/to/CodeGraph/dist/cli/main.js",
        "mcp",
        "serve",
        "/absolute/path/to/target"
      ]
    }
  }
}
```

Start a new Claude Code session in the target repository, confirm `codegraph`
connects, and call every tool at least once.

- [x] `find_symbols` with `{ "query": "Dispatcher" }` returned seven matches
      in the complete seven-field envelope.
- [x] `query_graph` with `callees_of` on
      `ts:src/scheduler/dispatcher.ts#Dispatcher.dispatch` returned explicit
      `compiler`, `lexical`, and `heuristic` buckets, including the expected
      heuristic member-call targets.
- [x] After editing a tracked source file, `get_impact_radius` with
      `from_git_diff: true` returned four seeds and five affected symbols,
      including the depth-2 `run` caller; diagnostics reported no truncation or
      omissions.
- Claude Code version: `2.1.237`

## 3. Second client: MCP Inspector

MCP Inspector is a model-free reference client, so this check does not require a
second AI account or model call.

```sh
npx @modelcontextprotocol/inspector node \
  /absolute/path/to/CodeGraph/dist/cli/main.js mcp serve \
  /absolute/path/to/target
```

The in-app browser runtime had no available browser instance, so the same
reference client was run in its official `--cli` mode with explicit JSON input.

- [x] `find_symbols` returned all seven envelope fields: `schemaVersion`,
      `repository`, `freshness`, `summary`, `results`, `warnings`, and
      `diagnostics`; the `Dispatcher` query returned seven matches.
- [x] `query_graph` returned `compiler`, `lexical`, and `heuristic` as top-level
      evidence buckets rather than nesting them under `results`; `callees_of`
      `Dispatcher.dispatch` returned seven heuristic callees.
- [x] `get_impact_radius` returned `diagnostics.truncated: false` and
      `diagnostics.omittedCount: 0`, with the same four seeds and five affected
      symbols seen in Claude Code.
- MCP Inspector version: `2.3.0`

## Result

- [x] Both clients passed every check above.
- Completed on/by: 2026-08-21 / Codex
- Notes or deviations: The first Claude Code impact call exposed a nested-root
  Git path defect: paths were relative to the enclosing worktree instead of the
  indexed boundary, so no seeds matched. Commit `dcbdd3c` added a regression
  test and fixed `changedFiles` with `git diff --relative -- .`. Both clients
  then returned the expected impact graph. The temporary mutation and client
  configuration were removed after verification.
