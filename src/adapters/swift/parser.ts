import { Parser, Language } from "web-tree-sitter";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const GRAMMAR = "tree-sitter-swift.wasm";

let initPromise: Promise<void> | null = null;
let cached: Parser | null = null;

/** Load the Swift grammar once before any synchronous extraction. */
export async function getSwiftParser(): Promise<Parser> {
  initPromise ??= (async () => {
    await Parser.init();
    const here = dirname(fileURLToPath(import.meta.url));
    const language = await Language.load(join(here, "../../../vendor/", GRAMMAR));
    const parser = new Parser();
    parser.setLanguage(language);
    cached = parser;
  })();
  await initPromise;
  return swiftParser();
}

/** The warmed Swift parser. Extraction remains synchronous and pure. */
export function swiftParser(): Parser {
  if (!cached) {
    throw new Error("call await getSwiftParser() once before extract()");
  }
  return cached;
}
