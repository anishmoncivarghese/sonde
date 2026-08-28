import { pythonParser } from "../adapters/python/parser.js";
import { extractPythonSymbols } from "../adapters/python/symbols.js";

/**
 * Stable key for a Python symbol declared on `line` (1-based).
 *
 * A definition target inside a function body may be a local variable,
 * parameter, or import alias. Mapping it to the enclosing Sonde symbol would
 * fabricate a COMPILER edge, so only exact declaration lines are eligible
 * (independent review C4).
 */
export function pythonSymbolAt(
  path: string,
  source: string,
  line: number,
): string | null {
  return pythonSymbolsByDeclarationLine(path, source).get(line) ?? null;
}

/** Build the exact-line map once when several pyright targets share a file. */
export function pythonSymbolsByDeclarationLine(
  path: string,
  source: string,
): ReadonlyMap<number, string> {
  const tree = pythonParser().parse(source);
  if (!tree) return new Map();

  try {
    const bestByLine = new Map<number, { key: string; span: number }>();
    for (const symbol of extractPythonSymbols(path, source, tree)) {
      const span = symbol.endLine - symbol.startLine;
      const best = bestByLine.get(symbol.startLine);
      if (!best || span < best.span) {
        bestByLine.set(symbol.startLine, { key: symbol.stableKey, span });
      }
    }
    return new Map(
      [...bestByLine].map(([declarationLine, symbol]) => [
        declarationLine,
        symbol.key,
      ]),
    );
  } finally {
    tree.delete();
  }
}
