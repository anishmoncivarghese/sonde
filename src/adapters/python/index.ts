import { basename } from "node:path";
import type { Tree } from "web-tree-sitter";
import { EXTRACTOR_VERSION } from "../../version.js";
import type { ExtractResult, LanguageAdapter, SymbolRecord } from "../types.js";
import { extractPythonModuleTables } from "./modules.js";
import { pythonParser } from "./parser.js";
import { extractPythonReferences } from "./references.js";
import { extractPythonSymbols, stableKey } from "./symbols.js";

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
    isTest:
      /(^|\/)tests?\//.test(path) || /(^|\/)test_[^/]*\.py$/.test(path),
  };
}

export const pythonAdapter: LanguageAdapter = {
  language: "python",
  extractorVersion: EXTRACTOR_VERSION,
  matches: (path) => /\.pyi?$/.test(path),
  extract(path, bytes): ExtractResult {
    const source = Buffer.from(bytes).toString("utf8");
    const tree = pythonParser().parse(source);
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
      ...extractPythonSymbols(path, source, tree),
    ];
    const { imports, exports } = extractPythonModuleTables(tree);
    return {
      symbols,
      references: extractPythonReferences(path, source, tree, symbols),
      imports,
      exports,
      diagnostics: tree.rootNode.hasError
        ? [{ severity: "warning", message: "parse errors present", line: 1 }]
        : [],
    };
  },
};
