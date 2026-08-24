import type {
  ReferenceRecord,
  SymbolVisibility,
} from "../adapters/types.js";
import { SWIFT_SDK_SYMBOLS } from "../adapters/swift/sdkSymbols.js";
import type { Binding } from "../link/imports.js";
import type { Tier } from "../store/repos.js";

/**
 * Maximum candidates a member-access reference may resolve to before Sonde
 * declines to guess. Mirrors the TESTS fan-out cap in spec §6.4.
 */
export const AMBIGUITY_CAP = 8;

export interface Candidate {
  stableKey: string;
  qualifiedName?: string;
  visibility?: SymbolVisibility;
}

function swiftLocation(stableKey: string): {
  file: string;
  module: string | null;
} | null {
  if (!stableKey.startsWith("swift:")) return null;
  const separator = stableKey.indexOf("#", "swift:".length);
  if (separator < 0) return null;
  const file = stableKey.slice("swift:".length, separator);
  const parts = file.split("/");
  const module =
    (parts[0] === "Sources" || parts[0] === "Tests") && parts.length >= 3
      ? (parts[1] ?? null)
      : null;
  return { file, module };
}

function ownerName(candidate: Candidate): string | null {
  const qualifiedName = candidate.qualifiedName;
  if (!qualifiedName) return null;
  const separator = qualifiedName.lastIndexOf(".");
  return separator < 0 ? null : qualifiedName.slice(0, separator);
}

/**
 * Remove only candidates excluded by explicit Swift source evidence.
 * An absent scope hint is the TypeScript path and returns the original array.
 */
export function narrowCandidates<T extends Candidate>(
  ref: ReferenceRecord,
  candidates: T[],
  importedModules: ReadonlySet<string> = new Set(),
): T[] {
  const hint = ref.scopeHint;
  if (!hint) return candidates;

  let narrowed = candidates.filter((candidate) => {
    const location = swiftLocation(candidate.stableKey);
    if (!location) return true;
    if (
      (candidate.visibility === "private" ||
        candidate.visibility === "fileprivate") &&
      location.file !== hint.file
    ) {
      return false;
    }
    if (
      ref.receiver === null &&
      hint.module !== null &&
      location.module !== null &&
      location.module !== hint.module &&
      !importedModules.has(location.module)
    ) {
      return false;
    }
    return true;
  });

  if (ref.receiver !== null && hint.receiverType !== null) {
    const writtenType = hint.receiverType.split(".").at(-1) ?? hint.receiverType;
    narrowed = narrowed.filter((candidate) => {
      const owner = ownerName(candidate);
      return (
        owner === writtenType || owner?.endsWith(`.${writtenType}`) === true
      );
    });
  }

  return narrowed;
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
  narrowedByScope = false,
): { tier: Tier; confidence: number } {
  if (binding && "external" in binding) {
    return { tier: "EXTERNAL", confidence: 1 };
  }
  if (binding && "unresolved" in binding) {
    return { tier: "UNRESOLVED", confidence: 0 };
  }
  if (candidates.length === 0) {
    if (ref.scopeHint && SWIFT_SDK_SYMBOLS.has(ref.name)) {
      return { tier: "EXTERNAL", confidence: 1 };
    }
    return { tier: "UNRESOLVED", confidence: 0 };
  }

  // The cap is about evidence quality, not syntax: an edge asserted on the
  // strength of a name shared by hundreds of symbols is noise however the
  // reference was written. Applying it only to member access left the bare
  // identifier path uncapped, and type-position references — which carry no
  // receiver — grew to 304,545 heuristic edges on the Hono fixture.
  const tooAmbiguous = candidates.length > AMBIGUITY_CAP;

  if (ref.receiver !== null) {
    // Beyond the cap, emitting one edge per candidate asserts hundreds of
    // relationships on the strength of a shared method name. On the Hono
    // fixture `get` drew 1212 inbound heuristic edges — every `.get()` call in
    // the repository linked to every symbol named `get` — and 73% of that index
    // was this noise. Confidence 1/1212 is not evidence. Saying "we saw this and
    // could not place it" is the honest answer (invariant 1) and keeps the
    // unresolved count meaningful instead of burying it under fabrications.
    if (tooAmbiguous) return { tier: "UNRESOLVED", confidence: 0 };
    return { tier: "HEURISTIC", confidence: 1 / candidates.length };
  }

  if (binding && "file" in binding) {
    return { tier: "LEXICAL", confidence: 1 };
  }
  if (candidates.length === 1 && !narrowedByScope) {
    return { tier: "LEXICAL", confidence: 1 };
  }

  if (tooAmbiguous) return { tier: "UNRESOLVED", confidence: 0 };
  return { tier: "HEURISTIC", confidence: 1 / candidates.length };
}
