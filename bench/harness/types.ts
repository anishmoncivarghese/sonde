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
  /** Repository-relative fixture root. */
  fixture: string;
  /** Natural-language task given to the agentic-search baseline. */
  prompt: string;
  /** Deterministic CodeGraph query for the same task. */
  seed: TaskSeed;
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
  wallClockMs: number;
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
  wallClockMs: number;
  /**
   * Fraction of matched required evidence reached through LEXICAL/HEURISTIC
   * edges rather than a trivial/COMPILER result. Agentic search has no tier
   * concept and therefore reports null.
   */
  tierUtility: number | null;
}
