import { basename } from "node:path";
import type { Tree } from "web-tree-sitter";
import { EXTRACTOR_VERSION } from "../../version.js";
import type { ExtractResult, LanguageAdapter, SymbolRecord } from "../types.js";
import { extractSwiftModuleTables } from "./modules.js";
import { swiftParser } from "./parser.js";
import { extractSwiftReferences } from "./references.js";
import { extractSwiftSymbols } from "./symbols.js";

function fileSymbol(path: string, tree: Tree): SymbolRecord {
  return {
    stableKey: `swift:${path}#`,
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
    isTest: /(^|\/)Tests\//.test(path),
  };
}

export const swiftAdapter: LanguageAdapter = {
  language: "swift",
  extractorVersion: EXTRACTOR_VERSION,
  matches: (path) => path.endsWith(".swift"),
  extract(path, bytes): ExtractResult {
    const source = Buffer.from(bytes).toString("utf8");
    const tree = swiftParser().parse(source);
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
      ...extractSwiftSymbols(path, source, tree),
    ];
    const { imports, exports } = extractSwiftModuleTables(tree);
    return {
      symbols,
      references: extractSwiftReferences(path, source, tree, symbols),
      imports,
      exports,
      diagnostics: tree.rootNode.hasError
        ? [{ severity: "warning", message: "parse errors present", line: 1 }]
        : [],
    };
  },
};
