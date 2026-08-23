import { basename } from "node:path";
import type { Tree } from "web-tree-sitter";
import { EXTRACTOR_VERSION } from "../../version.js";
import type { ExtractResult, LanguageAdapter, SymbolRecord } from "../types.js";
import { extractModuleTables } from "./modules.js";
import { parserFor } from "./parser.js";
import { extractReferences } from "./references.js";
import { extractSymbols, stableKey } from "./symbols.js";

function fileSymbol(path: string, tree: Tree): SymbolRecord {
  return {
    stableKey: stableKey(path, []),
    qualifiedName: path,
    shortName: basename(path),
    kind: "file",
    signature: null,
    startByte: 0,
    endByte: tree.rootNode.endIndex,
    startLine: 1,
    endLine: tree.rootNode.endPosition.row + 1,
    bodyHash: null,
    exported: false,
    isTest: false,
  };
}

export const typescriptAdapter: LanguageAdapter = {
  language: "typescript",
  extractorVersion: EXTRACTOR_VERSION,
  matches: (path) =>
    /\.(ts|tsx|mts|cts)$/.test(path) && !/\.d\.(ts|mts|cts)$/.test(path),
  extract(path, bytes): ExtractResult {
    const source = Buffer.from(bytes).toString("utf8");
    const tree = parserFor(path).parse(source);
    if (!tree) {
      return {
        symbols: [],
        references: [],
        imports: [],
        exports: [],
        diagnostics: [
          { severity: "error", message: "parser returned no tree", line: 1 },
        ],
      };
    }

    const symbols = [
      fileSymbol(path, tree),
      ...extractSymbols(path, source, tree),
    ];
    const { imports, exports } = extractModuleTables(source, tree);
    return {
      symbols,
      references: extractReferences(path, source, tree, symbols),
      imports,
      exports,
      diagnostics: tree.rootNode.hasError
        ? [{ severity: "warning", message: "parse errors present", line: 1 }]
        : [],
    };
  },
};
