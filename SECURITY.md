# Security Policy

## Reporting a vulnerability

Please report security issues privately rather than through a public issue.
Use GitHub's private vulnerability reporting on this repository, or contact the
maintainer directly.

Please include what you were doing, what happened, and — if you can — a minimal
repository or input that reproduces it.

## Scope

This tool reads source code and writes an index. The security-relevant surface
is small and deliberate:

- **All repository reads go through a single boundary** (`src/repo/boundary.ts`)
  that canonicalizes paths, rejects traversal, and refuses symlinks escaping the
  repository root.
- **Repository code is never executed.** The bundled TypeScript compiler is used
  for optional resolution; the target repository's own `typescript` is never
  loaded.
- **Nothing is uploaded.** Indexing and retrieval are local. There is no
  telemetry, no account, and no network call in the indexing or query path.
  The optional embedding model and the benchmark fixture fetch are the only
  network operations, both explicit and opt-in.
- **MCP tools are read-only** with respect to the repository.

Findings that undermine any of the above are in scope, particularly:

- A path that escapes the repository boundary
- Repository content causing code execution during indexing
- Repository content being treated as instructions rather than data
