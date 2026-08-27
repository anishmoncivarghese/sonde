import { Parser, Language } from "web-tree-sitter";
import { ensureTreeSitterRuntime } from "../treeSitterRuntime.js";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const GRAMMAR = "tree-sitter-python.wasm";

let initPromise: Promise<void> | null = null;
let cached: Parser | null = null;

/** Load the Python grammar once before any synchronous extraction. */
export async function getPythonParser(): Promise<Parser> {
  initPromise ??= (async () => {
    await ensureTreeSitterRuntime();
    const here = dirname(fileURLToPath(import.meta.url));
    const language = await Language.load(
      join(here, "../../../vendor/", GRAMMAR),
    );
    const parser = new Parser();
    parser.setLanguage(language);
    cached = parser;
  })();
  await initPromise;
  return pythonParser();
}

/** The warmed Python parser. Extraction remains synchronous and pure. */
export function pythonParser(): Parser {
  if (!cached) {
    throw new Error("call await getPythonParser() once before extract()");
  }
  return cached;
}
