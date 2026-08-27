import type { Node as SyntaxNode, Tree } from "web-tree-sitter";
import type { ExportRecord, ImportRecord } from "../types.js";

/** `from ..pkg.mod import X` → "..pkg.mod"; dots must survive. */
function relativeSpecifier(node: SyntaxNode): string {
  const prefix =
    node.namedChildren.find((child) => child?.type === "import_prefix")?.text ??
    "";
  const rest =
    node.namedChildren.find((child) => child?.type === "dotted_name")?.text ??
    "";
  return `${prefix}${rest}`;
}

function moduleSpecifier(node: SyntaxNode | null): string | null {
  if (!node) return null;
  if (node.type === "relative_import") return relativeSpecifier(node);
  if (node.type === "dotted_name") return node.text;
  return null;
}

export function extractPythonModuleTables(
  tree: Tree,
): { imports: ImportRecord[]; exports: ExportRecord[] } {
  const imports: ImportRecord[] = [];
  const exports: ExportRecord[] = [];

  for (const node of tree.rootNode.namedChildren) {
    if (!node) continue;
    const siteLine = node.startPosition.row + 1;

    if (node.type === "import_statement") {
      for (const child of node.namedChildren) {
        if (child?.type === "dotted_name") {
          const specifier = child.text;
          const top = specifier.split(".")[0];
          if (top) {
            imports.push({
              localName: top,
              importedName: "*",
              specifier,
              siteLine,
            });
          }
        } else if (child?.type === "aliased_import") {
          const specifier = child.namedChildren.find(
            (candidate) => candidate?.type === "dotted_name",
          )?.text;
          const alias =
            child.childForFieldName("alias") ?? child.namedChildren.at(-1);
          if (specifier && alias) {
            imports.push({
              localName: alias.text,
              importedName: "*",
              specifier,
              siteLine,
            });
          }
        }
      }
      continue;
    }

    if (node.type === "import_from_statement") {
      const specifier = moduleSpecifier(node.namedChildren[0] ?? null);
      if (!specifier) continue;

      const wildcard = node.namedChildren.some(
        (child) => child?.type === "wildcard_import",
      );
      if (wildcard) {
        imports.push({
          localName: "*",
          importedName: "*",
          specifier,
          siteLine,
        });
        exports.push({
          exportedName: "*",
          localName: null,
          reExportFrom: specifier,
          isStar: true,
          siteLine,
        });
        continue;
      }

      for (const child of node.namedChildren.slice(1)) {
        if (child?.type === "dotted_name") {
          const name = child.text;
          imports.push({
            localName: name,
            importedName: name,
            specifier,
            siteLine,
          });
          exports.push({
            exportedName: name,
            localName: name,
            reExportFrom: specifier,
            isStar: false,
            siteLine,
          });
        } else if (child?.type === "aliased_import") {
          const original = child.namedChildren.find(
            (candidate) => candidate?.type === "dotted_name",
          )?.text;
          const alias =
            child.childForFieldName("alias") ?? child.namedChildren.at(-1);
          if (original && alias) {
            imports.push({
              localName: alias.text,
              importedName: original,
              specifier,
              siteLine,
            });
            exports.push({
              exportedName: alias.text,
              localName: original,
              reExportFrom: specifier,
              isStar: false,
              siteLine,
            });
          }
        }
      }
      continue;
    }

    // Python has no export keyword: every module-level binding is importable.
    if (node.type === "function_definition" || node.type === "class_definition") {
      const name = node.childForFieldName("name")?.text;
      if (name) {
        exports.push({
          exportedName: name,
          localName: name,
          reExportFrom: null,
          isStar: false,
          siteLine,
        });
      }
      continue;
    }
    if (node.type === "decorated_definition") {
      const inner = node.namedChildren.find(
        (child) =>
          child?.type === "function_definition" ||
          child?.type === "class_definition",
      );
      const name = inner?.childForFieldName("name")?.text;
      if (name) {
        exports.push({
          exportedName: name,
          localName: name,
          reExportFrom: null,
          isStar: false,
          siteLine,
        });
      }
      continue;
    }
    if (node.type === "expression_statement") {
      const target = node.namedChildren.find(
        (child) => child?.type === "assignment",
      )?.namedChildren[0];
      if (target?.type === "identifier") {
        exports.push({
          exportedName: target.text,
          localName: target.text,
          reExportFrom: null,
          isStar: false,
          siteLine,
        });
      }
    }
  }

  return { imports, exports };
}
