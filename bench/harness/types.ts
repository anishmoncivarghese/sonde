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
  /** Expected reverse-impact depth when this evidence verifies task depth. */
  expectedDepth?: number;
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
  /** Repository-relative fixture root. */
  fixture: string;
  /** Natural-language task given to the agentic-search baseline. */
  prompt: string;
  /** Deterministic CodeGraph queries for the same task. */
  seeds: TaskSeed[];
  groundTruth: GroundTruth;
  /** Published to disclose the adversarial task-selection rationale. */
  rationale: string;
}

export interface ToolCallRecord {
  tool: string;
  input: unknown;
  resultSummary: string;
}

/**
 * Output from one live agentic-search run. Task 10 produces this shape and
 * Task 7 scores it, keeping live execution separate from deterministic tests.
 */
export interface AgentTrace {
  taskId: string;
  toolCalls: ToolCallRecord[];
  finalAnswerText: string;
  inputTokens: number;
  outputTokens: number;
  /** Cumulative tool-result tokens exposed to the live agent. */
  contextTokens: number;
  wallClockMs: number;
}

export interface TierHitCounts {
  compiler: number;
  lexical: number;
  heuristic: number;
  unranked: number;
}

export interface TaskResult {
  taskId: string;
  category: TaskCategory;
  baseline: "agentic_search" | "codegraph";
  /** Fraction of requiredEvidence found, from 0 through 1. */
  recallAtK: number;
  toolCalls: number;
  inputTokens: number;
  outputTokens: number;
  /** Evidence context admitted by the task's token budget. */
  contextTokens: number;
  wallClockMs: number;
  helpfulHits: number;
  distractorHits: number;
  /**
   * True when the arm consumed more evidence context than the task's budget.
   * The CodeGraph arm packs to the budget and cannot exceed it; the agentic
   * baseline is unconstrained and can, so this is reported rather than used to
   * discard the trace.
   */
  budgetExceeded: boolean;
  /** Tokens consumed beyond the task budget; 0 when within budget. */
  contextOverageTokens: number;
  /**
   * Deterministic proxy pending a validated end-to-end success judge.
   * Requires full recall, no distractors, AND staying inside the budget — the
   * same constraint the CodeGraph arm pays for by truncating.
   */
  preliminarySuccess: boolean;
  /**
   * Marginal required-evidence recall contributed by HEURISTIC graph edges.
   * Find-only and agentic-search results have no graph tier and report null.
   */
  tierUtility: number | null;
  /** Required-evidence hits by their retrieval tier. */
  tierHits: TierHitCounts | null;
}
