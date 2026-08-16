# Decisions

Append-only. Written by whyline; readable without it.

## 2026-08-14 — Use an isolated CodeGraph repository for the clean M0 exercise

**Because:** A project-local Git history keeps unrelated home-directory changes out of the experiment denominator

**Rejected:**

- Reuse the parent /Users/anish repository — its broad dirty worktree would make the M0 result uninterpretable

**Files:** AGENTS.md

<!-- whyline-event: 9353a8ad0db84aafa7bed6aba3c20d76 -->

## 2026-08-15 — Use a structured local activity ledger with generated Markdown efficiency reports

**Because:** token, time, file, and line metrics need reliable aggregation, provenance, retention, and regeneration while remaining human-readable

**Rejected:**

- append-only Markdown as source of truth — difficult to query, correct, version, and write concurrently
- automatic inclusion in agent context — would increase token use and expose private history without being relevant

**Files:** prd.md

<!-- whyline-event: 5d6b886f891945269958538f14b8ec55 -->

## 2026-08-16 — Fully remove the third-party code-review-graph installation rather than repairing its broken hooks

**Because:** its refresh hooks had been exiting 127 on every Edit/Write/Bash for months while a global CLAUDE.md instruction still directed agents to the resulting empty indexes; CodeGraph is being built to replace it, so repair would add ~250ms per tool call for a tool with no populated index

**Rejected:**

- repair hooks to use uvx — pays a per-tool-call latency tax for a tool slated for replacement
- remove hooks but keep the MCP server — leaves agents pointed at empty graphs with no refresh path

**Files:** /Users/anish/.claude/settings.json

<!-- whyline-event: 38efa40293e345f9af6fca78519b7d30 -->

## 2026-08-16 — Reassign the activity ledger from CodeGraph to AgentDock

**Because:** a CodeGraph index is derived and disposable while an activity ledger is authored and irreplaceable, so they need opposite backup, retention and commit policies; AgentDock already owns session boundaries and records the client session id that names the transcript file holding authoritative token counts

**Rejected:**

- keep the ledger in CodeGraph PRD section 20 — the only section referencing no symbol, edge or line of source
- agent-written Markdown ledger — an agent cannot observe its own token usage or elapsed time, so the numbers would be invented rather than measured

**Files:** prd.md

<!-- whyline-event: 19a783052780465a85caa71d697df521 -->
