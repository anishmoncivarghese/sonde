import { Parser, Language } from "web-tree-sitter";
import { join } from "node:path";

let parserPromise: Promise<Parser> | null = null;

export async function getTsParser(): Promise<Parser> {
  parserPromise ??= (async () => {
    await Parser.init();
    const lang = await Language.load(join(process.cwd(), "vendor", "tree-sitter-typescript.wasm"));
    const p = new Parser();
    p.setLanguage(lang);
    return p;
  })();
  return parserPromise;
}
