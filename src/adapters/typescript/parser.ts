import { Parser, Language } from "web-tree-sitter";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Two grammars, routed by extension.
 *
 * The TypeScript and TSX grammars are mutually exclusive: TSX reads `<T>` as a
 * JSX element, while TypeScript cannot parse JSX at all. Loading only the
 * TypeScript grammar meant every .tsx file failed to parse — 38 of 346 files on
 * the Hono fixture — while `matches()` still claimed to support them.
 */
const GRAMMARS = {
  typescript: "tree-sitter-typescript.wasm",
  tsx: "tree-sitter-tsx.wasm",
} as const;

type GrammarName = keyof typeof GRAMMARS;

let initPromise: Promise<void> | null = null;
const cached = new Map<GrammarName, Parser>();

function grammarFor(path: string): GrammarName {
  return path.endsWith(".tsx") ? "tsx" : "typescript";
}

async function loadGrammar(name: GrammarName): Promise<Parser> {
  const here = dirname(fileURLToPath(import.meta.url));
  const language = await Language.load(
    join(here, "../../../vendor/", GRAMMARS[name]),
  );
  const parser = new Parser();
  parser.setLanguage(language);
  return parser;
}

/** Load every grammar once. Must be awaited before any synchronous extract(). */
export async function getTsParser(): Promise<Parser> {
  initPromise ??= (async () => {
    await Parser.init();
    for (const name of Object.keys(GRAMMARS) as GrammarName[]) {
      cached.set(name, await loadGrammar(name));
    }
  })();
  await initPromise;
  return parserFor("index.ts");
}

/** The parser for this path's grammar. Extraction is synchronous and pure. */
export function parserFor(path: string): Parser {
  const parser = cached.get(grammarFor(path));
  if (!parser) {
    throw new Error("call await getTsParser() once before extract()");
  }
  return parser;
}

export function getTsParserSync(): Parser {
  return parserFor("index.ts");
}
