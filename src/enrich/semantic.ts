/**
 * Semantic retrieval over stored embeddings.
 *
 * Optional by construction: with no embeddings stored this returns nothing and
 * every caller falls back to deterministic retrieval unchanged (spec §13).
 */
import type { Store } from "../store/index.js";
import { EMBEDDING_MODEL, type Embedder } from "./embedder.js";
import { cosineSimilarity, unpackVector } from "./vectors.js";

export interface SemanticHit {
  stableKey: string;
  score: number;
}

export async function semanticSearch(
  store: Store,
  embedder: Embedder,
  query: string,
  limit = 20,
): Promise<SemanticHit[]> {
  const stored = store.allEmbeddings(EMBEDDING_MODEL);
  if (stored.length === 0) return [];

  const [queryVector] = await embedder.embed([query]);
  if (!queryVector) return [];

  const hits: SemanticHit[] = [];
  for (const row of stored) {
    hits.push({
      stableKey: row.stableKey,
      score: cosineSimilarity(queryVector, unpackVector(row.vector)),
    });
  }

  return hits
    .sort((left, right) => right.score - left.score)
    .slice(0, limit);
}
