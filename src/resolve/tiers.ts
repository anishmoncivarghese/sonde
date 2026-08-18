import type { ReferenceRecord } from "../adapters/types.js";
import type { Binding } from "../link/imports.js";
import type { Tier } from "../store/repos.js";

export interface Candidate {
  stableKey: string;
}

/**
 * Tier is determined by how the target was found, not by how confident it feels.
 *
 * Member access requires type inference. Tree-sitter has no types, so even a
 * single visible candidate is suggestive rather than resolved (spec §4.3).
 */
export function assignTier(
  ref: ReferenceRecord,
  candidates: Candidate[],
  binding: Binding | null,
): { tier: Tier; confidence: number } {
  if (binding && "external" in binding) {
    return { tier: "EXTERNAL", confidence: 1 };
  }
  if (binding && "unresolved" in binding) {
    return { tier: "UNRESOLVED", confidence: 0 };
  }
  if (candidates.length === 0) {
    return { tier: "UNRESOLVED", confidence: 0 };
  }

  if (ref.receiver !== null) {
    return { tier: "HEURISTIC", confidence: 1 / candidates.length };
  }

  if (binding && "file" in binding) {
    return { tier: "LEXICAL", confidence: 1 };
  }
  if (candidates.length === 1) {
    return { tier: "LEXICAL", confidence: 1 };
  }

  return { tier: "HEURISTIC", confidence: 1 / candidates.length };
}
