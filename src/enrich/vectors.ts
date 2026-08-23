/**
 * Vector primitives for optional semantic retrieval.
 *
 * Deliberately free of any model dependency so the deterministic core stays
 * installable and testable without one (spec §13: enrichment is optional and
 * removable, and retrieval must remain fully functional without it).
 */

/** Little-endian float32 blob, four bytes per dimension. */
export function packVector(vector: readonly number[] | Float32Array): Buffer {
  const floats = Float32Array.from(vector);
  return Buffer.from(floats.buffer, floats.byteOffset, floats.byteLength);
}

export function unpackVector(blob: Buffer): Float32Array {
  const copy = Buffer.from(blob);
  return new Float32Array(copy.buffer, copy.byteOffset, copy.byteLength / 4);
}

export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) {
    throw new Error(`vector dimension mismatch: ${a.length} != ${b.length}`);
  }
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let index = 0; index < a.length; index += 1) {
    const left = a[index] ?? 0;
    const right = b[index] ?? 0;
    dot += left * right;
    normA += left * left;
    normB += right * right;
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Split an identifier into words. `SmartRouter` -> "smart router".
 *
 * Without this, a behavioural query shares no vocabulary with the code that
 * answers it: the benchmark asks which routing strategy is chosen at runtime,
 * and the answer is `SmartRouter`.
 */
function splitIdentifier(identifier: string): string {
  return identifier
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .replace(/[._\-/]+/g, " ")
    .toLowerCase()
    .trim();
}

export interface SymbolDocumentInput {
  qualifiedName: string;
  kind: string;
  signature: string | null;
  documentation: string | null;
  path: string;
}

/**
 * The text embedded for a symbol. Identifier and path words are included
 * because in real code the domain term usually lives in a name or a directory
 * rather than in prose — `src/middleware/basic-auth/` says "basic auth" where
 * the method is only called `handle`.
 */
export function buildSymbolDocument(input: SymbolDocumentInput): string {
  const pathWords = splitIdentifier(input.path.replace(/\.[^.]+$/, ""));
  const parts = [
    input.qualifiedName,
    splitIdentifier(input.qualifiedName),
    input.kind,
    pathWords,
    input.signature ?? "",
    input.documentation ?? "",
  ];
  return parts.filter((part) => part.length > 0).join("\n");
}

/**
 * Reciprocal rank fusion (spec §14.4).
 *
 * Order-based by construction, so a confident embedding score cannot outrank an
 * exact lexical match — enrichment never overrides source evidence.
 */
export function fuseRankings(rankings: string[][], k = 60): string[] {
  const scores = new Map<string, number>();
  for (const ranking of rankings) {
    ranking.forEach((id, index) => {
      scores.set(id, (scores.get(id) ?? 0) + 1 / (k + index + 1));
    });
  }
  return [...scores.entries()]
    .sort((left, right) => right[1] - left[1])
    .map(([id]) => id);
}
