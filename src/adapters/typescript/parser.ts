import { Parser, Language } from "web-tree-sitter";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

let parserPromise: Promise<Parser> | null = null;
let cached: Parser | null = null;

export async function getTsParser(): Promise<Parser> {
  parserPromise ??= (async () => {
    await Parser.init();
    const here = dirname(fileURLToPath(import.meta.url));
    const lang = await Language.load(
      join(here, "../../../vendor/tree-sitter-typescript.wasm"),
    );
    const p = new Parser();
    p.setLanguage(lang);
    cached = p;
    return p;
  })();
  return parserPromise;
}

export function getTsParserSync(): Parser {
  if (!cached) {
    throw new Error("call await getTsParser() once before extract()");
  }
  return cached;
}
