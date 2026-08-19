export interface Envelope<T> {
  schemaVersion: number;
  repository: {
    rootHash: string;
    revision: string | null;
    dirty: boolean | null;
  };
  freshness: {
    state: string;
    driftCount: number;
    verified: string[];
  };
  summary: string;
  results: T[];
  warnings: string[];
  diagnostics: {
    truncated: boolean;
    omittedCount: number;
    estimatedTokens: number;
    tscVersion: string | null;
  };
}

export interface EnvelopeInput<T> {
  rootHash: string;
  gitState: { revision: string | null; dirty: boolean | null };
  freshness: Envelope<T>["freshness"];
  summary: string;
  results: T[];
  warnings: string[];
  truncated: boolean;
  omittedCount: number;
  estimatedTokens: number;
}

// Response schema version, deliberately independent from the SQLite schema.
const RESPONSE_SCHEMA_VERSION = 1;
const NO_COMPILER_WARNING =
  "COMPILER-tier resolution is unavailable; results use LEXICAL/HEURISTIC " +
  "evidence only";
const UNKNOWN_GIT_WARNING =
  "git state is unavailable; repository revision or dirtiness is unknown";

export function buildEnvelope<T>(input: EnvelopeInput<T>): Envelope<T> {
  const warnings = new Set(input.warnings);
  // No compiler upgrade pass exists in this plan. Spec §9 requires every
  // envelope to disclose the downgrade rather than silently omit the tier.
  warnings.add(NO_COMPILER_WARNING);
  if (input.gitState.revision === null || input.gitState.dirty === null) {
    // Invariant 8: unknown must not be serialized as a clean worktree.
    warnings.add(UNKNOWN_GIT_WARNING);
  }

  return {
    schemaVersion: RESPONSE_SCHEMA_VERSION,
    repository: {
      rootHash: input.rootHash,
      revision: input.gitState.revision,
      dirty: input.gitState.dirty,
    },
    freshness: input.freshness,
    summary: input.summary,
    results: input.results,
    warnings: [...warnings],
    diagnostics: {
      truncated: input.truncated,
      omittedCount: input.omittedCount,
      estimatedTokens: input.estimatedTokens,
      tscVersion: null,
    },
  };
}
