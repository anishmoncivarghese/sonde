import { createInterface } from "node:readline/promises";

/**
 * A single yes/no question. Never defaults to "yes" -- an empty answer,
 * anything ambiguous, or EOF (a non-interactive shell with no --yes given)
 * all resolve false, because the only thing this gates is writing into a
 * config file Sonde does not own.
 */
export async function confirm(
  question: string,
  input: NodeJS.ReadableStream,
  output: NodeJS.WritableStream,
): Promise<boolean> {
  const rl = createInterface({ input, output });
  output.write(`${question} [y/N] `);
  try {
    for await (const answer of rl) {
      return /^y(es)?$/i.test(answer.trim());
    }
    return false;
  } finally {
    rl.close();
  }
}
