# CodeGraph Benchmark Harness (Plan 3 of 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the spec §10 Layer 3 benchmark harness — 12 adversarially-selected tasks scoring CodeGraph's deterministic retrieval against a strong agentic search-loop baseline — as fully deterministic, unit-tested infrastructure. This closes Definition-of-Done items 2 (MCP tools verified in two clients), 3 (zero stale bytes / zero unreported drift across an eval suite), and 5 (the 12-task benchmark, published with its adversarial selection criteria disclosed).

**Scope decision (confirmed with the human before writing this plan):** every task in this plan is buildable and testable with **zero live LLM calls** — the agentic-search baseline is captured as a data format (`AgentTrace`) that a scorer consumes, and the code that actually *produces* a trace by running a real Claude session (Task 10) is built here but not executed as part of this plan. Running it, publishing `BENCHMARK.md` with real numbers, and retuning ranking weights/`AUTO_REFRESH_LIMIT` from those numbers is Task 12 — one explicit, opt-in, manual procedure triggered whenever usage allows, not an automated plan step.

**Architecture:** A new `bench/harness/` layer, parallel to the existing `bench/oracle/` (Layer 2). `bench/harness/tasks.ts` holds the 12 task definitions with hand-verified ground truth against a new purpose-built fixture (`tests/fixtures/repos/medium/`) designed to genuinely exercise all five spec-mandated task categories (a real external repo's shape can't be guaranteed to fit them, and can't be verified without a network fetch this plan doesn't require). `codegraphRunner.ts` scores CodeGraph deterministically today. `traceScorer.ts` scores an externally-produced `AgentTrace` the same way, so both baselines produce a comparable `TaskResult`. `metrics.ts` aggregates. `report.ts` publishes `BENCHMARK.md`, honestly marking the agentic-baseline rows `PENDING` until Task 12 runs. `runLiveBaseline.ts` is the one piece that talks to a real model — built with dependency injection so its tool handlers are unit-tested without any API call.

**Tech Stack:** Existing stack unchanged (TypeScript strict, `better-sqlite3`, `vitest`, `tsx`). New: `@anthropic-ai/sdk` (devDependency only — used exclusively by `bench/harness/runLiveBaseline.ts`, never shipped in `dist/`) for the Tool Runner (`client.beta.messages.toolRunner`) that drives the live agentic-search baseline.

**Spec:** `docs/superpowers/specs/2026-08-16-codegraph-design.md` (revision 2), primarily §10 (Testing, Layer 3), §12 (Definition of done), §16 (open planning questions). `prd.md` §19 is background only — informative on ground-truth methodology (required/helpful/distractor evidence), never the build target; the spec's narrower 12-task, 2-baseline, 5-category scope in §10 governs everywhere it's more specific than the PRD's 30-task, 5-baseline vision.

## Global Constraints

- **Node 22+**; ESM only. `nvm use` before every `npm`/`node` command.
- **Zero native compilation** for the shipped package. `@anthropic-ai/sdk` is pure JS/fetch, and it is a `devDependency` — it must never be imported from anything under `src/`, only from `bench/harness/`.
- **SEC-008:** never execute repository code. The live baseline's `read_file`/`grep`/`glob` tools only read bytes and list paths through `RepoBoundary` — they never `require`/`import`/`eval` anything from a fixture repo.
- **SEC-001/002/003:** every fixture-repo filesystem read in `bench/harness/` goes through `src/repo/boundary.ts`, exactly like production code.
- **Never fabricate evidence.** A task's ground truth is hand-verified against the actual fixture files this plan creates (Task 2) — every `stableKey` cited in `bench/harness/tasks.ts` must be checked against Task 2's file contents before Task 4 is committed.
- **The 12-task, 2-baseline, 5-category shape is fixed by spec §10** — do not add tasks, add a third baseline, or invent new categories. If a category feels short a task, that is a signal to look harder at the existing fixture, not to change the shape.
- **Commit after every task.** Conventional commits.

### Out of scope for this plan

- **Actually running the live agentic baseline and publishing real `BENCHMARK.md` numbers.** Built (Task 10), documented (Task 12), not executed by this plan — confirmed scope decision above.
- **Ranking-weight and `AUTO_REFRESH_LIMIT` retuning itself** (spec §16.2-3). The *procedure* is documented in Task 12; applying it requires real benchmark numbers that don't exist until the live run happens.
- **The `COMPILER` tier / `tsResolver` upgrade pass, `TESTS` edges, the Swift adapter.** Unchanged from Plan 2's out-of-scope list — still separate, larger work.
- **A third "large" externally-cloned fixture as a ground-truth source.** Named and pinned for Task 12's optional scale/latency stress-test only; the 12 scored tasks all target the medium fixture built in Task 2, which this plan can fully verify without a network fetch.

---

## File Structure

```
src/
  query/impact.ts        # MODIFIED — ImpactRow gains a tier field (Task 1)
bench/
  harness/
    types.ts               # NEW — BenchmarkTask, GroundTruth, AgentTrace, TaskResult
    tasks.ts                # NEW — the 12 task definitions
    codegraphRunner.ts       # NEW — deterministic CodeGraph-side scorer
    metrics.ts                 # NEW — recall/aggregate metrics, pure functions
    traceScorer.ts               # NEW — scores an externally-produced AgentTrace
    report.ts                     # NEW — publishes BENCHMARK.md
    runLiveBaseline.ts             # NEW — Tool Runner agentic-search baseline (not executed by this plan)
tests/
  query/impact.test.ts     # MODIFIED — asserts ImpactRow.tier
  harness/
    fixtures.test.ts         # NEW — sanity-checks the medium fixture
    codegraphRunner.test.ts   # NEW
    metrics.test.ts            # NEW
    traceScorer.test.ts         # NEW
    driftEval.test.ts            # NEW — DoD item 3
    runLiveBaseline.test.ts       # NEW — tool handlers only, no network
  fixtures/repos/medium/          # NEW — purpose-built fixture, ~15 files
docs/
  mcp-client-verification.md # NEW — DoD item 2 manual checklist
package.json                # MODIFIED — @anthropic-ai/sdk devDependency, bench:harness script
BENCHMARK.md                # NEW (generated by Task 8; agentic rows PENDING until Task 12)
```

---

### Task 1: Expose edge tier on `ImpactRow`

**Files:**
- Modify: `src/query/impact.ts`
- Test: `tests/query/impact.test.ts`

**Interfaces:**
- Consumes: nothing new — `CandidateRow` already selects `${TIER_RANK_SQL} AS tierRank` (added during the earlier Task 8 review fix); this task adds the literal tier string alongside it.
- Produces: `ImpactRow` gains `tier: "COMPILER" | "LEXICAL" | "HEURISTIC"`. Task 5 (`codegraphRunner.ts`) reads this field to compute tier-utility for impact-radius-based benchmark tasks — the four transitive-impact tasks in the benchmark have no other way to tell whether their required evidence was found via a confidently-resolved edge or a heuristic guess.

- [ ] **Step 1: Write the failing test**

```ts
// tests/query/impact.test.ts — add inside describe("getImpactRadius", ...)
it("reports the tier of the edge that reached each affected node", () => {
  const result = getImpactRadius(db, boundary, {
    symbols: ["ts:src/base.ts#Base"],
  });

  expect(result.affected).toContainEqual(
    expect.objectContaining({ stableKey: "ts:src/mid.ts#Mid", tier: "LEXICAL" }),
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `nvm use && npx vitest run tests/query/impact.test.ts -t "reports the tier"`
Expected: FAIL — `tier` is `undefined` on the returned row (property does not exist on the type either, so `npm run typecheck` also fails once the test file references it).

- [ ] **Step 3: Implement**

```ts
// src/query/impact.ts — three small edits

// 1. ImpactRow gains a field:
export interface ImpactRow {
  stableKey: string;
  path: string;
  qualifiedName: string;
  kind: string;
  depth: number;
  viaKind: string;
  tier: "COMPILER" | "LEXICAL" | "HEURISTIC";
}

// 2. CandidateRow gains a field, and the SELECT list gains `e.tier AS tier`
//    (placed anywhere in the column list — SQL parameter order is unaffected,
//    only WHERE/subquery placeholders are positional):
interface CandidateRow {
  id: number;
  stableKey: string;
  path: string;
  qualifiedName: string;
  kind: string;
  viaKind: string;
  tier: "COMPILER" | "LEXICAL" | "HEURISTIC";
  tierRank: number;
  exported: number;
  fanIn: number;
}
// In the prepared statement's SELECT list, change:
//   source.exported AS exported, e.kind AS viaKind,
//   ${TIER_RANK_SQL} AS tierRank,
// to:
//   source.exported AS exported, e.kind AS viaKind, e.tier AS tier,
//   ${TIER_RANK_SQL} AS tierRank,

