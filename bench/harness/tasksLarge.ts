/**
 * Benchmark tasks for the large fixture (Hono v4.6.3, MIT — 346 files, 19,409
 * lines of real production TypeScript).
 *
 * The medium fixture is 198 lines, roughly 1,400 tokens, so the agentic
 * baseline simply read all of it. That cannot test the benchmark's premise —
 * that structural retrieval wins when a repository is too large to read
 * exhaustively. Here the corpus is two orders of magnitude beyond any task
 * budget, so exhaustive reading is impossible for both arms.
 *
 * Ground truth was verified by reading the fixture source, not generated from
 * CodeGraph's own output — an oracle derived from the tool under test would
 * agree with its own bugs.
 */
import type { BenchmarkTask, EvidenceSymbol } from "./types.js";

export const LARGE_FIXTURE = "tests/fixtures/repos/large";

function symbol(path: string, qualifiedName: string): EvidenceSymbol {
  return { stableKey: `ts:${path}#${qualifiedName}`, qualifiedName, path };
}

function fileSymbol(path: string): EvidenceSymbol {
  return { stableKey: `ts:${path}#`, qualifiedName: path, path };
}

export const LARGE_BENCHMARK_TASKS: BenchmarkTask[] = [
  {
    id: "hono-implementations-of-router",
    category: "wide_interface",
    fixture: LARGE_FIXTURE,
    prompt:
      "Which classes implement the Router interface declared in src/router.ts?",
    seeds: [{
      kind: "traverse",
      pattern: "implementations_of",
      symbol: "ts:src/router.ts#Router",
    }],
    groundTruth: {
      requiredEvidence: [
        symbol("src/router/reg-exp-router/router.ts", "RegExpRouter"),
        symbol("src/router/trie-router/router.ts", "TrieRouter"),
        symbol("src/router/pattern-router/router.ts", "PatternRouter"),
        symbol("src/router/linear-router/router.ts", "LinearRouter"),
        symbol("src/router/smart-router/router.ts", "SmartRouter"),
      ],
      helpfulEvidence: [],
      distractors: [fileSymbol("src/hono-base.ts")],
      maxContextBudgetTokens: 3000,
    },
    rationale:
      "Five implementations spread across five directories in a 346-file " +
      "repository. Verified by grep for 'implements Router<T>'.",
  },
  {
    id: "hono-impact-router-add",
    category: "transitive_impact",
    fixture: LARGE_FIXTURE,
    prompt:
      "If I change the signature of Router.add in src/router.ts, what breaks?",
    seeds: [{ kind: "impact", symbols: ["ts:src/router.ts#Router.add"] }],
    groundTruth: {
      requiredEvidence: [
        symbol("src/router/reg-exp-router/router.ts", "RegExpRouter"),
        symbol("src/router/trie-router/router.ts", "TrieRouter"),
        symbol("src/router/pattern-router/router.ts", "PatternRouter"),
        symbol("src/router/linear-router/router.ts", "LinearRouter"),
        symbol("src/router/smart-router/router.ts", "SmartRouter"),
      ],
      helpfulEvidence: [fileSymbol("src/hono-base.ts")],
      distractors: [fileSymbol("src/http-exception.ts")],
      maxContextBudgetTokens: 4000,
    },
    rationale:
      "Interface-method change fanning out to every implementer. Each " +
      "implementation declares add(), so all five must be updated in lockstep.",
  },
  {
    id: "hono-imported-by-compose",
    category: "completeness",
    fixture: LARGE_FIXTURE,
    prompt:
      "Which non-test modules import compose from src/compose.ts?",
    seeds: [{
      kind: "traverse",
      pattern: "imported_by",
      symbol: "ts:src/compose.ts#",
    }],
    groundTruth: {
      requiredEvidence: [
        fileSymbol("src/hono-base.ts"),
        fileSymbol("src/middleware/combine/index.ts"),
      ],
      helpfulEvidence: [],
      distractors: [fileSymbol("src/router.ts")],
      maxContextBudgetTokens: 2500,
    },
    rationale:
      "Exactly two non-test importers among 346 files. Verified by grep for " +
      "\"import { compose }\". A completeness claim is only checkable when the " +
      "true answer is small and the corpus is not. Seeded with the file symbol " +
      "because IMPORTS edges are file-to-file.",
  },
  {
    id: "hono-references-to-httpexception",
    category: "completeness",
    fixture: LARGE_FIXTURE,
    prompt:
      "Which middleware modules use HTTPException from src/http-exception.ts?",
    seeds: [{
      kind: "traverse",
      pattern: "imported_by",
      symbol: "ts:src/http-exception.ts#",
    }],
    groundTruth: {
      requiredEvidence: [
        fileSymbol("src/middleware/basic-auth/index.ts"),
        fileSymbol("src/middleware/bearer-auth/index.ts"),
        fileSymbol("src/middleware/jwt/jwt.ts"),
      ],
      helpfulEvidence: [],
      distractors: [fileSymbol("src/middleware/combine/index.ts")],
      maxContextBudgetTokens: 2500,
    },
    rationale:
      "Three importers scattered across the middleware tree. Verified by grep " +
      "for \"import { HTTPException }\" excluding tests.",
  },
  {
    id: "hono-tests-for-compose",
    category: "test_selection",
    fixture: LARGE_FIXTURE,
    prompt: "I'm about to change compose in src/compose.ts — which tests cover it?",
    seeds: [{ kind: "find", query: "compose" }],
    groundTruth: {
      requiredEvidence: [fileSymbol("src/compose.test.ts")],
      helpfulEvidence: [],
      distractors: [fileSymbol("src/context.test.ts")],
      maxContextBudgetTokens: 2000,
    },
    rationale:
      "One correct test file among dozens in the repository, so naming any " +
      "plausible test is penalised by the distractor rather than rewarded.",
  },
  {
    id: "hono-semantic-router-selection",
    category: "semantic_disadvantage",
    fixture: LARGE_FIXTURE,
    prompt:
      "Where does this library decide which routing strategy to use at runtime?",
    seeds: [{ kind: "find", query: "routing strategy selection" }],
    groundTruth: {
      requiredEvidence: [
        symbol("src/router/smart-router/router.ts", "SmartRouter"),
      ],
      helpfulEvidence: [],
      distractors: [fileSymbol("src/router/trie-router/router.ts")],
      maxContextBudgetTokens: 2000,
    },
    rationale:
      "Behavioural description with no identifier overlap: the answer is " +
      "SmartRouter, and the words 'routing strategy' appear nowhere in it. " +
      "Expected to lose without semantic retrieval, per spec §2.1.",
  },
];
