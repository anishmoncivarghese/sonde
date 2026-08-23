/**
 * Optional local embedding model.
 *
 * `@huggingface/transformers` is ~380MB installed, so it is deliberately NOT a
 * dependency of this package: the install promise is `npx codegraph` with no
 * setup, and paying 380MB for an optional enrichment would break it. The import
 * is dynamic and failure is actionable, so the deterministic core is unaffected
 * whether or not the model is present (spec §13, invariant 8).
 *
 * The model runs locally. No source leaves the machine (SEC-004), and no
 * account or API key is involved (SEC-005).
 */
import { createHash } from "node:crypto";

export const EMBEDDING_MODEL = "Xenova/all-MiniLM-L6-v2";
export const EMBEDDING_DIM = 384;

export class EmbedderUnavailableError extends Error {
  constructor(cause: string) {
    super(
      "semantic search needs the optional embedding model, which is not installed.\n" +
        `  npm install @huggingface/transformers\n` +
        `Deterministic search works without it; this affects 'codegraph embed' only.\n` +
        `  (${cause})`,
    );
    this.name = "EmbedderUnavailableError";
  }
}

export interface Embedder {
  embed(texts: string[]): Promise<Float32Array[]>;
}

export function hashInput(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

export async function loadEmbedder(): Promise<Embedder> {
  let pipelineFactory: unknown;
  try {
    // Indirected through a variable so TypeScript does not require the module
    // to be installed at build time — it is optional by design.
    const moduleName = "@huggingface/transformers";
    ({ pipeline: pipelineFactory } = (await import(moduleName)) as {
      pipeline: unknown;
    });
  } catch (error) {
    throw new EmbedderUnavailableError((error as Error).message);
  }

  const factory = pipelineFactory as (
    task: string,
    model: string,
    options: { dtype: string },
  ) => Promise<
    (
      texts: string[],
      options: { pooling: string; normalize: boolean },
    ) => Promise<{ tolist(): number[][] }>
  >;

  const extract = await factory("feature-extraction", EMBEDDING_MODEL, {
    dtype: "q8",
  });

  return {
    async embed(texts: string[]): Promise<Float32Array[]> {
      if (texts.length === 0) return [];
      const output = await extract(texts, { pooling: "mean", normalize: true });
      return output.tolist().map((row) => Float32Array.from(row));
    },
  };
}
