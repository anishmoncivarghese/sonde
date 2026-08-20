# MCP client verification (DoD item 2)

Spec §12 requires all three MCP tools to be verified in Claude Code and in one
other client. This is a manual procedure: run it, record the client versions and
results inline, and do not mark the DoD item complete while any checkbox remains
open.

## Automated preflight

The repository test suite already connects through the MCP SDK client and checks
tool discovery plus successful calls to all three tools. That is useful preflight
coverage, but it does not replace the two independent-client checks below.

On 2026-08-21, `npm run build` and
`node dist/cli/main.js mcp serve --help` both completed successfully. The manual
client runs have not yet been performed.

## 1. Build and index a target repository

Use a scratch or otherwise approved TypeScript repository whose source may be
shared with the selected client. Replace both absolute paths below.

```sh
nvm use && npm run build
node /absolute/path/to/CodeGraph/dist/cli/main.js index /absolute/path/to/target
node /absolute/path/to/CodeGraph/dist/cli/main.js mcp serve --help
```

Record the target revision so both clients test the same repository state:

- Target repository: _____
- Target revision: _____
- CodeGraph commit: _____

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

- [ ] `find_symbols` with a real query — input/result summary: _____
- [ ] `query_graph` with `callers_of` on a real symbol — input/result summary:
      _____
- [ ] Edit a tracked source file, then call `get_impact_radius` with
      `from_git_diff: true` — input/result summary: _____
- Claude Code version: _____

## 3. Second client: MCP Inspector

MCP Inspector is a model-free reference client, so this check does not require a
second AI account or model call.

```sh
npx @modelcontextprotocol/inspector node \
  /absolute/path/to/CodeGraph/dist/cli/main.js mcp serve \
  /absolute/path/to/target
```

In the Inspector UI, connect and run every tool with manually entered input.

- [ ] `find_symbols` returns all seven envelope fields: `schemaVersion`,
      `repository`, `freshness`, `summary`, `results`, `warnings`, and
      `diagnostics` — result: _____
- [ ] `query_graph` returns `compiler`, `lexical`, and `heuristic` as top-level
      evidence buckets rather than nesting them under `results` — result: _____
- [ ] `get_impact_radius` returns `diagnostics.truncated` and
      `diagnostics.omittedCount` — result: _____
- MCP Inspector version: _____

## Result

- [ ] Both clients passed every check above.
- Completed on/by: _____
- Notes or deviations: _____
