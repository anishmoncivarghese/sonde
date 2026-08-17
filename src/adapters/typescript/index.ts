import { EXTRACTOR_VERSION } from "../../version.js";
import type { ExtractResult, LanguageAdapter } from "../types.js";
import { extractModuleTables } from "./modules.js";
import { getTsParserSync } from "./parser.js";
import { extractReferences } from "./references.js";
import { extractSymbols } from "./symbols.js";

export const typescriptAdapter: LanguageAdapter = {
  language: "typescript",
  extractorVersion: EXTRACTOR_VERSION,
  matches: (path) =>
    /\.(ts|tsx|mts|cts)$/.test(path) && !/\.d\.(ts|mts|cts)$/.test(path),
  extract(path, bytes): ExtractResult {
    const source = Buffer.from(bytes).toString("utf8");
    const tree = getTsParserSync().parse(source);
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

    const symbols = extractSymbols(path, source, tree);
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
