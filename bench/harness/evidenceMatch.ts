/**
 * The single evidence-matching rule, shared by both benchmark arms.
 *
 * It lives in its own module because the arms previously used different rules:
 * the Sonde arm required exact stable-key set membership, while the agentic
 * arm substring-matched prose against the qualified name, path, or stable key.
 * That made the two columns incomparable and structurally favoured the verbose
 * arm — Sonde returning `ts:src/index.ts#notifiers` scored 0.00 against a
 * required `ts:src/index.ts#`, while an agent merely writing "src/index.ts"
 * scored 1.00. Whatever the rule is, both arms must be held to it.
 *
 * Matching is deliberately a deterministic proxy, not a semantic judge
 * (spec §12): it answers "did this output identify the required code?", and a
 * validated success judge remains deferred.
 */
import type { EvidenceSymbol } from "./types.js";

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Match `value` only at identifier boundaries, so `Dispatcher` never matches inside `DispatcherFactory`. */
export function boundedMatch(text: string, value: string): boolean {
  const token = "[\\p{L}\\p{N}_$]";
  return new RegExp(
    `(?<!${token})${escapeRegExp(value)}(?!${token})`,
    "iu",
  ).test(text);
}

/**
 * True when `text` identifies the required evidence by qualified name, path, or
 * stable key. Matching on path is what lets a finer-grained answer count: a
 * result naming the exact symbol inside a required file has identified that
 * file, and is a better answer than the file alone.
 */
export function evidenceAppears(text: string, evidence: EvidenceSymbol): boolean {
  return [evidence.qualifiedName, evidence.path, evidence.stableKey]
    .some((candidate) => boundedMatch(text, candidate));
}
