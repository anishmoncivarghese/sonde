import type { Node as SyntaxNode, Tree } from "web-tree-sitter";
import type { ExportRecord, ImportRecord } from "../types.js";

function importedPath(node: SyntaxNode): string | null {
  return node.namedChildren.find((child) => child?.type === "identifier")?.text ?? null;
}

/** Swift imports expose modules, not file-level export bindings. */
export function extractSwiftModuleTables(
  tree: Tree,
): { imports: ImportRecord[]; exports: ExportRecord[] } {
  const imports: ImportRecord[] = [];

  for (const node of tree.rootNode.namedChildren) {
    if (node?.type !== "import_declaration") continue;
    const path = importedPath(node);
    if (!path) continue;
    const parts = path.split(".");
    const module = parts[0];
    if (!module) continue;
    const importedName = parts.length === 1 ? "*" : (parts.at(-1) ?? "*");
    imports.push({
      localName: importedName === "*" ? module : importedName,
      importedName,
      specifier: module,
      siteLine: node.startPosition.row + 1,
    });
  }

  return { imports, exports: [] };
}
