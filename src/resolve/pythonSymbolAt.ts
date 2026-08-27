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
  const tree = pythonParser().parse(source);
  if (!tree) return null;

  let best: { key: string; span: number } | null = null;
  for (const symbol of extractPythonSymbols(path, source, tree)) {
    if (symbol.startLine !== line) continue;
    const span = symbol.endLine - symbol.startLine;
    if (!best || span < best.span) {
      best = { key: symbol.stableKey, span };
    }
  }
  return best?.key ?? null;
}