// 3. Where affected rows are pushed, add the field:
result.affected.push({
  stableKey: row.stableKey,
  path: row.path,
  qualifiedName: row.qualifiedName,
  kind: row.kind,
  depth,
  viaKind: row.viaKind,
  tier: row.tier,
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `nvm use && npx vitest run tests/query/impact.test.ts`
Expected: PASS, including the existing 12 tests in this file (unchanged — none assert the exact shape of `affected` rows with `toEqual`, only `toContainEqual(expect.objectContaining(...))`, confirmed by reading the file before writing this task).

- [ ] **Step 5: Run the full suite, typecheck, and build**

Run: `npm test && npm run typecheck && npm run build`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add src/query/impact.ts tests/query/impact.test.ts
git commit -m "feat: expose edge tier on ImpactRow"
```

---

### Task 2: The medium benchmark fixture

**Files:**
- Create: `tests/fixtures/repos/medium/tsconfig.json` and 15 files under `tests/fixtures/repos/medium/src/`
- Test: `tests/harness/fixtures.test.ts`

**Interfaces:**
- Consumes: `indexRepo` (`src/index/pipeline.js`), `RepoBoundary` (`src/repo/boundary.js`), `openDb`/`migrate` (`src/store/index.js`) — all existing, unchanged.
- Produces: a fixture repository at `tests/fixtures/repos/medium/`. Task 4 (`bench/harness/tasks.ts`) cites exact `stableKey`s from these files; Task 9's drift eval mutates copies of them.

**Why a hand-built fixture, not a cloned real repo:** spec §16 leaves fixture selection open. `LanguageAdapter` — this project's own only genuinely "wide" interface candidate — has exactly one implementer (`typescriptAdapter`); grepping the codebase (done before writing this task) confirms no interface here has 5+ implementers, so CodeGraph's own repo can't host the `implementations_of`-across-a-wide-interface tasks. A cloned external repo could, but its exact symbol names can't be verified without a network fetch, and ground truth that can't be checked against the actual file contents violates this plan's own "never fabricate evidence" constraint. A small, purpose-built fixture — the same pattern the project already uses for `tests/fixtures/repos/small` and `tests/fixtures/ts/*` — lets every one of the 12 tasks target a feature (a 5-implementer interface, a 3-hop call chain, a synonym gap) by construction, verified by reading the files below.

**Domain:** a task-notification system — a `Notifier` interface with five implementations, a dispatcher that calls all of them, a retry-backoff function with no lexical overlap to "retry"/"wait", and a small test suite.

- [ ] **Step 1: Write the failing sanity test**

```ts
// tests/harness/fixtures.test.ts
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { indexRepo } from "../../src/index/pipeline.js";
import { migrate, openDb } from "../../src/store/index.js";

const FIXTURE = join(process.cwd(), "tests/fixtures/repos/medium");
let dbPath: string;
let tempDir: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "cg-medium-fixture-"));
  dbPath = join(tempDir, "index.sqlite");
});

afterEach(() => rmSync(tempDir, { recursive: true, force: true }));

describe("medium fixture", () => {
  it("indexes cleanly with five Notifier implementations and no parse failures", async () => {
    const stats = await indexRepo(FIXTURE, dbPath);
    expect(stats.parseFailures).toBe(0);

    const db = openDb(dbPath);
    try {
      migrate(db);
      const implementers = db
        .prepare(
          `SELECT COUNT(*) AS count FROM edge WHERE kind = 'IMPLEMENTS'
           AND dst_symbol_id = (
             SELECT id FROM symbol WHERE stable_key = 'ts:src/notifiers/notifier.ts#Notifier'
           )`,
        )
        .get() as { count: number };
      expect(implementers.count).toBe(5);

      const depthThreeTarget = db
        .prepare("SELECT id FROM symbol WHERE stable_key = ?")
        .get("ts:src/notifiers/emailNotifier.ts#EmailNotifier.sendMail");
      expect(depthThreeTarget).toBeDefined();
    } finally {
      db.close();
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `nvm use && npx vitest run tests/harness/fixtures.test.ts`
Expected: FAIL — `tests/fixtures/repos/medium` does not exist, `indexRepo` throws or `stats.parseFailures` is not `0` (no files found).

- [ ] **Step 3: Create the fixture**

```json
// tests/fixtures/repos/medium/tsconfig.json
{ "compilerOptions": { "strict": true, "moduleResolution": "bundler" } }
```

```ts
// tests/fixtures/repos/medium/src/core/task.ts
export type Priority = "low" | "medium" | "high";

export interface Task {
  id: string;
  title: string;
  priority: Priority;
}
```

```ts
// tests/fixtures/repos/medium/src/notifiers/notifier.ts
import type { Task } from "../core/task.js";

export interface TaskEvent {
  task: Task;
  kind: "created" | "completed";
}

export interface Notifier {
  notify(event: TaskEvent): void;
}
```

```ts
// tests/fixtures/repos/medium/src/notifiers/emailNotifier.ts
import type { Notifier, TaskEvent } from "./notifier.js";

export class EmailNotifier implements Notifier {
  notify(event: TaskEvent): void {
    this.sendMail(`Task ${event.kind}: ${event.task.title}`);
  }

  private sendMail(body: string): void {
    console.log(`[email] ${body}`);
  }
}
```

```ts
// tests/fixtures/repos/medium/src/notifiers/slackNotifier.ts
import type { Notifier, TaskEvent } from "./notifier.js";

export class SlackNotifier implements Notifier {
  notify(event: TaskEvent): void {
    this.postMessage(`Task ${event.kind}: ${event.task.title}`);
  }

  private postMessage(text: string): void {
    console.log(`[slack] ${text}`);
  }
}
```

```ts
// tests/fixtures/repos/medium/src/notifiers/smsNotifier.ts
import type { Notifier, TaskEvent } from "./notifier.js";

export class SmsNotifier implements Notifier {
  notify(event: TaskEvent): void {
    this.sendText(`${event.kind}: ${event.task.title}`);
  }

  private sendText(body: string): void {
    console.log(`[sms] ${body}`);
  }
}
```

```ts
// tests/fixtures/repos/medium/src/notifiers/webhookNotifier.ts
import type { Notifier, TaskEvent } from "./notifier.js";

export class WebhookNotifier implements Notifier {
  notify(event: TaskEvent): void {
    this.post(JSON.stringify(event));
  }

  private post(payload: string): void {
    console.log(`[webhook] ${payload}`);
  }
}
```

```ts
// tests/fixtures/repos/medium/src/notifiers/consoleNotifier.ts
import type { Notifier, TaskEvent } from "./notifier.js";

export class ConsoleNotifier implements Notifier {
  notify(event: TaskEvent): void {
    this.print(`${event.kind}: ${event.task.title}`);
  }

  private print(line: string): void {
    console.log(`[console] ${line}`);
  }
}
```

```ts
// tests/fixtures/repos/medium/src/scheduler/queue.ts
import type { Task } from "../core/task.js";

export class TaskQueue {
  private items: Task[] = [];

  enqueue(task: Task): void {
    this.items.push(task);
  }

  pending(): Task[] {
    return this.items;
  }
}
```

```ts
// tests/fixtures/repos/medium/src/scheduler/retryPolicy.ts
// The maximum number of attempts before a caller should give up entirely.
export const MAX_ATTEMPTS = 5;

/** How many milliseconds to hold off before the next attempt. */
export function nextDelay(attempt: number): number {
  return Math.min(30000, 2 ** attempt * 100);
}
```

```ts
// tests/fixtures/repos/medium/src/scheduler/dispatcher.ts
import type { Notifier, TaskEvent } from "../notifiers/notifier.js";
import type { TaskQueue } from "./queue.js";

export class Dispatcher {
  constructor(
    private readonly notifiers: Notifier[],
    private readonly queue: TaskQueue,
  ) {}

  dispatch(event: TaskEvent): void {
    this.queue.enqueue(event.task);
    for (const notifier of this.notifiers) {
      notifier.notify(event);
    }
  }
}
```

```ts
// tests/fixtures/repos/medium/src/reports/dailyDigest.ts
import type { TaskQueue } from "../scheduler/queue.js";

export function summarizeActivity(queue: TaskQueue): string {
  return `${queue.pending().length} pending`;
}
```

```ts
// tests/fixtures/repos/medium/src/index.ts
import type { Task } from "./core/task.js";
import { ConsoleNotifier } from "./notifiers/consoleNotifier.js";
import { EmailNotifier } from "./notifiers/emailNotifier.js";
import type { Notifier } from "./notifiers/notifier.js";
import { SlackNotifier } from "./notifiers/slackNotifier.js";
import { SmsNotifier } from "./notifiers/smsNotifier.js";
import { WebhookNotifier } from "./notifiers/webhookNotifier.js";
import { Dispatcher } from "./scheduler/dispatcher.js";
import { TaskQueue } from "./scheduler/queue.js";

const notifiers: Notifier[] = [
  new EmailNotifier(),
  new SlackNotifier(),
  new SmsNotifier(),
  new WebhookNotifier(),
  new ConsoleNotifier(),
];
const dispatcher = new Dispatcher(notifiers, new TaskQueue());

export function start(task: Task): void {
  dispatcher.dispatch({ task, kind: "created" });
}
```

```ts
// tests/fixtures/repos/medium/src/scheduler/dispatcher.test.ts
import { describe, expect, it, vi } from "vitest";
import type { Notifier } from "../notifiers/notifier.js";
import { Dispatcher } from "./dispatcher.js";
import { TaskQueue } from "./queue.js";

describe("Dispatcher", () => {
  it("notifies every registered notifier and enqueues the task", () => {
    const notified: string[] = [];
    const fake: Notifier = { notify: () => notified.push("called") };
    const queue = new TaskQueue();
    const dispatcher = new Dispatcher([fake], queue);

    dispatcher.dispatch({
      task: { id: "1", title: "t", priority: "low" },
      kind: "created",
    });

    expect(notified).toEqual(["called"]);
    expect(queue.pending()).toHaveLength(1);
  });
});
```

```ts
// tests/fixtures/repos/medium/src/scheduler/retryPolicy.test.ts
import { describe, expect, it } from "vitest";
import { nextDelay } from "./retryPolicy.js";

describe("nextDelay", () => {
  it("grows exponentially and caps at 30 seconds", () => {
    expect(nextDelay(0)).toBe(100);
    expect(nextDelay(10)).toBe(30000);
  });
});
```

```ts
// tests/fixtures/repos/medium/src/notifiers/emailNotifier.test.ts
import { describe, expect, it, vi } from "vitest";
import { EmailNotifier } from "./emailNotifier.js";

describe("EmailNotifier", () => {
  it("logs the task title on notify", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    new EmailNotifier().notify({
      task: { id: "1", title: "Ship it", priority: "high" },
      kind: "created",
    });
    expect(spy).toHaveBeenCalledWith(expect.stringContaining("Ship it"));
    spy.mockRestore();
  });
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `nvm use && npx vitest run tests/harness/fixtures.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the full suite, typecheck, and build**

Run: `npm test && npm run typecheck && npm run build`
Expected: all PASS. (The new fixture's own `.test.ts` files run as part of the project's global `npx vitest run` unless excluded — check `vitest.config.ts`'s existing exclude pattern for `tests/fixtures/**`, which Plan 1 already added for the small fixture; confirm the medium fixture's tests are excluded the same way before running, so this plan's own suite count doesn't silently grow by 3 unrelated tests.)

- [ ] **Step 6: Commit**

```bash
git add tests/fixtures/repos/medium tests/harness/fixtures.test.ts
git commit -m "test: add the medium benchmark fixture repository"
```

---

### Task 3: Ground-truth and task-definition types

**Files:**
- Create: `bench/harness/types.ts`
- Test: none (pure type definitions; exercised by every later task's tests)

**Interfaces:**
- Consumes: `TraversePattern` (`src/query/traverse.js`).
- Produces: every type below. Tasks 4-10 all import from this file — get the shapes right here once.

```ts
// bench/harness/types.ts
import type { TraversePattern } from "../../src/query/traverse.js";

export type TaskCategory =
  | "transitive_impact"
  | "wide_interface"
  | "completeness"
  | "test_selection"
  | "semantic_disadvantage";

export interface EvidenceSymbol {
  stableKey: string;
  qualifiedName: string;
  path: string;
}

export interface GroundTruth {
  requiredEvidence: EvidenceSymbol[];
  helpfulEvidence: EvidenceSymbol[];
  distractors: EvidenceSymbol[];
  maxContextBudgetTokens: number;
}

export type TaskSeed =
  | { kind: "traverse"; pattern: TraversePattern; symbol: string }
  | { kind: "impact"; symbols: string[] }
  | { kind: "find"; query: string };

export interface BenchmarkTask {
  id: string;
  category: TaskCategory;
  fixture: string; // relative to repo root, e.g. "tests/fixtures/repos/medium"
  prompt: string; // the natural-language task given to the agentic baseline
  seed: TaskSeed; // how the CodeGraph-side runner answers the same task
  groundTruth: GroundTruth;
  rationale: string; // published with results — spec §10's disclosed-selection-bias requirement
}

export interface ToolCallRecord {
  tool: string;
  input: unknown;
  resultSummary: string;
}

/**
 * The output of one real agentic-search-baseline run against one task.
 * Produced by runLiveBaseline.ts (Task 10, not executed by this plan);
 * consumed by traceScorer.ts (Task 7). This is the seam between "build the
 * harness" and "run it live" — anything that can write this shape can be
 * scored, including a manually-recorded transcript.
 */
export interface AgentTrace {
  taskId: string;
  toolCalls: ToolCallRecord[];
  finalAnswerText: string;
  inputTokens: number;
  outputTokens: number;
  wallClockMs: number;
}

export interface TaskResult {
  taskId: string;
  category: TaskCategory;
  baseline: "agentic_search" | "codegraph";
  recallAtK: number; // fraction of requiredEvidence found, 0..1
  toolCalls: number;
  inputTokens: number;
  outputTokens: number;
  wallClockMs: number;
  /** Fraction of matched required evidence sourced from a LEXICAL/HEURISTIC
   *  edge rather than a trivial/COMPILER one. null when the baseline has no
   *  tier concept (always null for "agentic_search"). */
  tierUtility: number | null;
}
```

- [ ] **Step 1: Commit**

```bash
git add bench/harness/types.ts
git commit -m "feat: add benchmark harness ground-truth and result types"
```

---

### Task 4: The 12 task definitions

**Files:**
- Create: `bench/harness/tasks.ts`
- Test: `tests/harness/tasks.test.ts`

**Interfaces:**
- Consumes: `BenchmarkTask`, `TaskCategory` (Task 3).
- Produces: `export const BENCHMARK_TASKS: BenchmarkTask[]`. Tasks 5 and 7 iterate this array; Task 8's report groups by `category`.

Every `stableKey` below is checked against Task 2's fixture file contents (adapter naming convention confirmed by existing tests: `ts:${relativePath}#${qualifiedName}`, methods as `ClassName.methodName`).

- [ ] **Step 1: Write the failing test**

```ts
// tests/harness/tasks.test.ts
import { describe, expect, it } from "vitest";
import { BENCHMARK_TASKS } from "../../bench/harness/tasks.js";

describe("BENCHMARK_TASKS", () => {
  it("defines exactly 12 tasks", () => {
    expect(BENCHMARK_TASKS).toHaveLength(12);
  });

  it("matches the spec §10 category distribution", () => {
    const counts: Record<string, number> = {};
    for (const task of BENCHMARK_TASKS) {
      counts[task.category] = (counts[task.category] ?? 0) + 1;
    }
    expect(counts).toEqual({
      transitive_impact: 4,
      wide_interface: 2,
      completeness: 2,
      test_selection: 2,
      semantic_disadvantage: 2,
    });
  });

  it("gives every task at least one required-evidence symbol and a rationale", () => {
    for (const task of BENCHMARK_TASKS) {
      expect(task.groundTruth.requiredEvidence.length).toBeGreaterThan(0);
      expect(task.rationale.length).toBeGreaterThan(0);
    }
  });

  it("has no duplicate task ids", () => {
    const ids = new Set(BENCHMARK_TASKS.map((t) => t.id));
    expect(ids.size).toBe(BENCHMARK_TASKS.length);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `nvm use && npx vitest run tests/harness/tasks.test.ts`
Expected: FAIL — cannot resolve `bench/harness/tasks.js`.

- [ ] **Step 3: Implement**

```ts
// bench/harness/tasks.ts
import type { BenchmarkTask } from "./types.js";

const FIXTURE = "tests/fixtures/repos/medium";

function symbol(path: string, qualifiedName: string) {
  return { stableKey: `ts:${path}#${qualifiedName}`, qualifiedName, path };
}

export const BENCHMARK_TASKS: BenchmarkTask[] = [
  // -- transitive_impact (4) --------------------------------------------
  {
    id: "impact-notifier-signature",
    category: "transitive_impact",
    fixture: FIXTURE,
    prompt:
      "If I change the signature of Notifier.notify in " +
      "src/notifiers/notifier.ts, what breaks?",
    seed: { kind: "impact", symbols: ["ts:src/notifiers/notifier.ts#Notifier.notify"] },
    groundTruth: {
      requiredEvidence: [
        symbol("src/notifiers/emailNotifier.ts", "EmailNotifier.notify"),
        symbol("src/notifiers/slackNotifier.ts", "SlackNotifier.notify"),
        symbol("src/notifiers/smsNotifier.ts", "SmsNotifier.notify"),
        symbol("src/notifiers/webhookNotifier.ts", "WebhookNotifier.notify"),
        symbol("src/notifiers/consoleNotifier.ts", "ConsoleNotifier.notify"),
        symbol("src/scheduler/dispatcher.ts", "Dispatcher.dispatch"),
      ],
      helpfulEvidence: [symbol("src/index.ts", "start")],
      distractors: [symbol("src/scheduler/queue.ts", "TaskQueue.enqueue")],
      maxContextBudgetTokens: 4000,
    },
    rationale:
      "Depth-2 fan-out from an interface method to five implementers plus " +
      "its one caller — the class of change grep answers by luck (an " +
      "identifier search for 'notify' also finds unrelated notify-shaped " +
      "names) and CodeGraph answers by construction.",
  },
  {
    id: "impact-queue-enqueue",
    category: "transitive_impact",
    fixture: FIXTURE,
    prompt:
      "What depends on TaskQueue.enqueue in src/scheduler/queue.ts?",
    seed: { kind: "impact", symbols: ["ts:src/scheduler/queue.ts#TaskQueue.enqueue"] },
    groundTruth: {
      requiredEvidence: [
        symbol("src/scheduler/dispatcher.ts", "Dispatcher.dispatch"),
      ],
      helpfulEvidence: [symbol("src/index.ts", "start")],
      distractors: [symbol("src/reports/dailyDigest.ts", "summarizeActivity")],
      maxContextBudgetTokens: 2000,
    },
    rationale:
      "A single direct caller with one further transitive hop (dispatch is " +
      "itself called from start) — the simplest depth-2 case, included as a " +
      "floor for the harder fan-out tasks in this category.",
  },
  {
    id: "impact-dispatch-two-hop",
    category: "transitive_impact",
    fixture: FIXTURE,
    prompt: "What is the full blast radius of Dispatcher.dispatch changing behavior?",
    seed: { kind: "impact", symbols: ["ts:src/scheduler/dispatcher.ts#Dispatcher.dispatch"] },
    groundTruth: {
      requiredEvidence: [symbol("src/index.ts", "start")],
      helpfulEvidence: [],
      distractors: [symbol("src/reports/dailyDigest.ts", "summarizeActivity")],
      maxContextBudgetTokens: 2000,
    },
    rationale:
      "Reverse direction from the fan-out task above (starting mid-chain, " +
      "walking up instead of down) — checks the harness scores both " +
      "traversal directions of the same call graph consistently.",
  },
  {
    id: "impact-retry-policy",
    category: "transitive_impact",
    fixture: FIXTURE,
    prompt:
      "Nothing in this fixture currently calls nextDelay in " +
      "src/scheduler/retryPolicy.ts — confirm that and explain why a change " +
      "to it would be safe today.",
    seed: { kind: "impact", symbols: ["ts:src/scheduler/retryPolicy.ts#nextDelay"] },
    groundTruth: {
      requiredEvidence: [],
      helpfulEvidence: [],
      distractors: [symbol("src/scheduler/dispatcher.ts", "Dispatcher.dispatch")],
      maxContextBudgetTokens: 1000,
    },
    rationale:
      "A true-negative impact task — required evidence is deliberately " +
      "empty. Completeness tools that hedge by over-including distractors " +
      "score worse here than one confident, correct 'nothing calls this'.",
  },
  // -- wide_interface (2) -------------------------------------------------
  {
    id: "implementations-of-notifier",
    category: "wide_interface",
    fixture: FIXTURE,
    prompt: "List every class that implements the Notifier interface.",
    seed: { kind: "traverse", pattern: "implementations_of", symbol: "ts:src/notifiers/notifier.ts#Notifier" },
    groundTruth: {
      requiredEvidence: [
        symbol("src/notifiers/emailNotifier.ts", "EmailNotifier"),
        symbol("src/notifiers/slackNotifier.ts", "SlackNotifier"),
        symbol("src/notifiers/smsNotifier.ts", "SmsNotifier"),
        symbol("src/notifiers/webhookNotifier.ts", "WebhookNotifier"),
        symbol("src/notifiers/consoleNotifier.ts", "ConsoleNotifier"),
      ],
      helpfulEvidence: [],
      distractors: [],
      maxContextBudgetTokens: 2000,
    },
    rationale:
      "Five implementers across five files with no shared naming prefix — " +
      "the category spec §10 calls out by name, and the reason CodeGraph's " +
      "own repository (one LanguageAdapter implementer) couldn't host it.",
  },
  {
    id: "implementations-of-notifier-completeness",
    category: "wide_interface",
    fixture: FIXTURE,
    prompt:
      "I found EmailNotifier and SlackNotifier implement Notifier. Are there " +
      "others I'm missing?",
    seed: { kind: "traverse", pattern: "implementations_of", symbol: "ts:src/notifiers/notifier.ts#Notifier" },
    groundTruth: {
      requiredEvidence: [
        symbol("src/notifiers/smsNotifier.ts", "SmsNotifier"),
        symbol("src/notifiers/webhookNotifier.ts", "WebhookNotifier"),
        symbol("src/notifiers/consoleNotifier.ts", "ConsoleNotifier"),
      ],
      helpfulEvidence: [
        symbol("src/notifiers/emailNotifier.ts", "EmailNotifier"),
        symbol("src/notifiers/slackNotifier.ts", "SlackNotifier"),
      ],
      distractors: [],
      maxContextBudgetTokens: 2000,
    },
    rationale:
      "Same interface, framed as 'what am I missing' rather than 'list all' " +
      "— tests whether a partial-knowledge prompt still recovers full recall, " +
      "distinct from the completeness category's file-scoped framing below.",
  },
  // -- completeness (2) -----------------------------------------------------
  {
    id: "completeness-queue-callers",
    category: "completeness",
    fixture: FIXTURE,
    prompt:
      "Every place in this codebase that reads from or writes to the task " +
      "queue (src/scheduler/queue.ts) — I need the full list, not just the " +
      "obvious ones.",
    seed: { kind: "traverse", pattern: "callers_of", symbol: "ts:src/scheduler/queue.ts#TaskQueue.enqueue" },
    groundTruth: {
      requiredEvidence: [
        symbol("src/scheduler/dispatcher.ts", "Dispatcher.dispatch"),
      ],
      helpfulEvidence: [
        symbol("src/reports/dailyDigest.ts", "summarizeActivity"),
      ],
      distractors: [],
      maxContextBudgetTokens: 2000,
    },
    rationale:
      "'Every place' is an explicit completeness claim (spec §10's second " +
      "category) — a grep for 'queue' also matches TaskQueue.pending's " +
      "caller (dailyDigest), which is real but reads rather than writes; " +
      "distinguishing the two is the point of the task.",
  },
  {
    id: "completeness-notifier-references",
    category: "completeness",
    fixture: FIXTURE,
    prompt: "What in this codebase references the Notifier type, directly or as an array element type?",
    seed: { kind: "traverse", pattern: "references_to", symbol: "ts:src/notifiers/notifier.ts#Notifier" },
    groundTruth: {
      requiredEvidence: [symbol("src/index.ts", "start")],
      helpfulEvidence: [
        symbol("src/scheduler/dispatcher.ts", "Dispatcher.dispatch"),
      ],
      distractors: [],
      maxContextBudgetTokens: 2000,
    },
    rationale:
      "Type-position references (a constructor parameter typed Notifier[], " +
      "an array element type) are exactly the class of reference a plain " +
      "text search for call sites tends to under-count.",
  },
  // -- test_selection (2) -----------------------------------------------------
  {
    id: "tests-for-dispatcher-change",
    category: "test_selection",
    fixture: FIXTURE,
    prompt:
      "I'm about to change Dispatcher.dispatch in src/scheduler/dispatcher.ts " +
      "— which tests should I run?",
    seed: { kind: "find", query: "dispatcher" },
    groundTruth: {
      requiredEvidence: [
        symbol("src/scheduler/dispatcher.test.ts", "src/scheduler/dispatcher.test.ts"),
      ],
      helpfulEvidence: [],
      distractors: [
        symbol("src/scheduler/retryPolicy.test.ts", "src/scheduler/retryPolicy.test.ts"),
      ],
      maxContextBudgetTokens: 1500,
    },
    rationale:
      "This plan does not implement TESTS edges (deferred, same as Plan 2) " +
      "— seeded through find_symbols/file-name matching instead of " +
      "tests_for, so the scored baseline is honest about what v0.1 can " +
      "actually do here, not what the eventual TESTS-edge feature will do.",
  },
  {
    id: "tests-for-retry-policy-change",
    category: "test_selection",
    fixture: FIXTURE,
    prompt:
      "I'm about to change nextDelay in src/scheduler/retryPolicy.ts — which " +
      "test file should I run?",
    seed: { kind: "find", query: "retryPolicy" },
    groundTruth: {
      requiredEvidence: [
        symbol("src/scheduler/retryPolicy.test.ts", "src/scheduler/retryPolicy.test.ts"),
      ],
      helpfulEvidence: [],
      distractors: [
        symbol("src/scheduler/dispatcher.test.ts", "src/scheduler/dispatcher.test.ts"),
      ],
      maxContextBudgetTokens: 1500,
    },
    rationale:
      "Paired with the dispatcher test-selection task above using the same " +
      "seeding method against a different target, so a systematic bias in " +
      "one direction (e.g. always returning every *.test.ts file) shows up " +
      "as a recall/precision mismatch across the pair rather than being " +
      "invisible in a single task.",
  },
  // -- semantic_disadvantage (2) --------------------------------------------
  {
    id: "semantic-backoff-behavior",
    category: "semantic_disadvantage",
    fixture: FIXTURE,
    prompt:
      "Find the function that decides how long to wait before retrying a " +
      "failed notification.",
    seed: { kind: "find", query: "wait before retrying a failed notification" },
    groundTruth: {
      requiredEvidence: [
        symbol("src/scheduler/retryPolicy.ts", "nextDelay"),
      ],
      helpfulEvidence: [],
      distractors: [],
      maxContextBudgetTokens: 1000,
    },
    rationale:
      "Spec §2.1's first required semantic-disadvantage control: a " +
      "behavioral description with zero identifier overlap ('wait', " +
      "'retry', 'failed' appear nowhere in nextDelay/retryPolicy.ts). v0.1's " +
      "lexical+structural retrieval is expected to lose here — the point of " +
      "including it is to measure that loss honestly, not to hide it.",
  },
  {
    id: "semantic-alerting-synonym",
    category: "semantic_disadvantage",
    fixture: FIXTURE,
    prompt: "Where does this codebase implement alerting for task events?",
    seed: { kind: "find", query: "alerting" },
    groundTruth: {
      requiredEvidence: [
        symbol("src/notifiers/notifier.ts", "Notifier"),
      ],
      helpfulEvidence: [
        symbol("src/notifiers/emailNotifier.ts", "EmailNotifier"),
      ],
      distractors: [],
      maxContextBudgetTokens: 1000,
    },
    rationale:
      "Spec §2.1's second control: a synonym-heavy domain query ('alerting' " +
      "vs. the codebase's actual vocabulary, 'notify'/'Notifier') — the " +
      "other class embeddings are expected to win on, per §2.1's falsifiable " +
      "deferral criteria for semantic search.",
  },
];
```

- [ ] **Step 4: Run test to verify it passes**

Run: `nvm use && npx vitest run tests/harness/tasks.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the full suite, typecheck, and build**

Run: `npm test && npm run typecheck && npm run build`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add bench/harness/tasks.ts tests/harness/tasks.test.ts
git commit -m "feat: define the 12 adversarially-selected benchmark tasks"
```

---

### Task 5: CodeGraph-side deterministic runner

**Files:**
- Create: `bench/harness/codegraphRunner.ts`
- Test: `tests/harness/codegraphRunner.test.ts`

**Interfaces:**
- Consumes: `indexRepo` (`src/index/pipeline.js`), `findSymbols` (`src/query/find.js`), `queryGraph` (`src/query/traverse.js`), `getImpactRadius` (`src/query/impact.js`), `estimateJsonTokens` (`src/pack/tokens.js`), `BenchmarkTask`/`TaskResult`/`EvidenceSymbol` (Task 3).
- Produces: `runCodegraphTask(db: Db, task: BenchmarkTask): TaskResult`. Task 8's report calls this once per task; the resulting rows are always current (no `PENDING` state — unlike the agentic baseline, this needs no live LLM call).

- [ ] **Step 1: Write the failing test**

```ts
// tests/harness/codegraphRunner.test.ts
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runCodegraphTask } from "../../bench/harness/codegraphRunner.js";
import { indexRepo } from "../../src/index/pipeline.js";
import { migrate, openDb, type Db } from "../../src/store/index.js";
import { BENCHMARK_TASKS } from "../../bench/harness/tasks.js";

const FIXTURE = join(process.cwd(), "tests/fixtures/repos/medium");
let db: Db;
let tempDir: string;

beforeEach(async () => {
  tempDir = mkdtempSync(join(tmpdir(), "cg-runner-"));
  const dbPath = join(tempDir, "index.sqlite");
  await indexRepo(FIXTURE, dbPath);
  db = openDb(dbPath);
  migrate(db);
});

afterEach(() => {
  db.close();
  rmSync(tempDir, { recursive: true, force: true });
});

describe("runCodegraphTask", () => {
  it("finds all five Notifier implementers with recall 1.0", () => {
    const task = BENCHMARK_TASKS.find((t) => t.id === "implementations-of-notifier")!;
    const result = runCodegraphTask(db, task);

    expect(result.recallAtK).toBe(1);
    expect(result.toolCalls).toBe(1);
    expect(result.baseline).toBe("codegraph");
  });

  it("reports tier utility for a transitive impact task", () => {
    const task = BENCHMARK_TASKS.find((t) => t.id === "impact-notifier-signature")!;
    const result = runCodegraphTask(db, task);

    expect(result.recallAtK).toBeGreaterThan(0);
    expect(result.tierUtility).not.toBeNull();
    expect(result.tierUtility).toBeGreaterThanOrEqual(0);
    expect(result.tierUtility).toBeLessThanOrEqual(1);
  });

  it("scores the true-negative impact task as full recall on an empty requirement", () => {
    const task = BENCHMARK_TASKS.find((t) => t.id === "impact-retry-policy")!;
    const result = runCodegraphTask(db, task);

    expect(result.recallAtK).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `nvm use && npx vitest run tests/harness/codegraphRunner.test.ts`
Expected: FAIL — cannot resolve `bench/harness/codegraphRunner.js`.

- [ ] **Step 3: Implement**

```ts
// bench/harness/codegraphRunner.ts
import { findSymbols } from "../../src/query/find.js";
import { getImpactRadius } from "../../src/query/impact.js";
import { queryGraph } from "../../src/query/traverse.js";
import { estimateJsonTokens } from "../../src/pack/tokens.js";
import { RepoBoundary } from "../../src/repo/boundary.js";
import type { Db } from "../../src/store/db.js";
import type { BenchmarkTask, EvidenceSymbol, TaskResult } from "./types.js";

interface MatchedEvidence {
  matchedKeys: Set<string>;
  heuristicOrLexicalCount: number;
  matchedCount: number;
}

function recall(required: EvidenceSymbol[], matched: Set<string>): number {
  if (required.length === 0) return 1;
  const hits = required.filter((e) => matched.has(e.stableKey)).length;
  return hits / required.length;
}

function tierUtility(evidence: MatchedEvidence): number | null {
  if (evidence.matchedCount === 0) return null;
  return evidence.heuristicOrLexicalCount / evidence.matchedCount;
}

export function runCodegraphTask(db: Db, task: BenchmarkTask): TaskResult {
  const start = Date.now();
  let payload: unknown;
  let evidence: MatchedEvidence = { matchedKeys: new Set(), heuristicOrLexicalCount: 0, matchedCount: 0 };

  if (task.seed.kind === "traverse") {
    const result = queryGraph(db, { pattern: task.seed.pattern, symbol: task.seed.symbol });
    payload = result;
    for (const row of [...result.compiler, ...result.lexical, ...result.heuristic]) {
      evidence.matchedKeys.add(row.stableKey);
    }
    evidence.matchedCount = evidence.matchedKeys.size;
    evidence.heuristicOrLexicalCount = new Set(
      [...result.lexical, ...result.heuristic].map((r) => r.stableKey),
    ).size;
  } else if (task.seed.kind === "impact") {
    // Fixture root is fixed at index time by Task 2/5's caller; RepoBoundary
    // here only satisfies getImpactRadius's signature — it never reads bytes
    // for a benchmark task, which only ever traverses the pre-built index.
    const boundary = new RepoBoundary(process.cwd());
    const result = getImpactRadius(db, boundary, { symbols: task.seed.symbols });
    payload = result;
    for (const row of result.affected) {
      evidence.matchedKeys.add(row.stableKey);
      if (row.tier === "LEXICAL" || row.tier === "HEURISTIC") {
        evidence.heuristicOrLexicalCount += 1;
      }
    }
    evidence.matchedCount = evidence.matchedKeys.size;
  } else {
    const results = findSymbols(db, { query: task.seed.query });
    payload = results;
    for (const row of results) evidence.matchedKeys.add(row.stableKey);
    evidence.matchedCount = evidence.matchedKeys.size;
    // find_symbols carries no tier — every hit is either exact-name or FTS.
  }

  const wallClockMs = Date.now() - start;
  return {
    taskId: task.id,
    category: task.category,
    baseline: "codegraph",
    recallAtK: recall(task.groundTruth.requiredEvidence, evidence.matchedKeys),
    // One MCP/CLI call answers the whole task deterministically — unlike an
    // agentic loop, there is no exploratory back-and-forth to count.
    toolCalls: 1,
    inputTokens: estimateJsonTokens(task.prompt),
    outputTokens: estimateJsonTokens(payload),
    wallClockMs,
    tierUtility: tierUtility(evidence),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `nvm use && npx vitest run tests/harness/codegraphRunner.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the full suite, typecheck, and build**

Run: `npm test && npm run typecheck && npm run build`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add bench/harness/codegraphRunner.ts tests/harness/codegraphRunner.test.ts
git commit -m "feat: add the deterministic CodeGraph-side benchmark runner"
```

---

### Task 6: Metrics aggregation

**Files:**
- Create: `bench/harness/metrics.ts`
- Test: `tests/harness/metrics.test.ts`

**Interfaces:**
- Consumes: `TaskResult` (Task 3).
- Produces: `aggregateResults(results: TaskResult[]): AggregatedMetrics`. Task 8's report calls this once per baseline to build `BENCHMARK.md`'s summary table.

```ts
// bench/harness/metrics.ts (interface shape referenced by Task 8)
export interface AggregatedMetrics {
  baseline: "agentic_search" | "codegraph";
  taskCount: number;
  meanRecallAtK: number;
  meanToolCalls: number;
  meanInputTokens: number;
  meanOutputTokens: number;
  meanWallClockMs: number;
  meanTierUtility: number | null; // null when no scored task reported a non-null tierUtility
}
```

- [ ] **Step 1: Write the failing test**

```ts
// tests/harness/metrics.test.ts
import { describe, expect, it } from "vitest";
import { aggregateResults } from "../../bench/harness/metrics.js";
import type { TaskResult } from "../../bench/harness/types.js";

function result(overrides: Partial<TaskResult>): TaskResult {
  return {
    taskId: "t",
    category: "transitive_impact",
    baseline: "codegraph",
    recallAtK: 1,
    toolCalls: 1,
    inputTokens: 10,
    outputTokens: 10,
    wallClockMs: 5,
    tierUtility: null,
    ...overrides,
  };
}

describe("aggregateResults", () => {
  it("averages recall, tokens, and latency across tasks", () => {
    const agg = aggregateResults([
      result({ recallAtK: 1, inputTokens: 100, wallClockMs: 10 }),
      result({ recallAtK: 0.5, inputTokens: 200, wallClockMs: 20 }),
    ]);

    expect(agg.taskCount).toBe(2);
    expect(agg.meanRecallAtK).toBeCloseTo(0.75);
    expect(agg.meanInputTokens).toBeCloseTo(150);
    expect(agg.meanWallClockMs).toBeCloseTo(15);
  });

  it("averages tier utility only over tasks that reported one", () => {
    const agg = aggregateResults([
      result({ tierUtility: 1 }),
      result({ tierUtility: null }),
      result({ tierUtility: 0.5 }),
    ]);

    expect(agg.meanTierUtility).toBeCloseTo(0.75);
  });

  it("reports null tier utility when nothing measured it", () => {
    const agg = aggregateResults([result({ tierUtility: null })]);
    expect(agg.meanTierUtility).toBeNull();
  });

  it("throws on an empty or mixed-baseline result set", () => {
    expect(() => aggregateResults([])).toThrow();
    expect(() =>
      aggregateResults([
        result({ baseline: "codegraph" }),
        result({ baseline: "agentic_search" }),
      ]),
    ).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `nvm use && npx vitest run tests/harness/metrics.test.ts`
Expected: FAIL — cannot resolve `bench/harness/metrics.js`.

- [ ] **Step 3: Implement**

```ts
// bench/harness/metrics.ts
import type { TaskResult } from "./types.js";

export interface AggregatedMetrics {
  baseline: "agentic_search" | "codegraph";
  taskCount: number;
  meanRecallAtK: number;
  meanToolCalls: number;
  meanInputTokens: number;
  meanOutputTokens: number;
  meanWallClockMs: number;
  meanTierUtility: number | null;
}

function mean(values: number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

export function aggregateResults(results: TaskResult[]): AggregatedMetrics {
  if (results.length === 0) {
    throw new Error("aggregateResults requires at least one TaskResult");
  }
  const baseline = results[0]!.baseline;
  if (results.some((r) => r.baseline !== baseline)) {
    throw new Error("aggregateResults requires a single baseline per call");
  }

  const tierUtilities = results
    .map((r) => r.tierUtility)
    .filter((v): v is number => v !== null);

  return {
    baseline,
    taskCount: results.length,
    meanRecallAtK: mean(results.map((r) => r.recallAtK)),
    meanToolCalls: mean(results.map((r) => r.toolCalls)),
    meanInputTokens: mean(results.map((r) => r.inputTokens)),
    meanOutputTokens: mean(results.map((r) => r.outputTokens)),
    meanWallClockMs: mean(results.map((r) => r.wallClockMs)),
    meanTierUtility: tierUtilities.length > 0 ? mean(tierUtilities) : null,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `nvm use && npx vitest run tests/harness/metrics.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the full suite, typecheck, and build**

Run: `npm test && npm run typecheck && npm run build`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add bench/harness/metrics.ts tests/harness/metrics.test.ts
git commit -m "feat: add benchmark metrics aggregation"
```

---

### Task 7: Agent trace scorer

**Files:**
- Create: `bench/harness/traceScorer.ts`
- Test: `tests/harness/traceScorer.test.ts`

**Interfaces:**
- Consumes: `BenchmarkTask`, `AgentTrace`, `TaskResult` (Task 3).
- Produces: `scoreTrace(task: BenchmarkTask, trace: AgentTrace): TaskResult`. Task 8's report calls this for every trace file it finds under `bench/harness/traces/`; Task 10's live runner produces the traces this consumes.

**Scoring method (an implementation decision, not spec-mandated — stated here so it's easy to challenge):** a required-evidence symbol counts as found if its `qualifiedName` appears as a case-insensitive substring of the trace's `finalAnswerText`. This is intentionally simple — text-containment, not semantic matching — because it is deterministic, auditable from the published trace, and doesn't require a second LLM call (an "LLM judge") that would need its own validation the way PRD §25 already flags end-to-end success judging as unresolved.

- [ ] **Step 1: Write the failing test**

```ts
// tests/harness/traceScorer.test.ts
import { describe, expect, it } from "vitest";
import { scoreTrace } from "../../bench/harness/traceScorer.js";
import { BENCHMARK_TASKS } from "../../bench/harness/tasks.js";
import type { AgentTrace } from "../../bench/harness/types.js";

describe("scoreTrace", () => {
  it("finds full recall when every required symbol is named in the answer", () => {
    const task = BENCHMARK_TASKS.find((t) => t.id === "implementations-of-notifier")!;
    const trace: AgentTrace = {
      taskId: task.id,
      toolCalls: [
        { tool: "grep", input: { pattern: "implements Notifier" }, resultSummary: "5 matches" },
      ],
      finalAnswerText:
        "EmailNotifier, SlackNotifier, SmsNotifier, WebhookNotifier, and " +
        "ConsoleNotifier all implement Notifier.",
      inputTokens: 500,
      outputTokens: 40,
      wallClockMs: 3000,
    };

    const result = scoreTrace(task, trace);
    expect(result.recallAtK).toBe(1);
    expect(result.baseline).toBe("agentic_search");
    expect(result.toolCalls).toBe(1);
    expect(result.tierUtility).toBeNull();
  });

  it("scores partial recall when only some required symbols are named", () => {
    const task = BENCHMARK_TASKS.find((t) => t.id === "implementations-of-notifier")!;
    const trace: AgentTrace = {
      taskId: task.id,
      toolCalls: [],
      finalAnswerText: "EmailNotifier and SlackNotifier implement Notifier.",
      inputTokens: 100,
      outputTokens: 10,
      wallClockMs: 500,
    };

    const result = scoreTrace(task, trace);
    expect(result.recallAtK).toBeCloseTo(2 / 5);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `nvm use && npx vitest run tests/harness/traceScorer.test.ts`
Expected: FAIL — cannot resolve `bench/harness/traceScorer.js`.

- [ ] **Step 3: Implement**

```ts
// bench/harness/traceScorer.ts
import type { AgentTrace, BenchmarkTask, TaskResult } from "./types.js";

export function scoreTrace(task: BenchmarkTask, trace: AgentTrace): TaskResult {
  const answer = trace.finalAnswerText.toLowerCase();
  const required = task.groundTruth.requiredEvidence;
  const hits = required.filter((e) => answer.includes(e.qualifiedName.toLowerCase())).length;

  return {
    taskId: task.id,
    category: task.category,
    baseline: "agentic_search",
    recallAtK: required.length === 0 ? 1 : hits / required.length,
    toolCalls: trace.toolCalls.length,
    inputTokens: trace.inputTokens,
    outputTokens: trace.outputTokens,
    wallClockMs: trace.wallClockMs,
    // A grep/glob/read loop has no tier concept to report on.
    tierUtility: null,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `nvm use && npx vitest run tests/harness/traceScorer.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the full suite, typecheck, and build**

Run: `npm test && npm run typecheck && npm run build`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add bench/harness/traceScorer.ts tests/harness/traceScorer.test.ts
git commit -m "feat: add the agentic-baseline trace scorer"
```

---

### Task 8: BENCHMARK.md report

**Files:**
- Create: `bench/harness/report.ts`
- Modify: `package.json` (add `bench:harness` script)
- Test: none (a script, same precedent as `bench/report.ts`, which also has no direct test — its pieces, `bench/oracle/compare.ts`/`extract.ts`, do; here that's `metrics.ts`/`codegraphRunner.ts`/`traceScorer.ts`, all tested in Tasks 5-7)

**Interfaces:**
- Consumes: `BENCHMARK_TASKS` (Task 4), `runCodegraphTask` (Task 5), `aggregateResults` (Task 6), `scoreTrace` (Task 7), `indexRepo` (`src/index/pipeline.js`).
- Produces: `BENCHMARK.md` at the repo root, and `npm run bench:harness`. This is the DoD item 5 deliverable — running it today publishes real CodeGraph numbers and honestly-labeled `PENDING` agentic rows; running it after Task 12 publishes both.

- [ ] **Step 1: Implement**

```ts
// bench/harness/report.ts
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { indexRepo } from "../../src/index/pipeline.js";
import { migrate, openDb } from "../../src/store/index.js";
import { runCodegraphTask } from "./codegraphRunner.js";
import { aggregateResults, type AggregatedMetrics } from "./metrics.js";
import { scoreTrace } from "./traceScorer.js";
import { BENCHMARK_TASKS } from "./tasks.js";
import type { TaskResult } from "./types.js";

const TRACES_DIR = join(process.cwd(), "bench/harness/traces");

function loadTrace(taskId: string): TaskResult | null {
  const path = join(TRACES_DIR, `${taskId}.json`);
  if (!existsSync(path)) return null;
  const task = BENCHMARK_TASKS.find((t) => t.id === taskId)!;
  const trace = JSON.parse(readFileSync(path, "utf8"));
  return scoreTrace(task, trace);
}

function summaryRow(label: string, agg: AggregatedMetrics | null): string {
  if (!agg) {
    return `| ${label} | PENDING — live baseline not yet run (see Task 12) | | | | | |`;
  }
  const tierCol = agg.meanTierUtility === null ? "n/a" : agg.meanTierUtility.toFixed(3);
  return `| ${label} | ${agg.meanRecallAtK.toFixed(3)} | ${agg.meanToolCalls.toFixed(1)} | ` +
    `${agg.meanInputTokens.toFixed(0)} | ${agg.meanOutputTokens.toFixed(0)} | ` +
    `${agg.meanWallClockMs.toFixed(0)} | ${tierCol} |`;
}

const tempDir = mkdtempSync(join(tmpdir(), "codegraph-bench-"));
const dbPath = join(tempDir, "index.sqlite");

try {
  await indexRepo(join(process.cwd(), "tests/fixtures/repos/medium"), dbPath);
  const db = openDb(dbPath);
  migrate(db);

  const codegraphResults: TaskResult[] = [];
  const agenticResults: TaskResult[] = [];
  const rows: string[] = [];

  for (const task of BENCHMARK_TASKS) {
    const cg = runCodegraphTask(db, task);
    codegraphResults.push(cg);
    const agentic = loadTrace(task.id);
    if (agentic) agenticResults.push(agentic);

    rows.push(
      `| ${task.id} | ${task.category} | ${cg.recallAtK.toFixed(2)} | ` +
        `${agentic ? agentic.recallAtK.toFixed(2) : "PENDING"} |`,
    );
  }

  db.close();

  const lines = [
    "# CodeGraph vs. agentic search — 12-task benchmark",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "Adversarially selected per spec §10 Layer 3, not drawn uniformly — a " +
      "uniform sample would show parity on tasks modern agentic search is " +
      "already good at and invite the wrong conclusion. Selection criteria, " +
      "disclosed as the spec requires:",
    "",
    "- Transitive impact at depth >= 2 (4 tasks)",
    "- `implementations_of` across a wide interface (2 tasks)",
    "- Completeness claims — \"what did I miss\" (2 tasks)",
    "- Test selection for a change (2 tasks)",
    "- Semantic-disadvantage controls (2 tasks) — behavioral description with " +
      "no identifier overlap, and a synonym-heavy domain query; these two are " +
      "the classes v0.1's lexical+structural retrieval is *expected to lose*, " +
      "per spec §2.1's falsifiable deferral of semantic search.",
    "",
    "## Summary",
    "",
    "| Baseline | Mean recall@k | Mean tool calls | Mean input tokens | " +
      "Mean output tokens | Mean latency (ms) | Mean tier utility |",
    "|---|---:|---:|---:|---:|---:|---:|",
    summaryRow("CodeGraph", aggregateResults(codegraphResults)),
    summaryRow(
      "Agentic search",
      agenticResults.length > 0 ? aggregateResults(agenticResults) : null,
    ),
    "",
    "## Per-task recall@k",
    "",
    "| Task | Category | CodeGraph | Agentic search |",
    "|---|---|---:|---:|",
    ...rows,
    "",
  ];

  const output = lines.join("\n");
  writeFileSync(join(process.cwd(), "BENCHMARK.md"), output);
  console.log(output);
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}
```

```json
// package.json — add alongside the existing "bench:oracle" script
"bench:harness": "node --import tsx bench/harness/report.ts"
```

- [ ] **Step 2: Run it**

Run: `nvm use && npm run bench:harness`
Expected: exits 0, writes `BENCHMARK.md` with real `CodeGraph` numbers and an `Agentic search` row reading `PENDING — live baseline not yet run` (no trace files exist yet — that's Task 12, correctly deferred).

- [ ] **Step 3: Run the full suite, typecheck, and build**

Run: `npm test && npm run typecheck && npm run build`
Expected: all PASS. `BENCHMARK.md` is a generated artifact — check whether the project's `.gitignore` pattern for `ORACLE.md` (if any) applies, or whether it's checked in like `ORACLE.md` currently is; follow that existing precedent rather than introducing a new one.

- [ ] **Step 4: Commit**

```bash
git add bench/harness/report.ts package.json BENCHMARK.md
git commit -m "feat: publish the 12-task BENCHMARK.md report"
```

---

### Task 9: Freshness eval suite (DoD item 3)

**Files:**
- Create: `tests/harness/driftEval.test.ts`

**Interfaces:**
- Consumes: `ensureFresh`, `verifySymbolBody` (`src/pack/refresh.js`, `src/pack/verify.js`), `indexRepo` (`src/index/pipeline.js`), `RepoBoundary` (`src/repo/boundary.js`).
- Produces: nothing new — this task is pure verification, closing DoD item 3 ("zero stale bytes and zero unreported drift across the eval suite") by running Plan 2's freshness guarantees repeatedly against a real, larger fixture than Plan 2's own unit tests used, and folding the result into `npm test` so it's continuously checked rather than a one-off report.

- [ ] **Step 1: Write the failing test**

```ts
// tests/harness/driftEval.test.ts
import { cpSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { indexRepo } from "../../src/index/pipeline.js";
import { ensureFresh } from "../../src/pack/refresh.js";
import { verifySymbolBody } from "../../src/pack/verify.js";
import { RepoBoundary } from "../../src/repo/boundary.js";

let root: string;
let dbPath: string;

beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), "cg-drift-eval-"));
  cpSync(join(process.cwd(), "tests/fixtures/repos/medium"), root, { recursive: true });
  dbPath = join(root, "index.sqlite");
  await indexRepo(root, dbPath);
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

describe("freshness eval suite (DoD item 3)", () => {
  it("never reports a symbol body as verified after the file it lives in changes", async () => {
    const boundary = new RepoBoundary(root);
    const before = await ensureFresh(root, dbPath);
    const target = before.db
      .prepare(
        "SELECT s.start_byte AS startByte, s.end_byte AS endByte, s.body_hash AS bodyHash, f.path AS path " +
          "FROM symbol s JOIN file f ON f.id = s.file_id " +
          "WHERE s.stable_key = 'ts:src/scheduler/retryPolicy.ts#nextDelay'",
      )
      .get() as { startByte: number; endByte: number; bodyHash: string | null; path: string };
    before.db.close();

    writeFileSync(
      join(root, "src/scheduler/retryPolicy.ts"),
      "export const MAX_ATTEMPTS = 5;\nexport function nextDelay(attempt: number): number {\n  return 999;\n}\n",
    );

    // Guarantee A: even before any re-index, verifying against the OLD byte
    // range/hash must never claim the new bytes are the indexed body.
    const verify = verifySymbolBody(boundary, {
      path: target.path,
      startByte: target.startByte,
      endByte: target.endByte,
      bodyHash: target.bodyHash,
    });
    expect(verify.verified).toBe(false);

    // Guarantee B: the next read must surface the drift, either by
    // refreshing inline (state "refreshed") or by disclosing it as "partial"
    // — never silently "fresh" while the source has actually changed.
    const after = await ensureFresh(root, dbPath);
    try {
      expect(after.freshness.state).not.toBe("fresh");
    } finally {
      after.db.close();
    }
  });

  it("reports fresh with zero drift when nothing has changed", async () => {
    const state = await ensureFresh(root, dbPath);
    try {
      expect(state.freshness).toEqual({ state: "fresh", driftCount: 0, verified: [] });
    } finally {
      state.db.close();
    }
  });

  it("never leaves an added file undetected across repeated mutations", async () => {
    for (let index = 0; index < 5; index += 1) {
      writeFileSync(
        join(root, "src", `generated-${index}.ts`),
        `export const value${index} = ${index};\n`,
      );
      const state = await ensureFresh(root, dbPath);
      try {
        expect(state.freshness.state).not.toBe("fresh");
      } finally {
        state.db.close();
      }
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails or passes**

Run: `nvm use && npx vitest run tests/harness/driftEval.test.ts`
Expected: this exercises already-shipped, already-reviewed Plan 2 code (Tasks 8-9) — it should PASS immediately, turning this task into a confirming regression suite rather than a bugfix. If any assertion fails, that is a real Plan 2 regression to fix before continuing, not a reason to weaken the assertion.

- [ ] **Step 3: Run the full suite, typecheck, and build**

Run: `npm test && npm run typecheck && npm run build`
Expected: all PASS.

- [ ] **Step 4: Commit**

```bash
git add tests/harness/driftEval.test.ts
git commit -m "test: add the freshness eval suite closing DoD item 3"
```

---

### Task 10: Live agentic-search baseline runner

**Files:**
- Create: `bench/harness/runLiveBaseline.ts`
- Modify: `package.json` (add `@anthropic-ai/sdk` devDependency)
- Test: `tests/harness/runLiveBaseline.test.ts` (tool handlers only — no network call is made by this plan's test suite)

**Interfaces:**
- Consumes: `BenchmarkTask` (Task 3), `RepoBoundary` (`src/repo/boundary.js`).
- Produces: `runAgenticBaseline(client: Anthropic, task: BenchmarkTask, fixtureRoot: string): Promise<AgentTrace>` — the function Task 12's manual procedure calls once per task/repetition. Also exports the three tool handlers (`grepTool`, `globTool`, `readFileTool`) separately so they're testable without touching the network.

**Why this is buildable without running it:** the Tool Runner call itself (`client.beta.messages.toolRunner(...)`) is a thin wrapper around a real network request — mocking it meaningfully would just test the mock. What *is* worth testing, and what actually has bugs to catch, is the tool implementations: do they stay inside `RepoBoundary`, do they return sane results, do they refuse to read outside the fixture. Those are pure/async functions with no SDK involvement, tested directly below.

- [ ] **Step 1: Write the failing test**

```ts
// tests/harness/runLiveBaseline.test.ts
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { globTool, grepTool, readFileTool } from "../../bench/harness/runLiveBaseline.js";
import { RepoBoundary } from "../../src/repo/boundary.js";

let root: string;
let boundary: RepoBoundary;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "cg-live-baseline-"));
  mkdirSync(join(root, "src"));
  writeFileSync(join(root, "src", "a.ts"), "export function nextDelay() {}\n");
  writeFileSync(join(root, "src", "b.ts"), "export function other() {}\n");
  boundary = new RepoBoundary(root);
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

describe("live baseline tool handlers", () => {
  it("grep finds a pattern and reports the matching file", async () => {
    const result = await grepTool(boundary, { pattern: "nextDelay" });
    expect(result).toContain("src/a.ts");
  });

  it("grep reports no matches without throwing", async () => {
    const result = await grepTool(boundary, { pattern: "doesNotExist" });
    expect(result).toContain("no matches");
  });

  it("glob lists files matching an extension pattern", async () => {
    const result = await globTool(boundary, { pattern: "**/*.ts" });
    expect(result).toContain("src/a.ts");
    expect(result).toContain("src/b.ts");
  });

  it("read_file returns file contents", async () => {
    const result = await readFileTool(boundary, { path: "src/a.ts" });
    expect(result).toContain("nextDelay");
  });

  it("read_file reports an error instead of throwing for a missing file", async () => {
    const result = await readFileTool(boundary, { path: "src/missing.ts" });
    expect(result).toMatch(/error|not found/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `nvm use && npx vitest run tests/harness/runLiveBaseline.test.ts`
Expected: FAIL — cannot resolve `bench/harness/runLiveBaseline.js`.

- [ ] **Step 3: Add the dependency and implement**

```bash
npm install --save-dev @anthropic-ai/sdk
```

```ts
// bench/harness/runLiveBaseline.ts
import Anthropic from "@anthropic-ai/sdk";
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { RepoBoundary } from "../../src/repo/boundary.js";
import type { AgentTrace, BenchmarkTask, ToolCallRecord } from "./types.js";

const MODEL = "claude-opus-5";

export async function grepTool(
  boundary: RepoBoundary,
  input: { pattern: string },
): Promise<string> {
  const matches: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of boundary.readDirectory(dir)) {
      const path = dir === "." ? entry.name : `${dir}/${entry.name}`;
      if (entry.isDirectory()) {
        walk(path);
        continue;
      }
      if (!path.endsWith(".ts")) continue;
      const text = boundary.readFile(path).toString("utf8");
      if (text.includes(input.pattern)) matches.push(path);
    }
  };
  walk(".");
  return matches.length > 0 ? matches.join("\n") : "no matches";
}

export async function globTool(
  boundary: RepoBoundary,
  input: { pattern: string },
): Promise<string> {
  // A minimal, benchmark-scoped glob: this harness only ever needs "every
  // .ts file", so a full glob-syntax implementation is out of scope — the
  // `pattern` argument is accepted for tool-schema fidelity but only the
  // "**/*.ts"-shaped case is implemented.
  const matches: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of boundary.readDirectory(dir)) {
      const path = dir === "." ? entry.name : `${dir}/${entry.name}`;
      if (entry.isDirectory()) {
        walk(path);
        continue;
      }
      if (path.endsWith(".ts")) matches.push(path);
    }
  };
  walk(".");
  return matches.join("\n");
}

export async function readFileTool(
  boundary: RepoBoundary,
  input: { path: string },
): Promise<string> {
  try {
    return boundary.readFile(input.path).toString("utf8");
  } catch (error) {
    return `error: could not read ${input.path}: ${(error as Error).message}`;
  }
}

function buildTools(boundary: RepoBoundary) {
  return [
    betaZodTool({
      name: "grep",
      description: "Search all .ts files in the repository for a literal substring.",
      inputSchema: z.object({ pattern: z.string() }),
      run: (input) => grepTool(boundary, input),
    }),
    betaZodTool({
      name: "glob",
      description: "List every .ts file in the repository.",
      inputSchema: z.object({ pattern: z.string() }),
      run: (input) => globTool(boundary, input),
    }),
    betaZodTool({
      name: "read_file",
      description: "Read the full contents of one file by repository-relative path.",
      inputSchema: z.object({ path: z.string() }),
      run: (input) => readFileTool(boundary, input),
    }),
  ];
}

/**
 * Runs one benchmark task through a real Claude Opus 5 agentic loop with
 * grep/glob/read_file tools, and returns the trace traceScorer.ts (Task 7)
 * consumes. Not called anywhere in this plan's own tests or build — see
 * Task 12 for the manual, opt-in procedure that invokes this against real
 * usage.
 */
export async function runAgenticBaseline(
  client: Anthropic,
  task: BenchmarkTask,
  fixtureRoot: string,
): Promise<AgentTrace> {
  const boundary = new RepoBoundary(fixtureRoot);
  const start = Date.now();
  const toolCalls: ToolCallRecord[] = [];
  let inputTokens = 0;
  let outputTokens = 0;
  let finalAnswerText = "";

  const runner = client.beta.messages.toolRunner({
    model: MODEL,
    max_tokens: 16000,
    tools: buildTools(boundary),
    messages: [{ role: "user", content: task.prompt }],
  });

  for await (const message of runner) {
    inputTokens += message.usage.input_tokens;
    outputTokens += message.usage.output_tokens;
    for (const block of message.content) {
      if (block.type === "tool_use") {
        toolCalls.push({ tool: block.name, input: block.input, resultSummary: "" });
      }
      if (block.type === "text") {
        finalAnswerText = block.text;
      }
    }
  }

  return {
    taskId: task.id,
    toolCalls,
    finalAnswerText,
    inputTokens,
    outputTokens,
    wallClockMs: Date.now() - start,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `nvm use && npx vitest run tests/harness/runLiveBaseline.test.ts`
Expected: PASS. No network call is made — `grepTool`/`globTool`/`readFileTool` are plain async functions exercised directly.

- [ ] **Step 5: Run the full suite, typecheck, and build**

Run: `npm test && npm run typecheck && npm run build`
Expected: all PASS. Confirm `@anthropic-ai/sdk` is under `devDependencies`, not `dependencies` — `npm ls @anthropic-ai/sdk --prod` should report nothing.

- [ ] **Step 6: Commit**

```bash
git add bench/harness/runLiveBaseline.ts tests/harness/runLiveBaseline.test.ts package.json package-lock.json
git commit -m "feat: add the live agentic-search baseline runner"
```

---

### Task 11: MCP client verification (DoD item 2)

**Files:**
- Create: `docs/mcp-client-verification.md`

**Interfaces:** none — this is a manual checklist document, not code. Included as its own task because a reviewer can meaningfully accept or reject its accuracy independent of every other task in this plan.

- [ ] **Step 1: Write the checklist**

```markdown
# MCP client verification (DoD item 2)

Spec §12 requires the three MCP tools verified in Claude Code **plus one
other client**. This is a manual procedure — run it, fill in the results
inline, and commit the filled-in copy.

## 1. Build and register the server

    nvm use && npm run build
    node dist/cli/main.js mcp serve --help   # confirms the command exists

## 2. Claude Code

Add to `.mcp.json` in a scratch repository (not this one — a real target to
query against):

    {
      "mcpServers": {
        "codegraph": {
          "command": "node",
          "args": ["/absolute/path/to/CodeGraph/dist/cli/main.js", "mcp", "serve"]
        }
      }
    }

In a Claude Code session against that repository, run each tool at least
once and record the result:

- [ ] `find_symbols` with a real query — result: _____
- [ ] `query_graph` with `callers_of` on a real symbol — result: _____
- [ ] `get_impact_radius` with `from_git_diff: true` after editing a file — result: _____

## 3. A second client — MCP Inspector

MCP Inspector (`@modelcontextprotocol/inspector`) is the standard reference
client for testing any MCP server directly — free, no model calls, no
second AI vendor account needed:

    npx @modelcontextprotocol/inspector node dist/cli/main.js mcp serve

In the Inspector UI, connect and run each tool with a manually-entered
input, confirming the response matches the `Envelope<T>` shape (spec §7.6:
`schemaVersion`, `repository`, `freshness`, `summary`, `results`,
`warnings`, `diagnostics`):

- [ ] `find_symbols` — response has all six top-level envelope fields: _____
- [ ] `query_graph` — response has `compiler`/`lexical`/`heuristic` buckets
      at the top level (spec §7.2), not nested under `results`: _____
- [ ] `get_impact_radius` — `diagnostics.truncated`/`omittedCount` present: _____

## Result

Filled in: _____ (date, by whom)
```

- [ ] **Step 2: Commit**

```bash
git add docs/mcp-client-verification.md
git commit -m "docs: add the MCP client verification checklist"
```

---

### Task 12: Opt-in live benchmark run and tuning procedure (not executed by this plan)

**Files:**
- Create: `docs/running-the-benchmark.md`

**Interfaces:** none — a procedure document. This is the task that actually spends real API usage; it is written here, and deliberately not run as part of implementing this plan (confirmed scope decision at the top of this document).

- [ ] **Step 1: Write the procedure**

```markdown
# Running the live benchmark (opt-in, costs real API usage)

Everything up to here (Tasks 1-11) builds and unit-tests the harness with
zero LLM calls. This procedure actually runs it. Do this only when you
have budget for ~12 tasks x repetitions x one Claude Opus 5 agentic loop
each.

## 1. Repetitions

Use 3 repetitions per task (36 live runs total) — enough to see whether a
task's recall is stable or noisy, cheap enough to actually run. Record the
per-repetition results, not just the mean; PRD §25 leaves the "right"
repetition count open, and 3 is a starting point to revisit once real
variance is visible, not a derived constant.

## 2. Optional: the large fixture

For an additional latency/scale data point beyond the medium fixture (not
required for the 12 scored tasks, which all target the medium fixture):

    git clone --depth 1 --branch v3.24.1 https://github.com/colinhacks/zod /tmp/codegraph-bench-large

Pin the tag above (or a newer one, updating this line) so results are
reproducible run to run.

## 3. Produce traces

For each task in `bench/harness/tasks.ts`, for each of 3 repetitions, run:

    import Anthropic from "@anthropic-ai/sdk";
    import { runAgenticBaseline } from "./bench/harness/runLiveBaseline.js";
    import { BENCHMARK_TASKS } from "./bench/harness/tasks.js";

    const client = new Anthropic(); // picks up ANTHROPIC_API_KEY or an `ant auth login` profile
    const task = BENCHMARK_TASKS.find((t) => t.id === "<task id>")!;
    const trace = await runAgenticBaseline(client, task, "tests/fixtures/repos/medium");

Average the 3 repetitions' `AgentTrace` fields (or just keep repetition 1
if variance turns out to be low — decide after looking at real numbers) and
write the result to `bench/harness/traces/<task id>.json`.

## 4. Regenerate the report

    npm run bench:harness

`BENCHMARK.md`'s `Agentic search` row now has real numbers instead of
`PENDING`.

## 5. Ranking-weight and AUTO_REFRESH_LIMIT tuning (spec §16.2-3)

Only after step 4 produces real numbers:

- **Ranking weights** (`src/query/rank.ts`'s `score()` constants, spec
  §7.4): if `wide_interface` or `completeness` tasks show CodeGraph finding
  the required evidence but ranking it low within a tier (visible from
  `--explain` on the CLI, or from `tierUtility` being unexpectedly low on a
  task where most matches are HEURISTIC), that is signal to revisit the
  0.40/0.25/0.20/0.15 weights — a human judgment call informed by the
  numbers, not an automated optimizer.
- **`AUTO_REFRESH_LIMIT`** (`src/index/drift.ts`, currently 25, spec §16.2):
  if the live run's per-task `wallClockMs` for CodeGraph is dominated by
  inline refresh time on a fixture with realistic drift counts, that is
  signal the limit is set too high (auto-refresh takes too long inline) or
  too low (falls back to `partial` too eagerly) — again, read the numbers
  and adjust by hand; this document does not prescribe a new value because
  none exists to prescribe until real latency numbers do.

Record whichever adjustments are made via `whyline note`, citing the
specific `BENCHMARK.md` numbers that motivated them — the project's
existing convention for every other tuning decision in this codebase.
```

- [ ] **Step 2: Commit**

```bash
git add docs/running-the-benchmark.md
git commit -m "docs: add the opt-in live benchmark run and tuning procedure"
```

---

## Self-Review

**Spec coverage:** §10 Layer 3 (12 tasks, 5 categories, 2 baselines, disclosed selection criteria) — Tasks 2, 4, 8. §10's tier-utility instrumentation requirement — Tasks 1, 5, 6. DoD item 2 (two-client verification) — Task 11. DoD item 3 (zero stale bytes / zero unreported drift across the eval suite) — Task 9. DoD item 5 (published 12-task benchmark) — Task 8, completed live in Task 12. §16.2-3 (ranking/`AUTO_REFRESH_LIMIT` tuning) — documented procedure in Task 12, deliberately not executed. §2.1's two falsifiable semantic-disadvantage controls — the two `semantic_disadvantage` tasks in Task 4.

**Type consistency, checked across tasks:** `BenchmarkTask`/`GroundTruth`/`AgentTrace`/`TaskResult` (Task 3) match their use in Tasks 4-8 and 10. `ImpactRow.tier` (Task 1) matches `codegraphRunner.ts`'s read of `row.tier` (Task 5). `AggregatedMetrics` (Task 6) matches `report.ts`'s `summaryRow` (Task 8).

**Placeholder scan:** every code step above contains complete file contents or complete diffs — no `TBD`, no "add appropriate handling," no "similar to Task N" without the actual code repeated in place.
