import type { Node as SyntaxNode, Tree } from "web-tree-sitter";
import type { ExportRecord, ImportRecord } from "../types.js";

function unquote(value: string): string {
  return value.replace(/^['"`]|['"`]$/g, "");
}

function hasToken(node: SyntaxNode, token: string): boolean {
  return node.children.some((child) => child?.type === token);
}

export function extractModuleTables(
  _source: string,
  tree: Tree,
): { imports: ImportRecord[]; exports: ExportRecord[] } {
  const imports: ImportRecord[] = [];
  const exports: ExportRecord[] = [];

  const visit = (node: SyntaxNode): void => {
    const siteLine = node.startPosition.row + 1;

    if (node.type === "import_statement") {
      const source = node.childForFieldName("source");
      const specifier = source ? unquote(source.text) : "";
      const clause = node.namedChildren.find(
        (child) => child?.type === "import_clause",
      );
      if (clause) {
        for (const child of clause.namedChildren) {
          if (child?.type === "identifier") {
            imports.push({
              localName: child.text,
              importedName: "default",
              specifier,
              siteLine,
            });
          } else if (child?.type === "namespace_import") {
            const identifier = child.namedChildren.find(
              (candidate) => candidate?.type === "identifier",
            );
            if (identifier) {
              imports.push({
                localName: identifier.text,
                importedName: "*",
                specifier,
                siteLine,
              });
            }
          } else if (child?.type === "named_imports") {
            for (const specifierNode of child.namedChildren) {
              if (specifierNode?.type !== "import_specifier") continue;
              const name = specifierNode.childForFieldName("name")?.text;
              const alias = specifierNode.childForFieldName("alias")?.text;
              if (name) {
                imports.push({
                  localName: alias ?? name,
                  importedName: name,
                  specifier,
                  siteLine,
                });
              }
            }
          }
        }
      }
    }

    if (node.type === "export_statement") {
      const source = node.childForFieldName("source");
      const reExportFrom = source ? unquote(source.text) : null;
      const exportClause = node.namedChildren.find(
        (child) => child?.type === "export_clause",
      );
      const namespaceExport = node.namedChildren.find(
        (child) => child?.type === "namespace_export",
      );
      const isDefault = hasToken(node, "default");

      if (namespaceExport && reExportFrom) {
        const name = namespaceExport.namedChildren.find(
          (child) => child?.type === "identifier",
        )?.text;
        if (name) {
          exports.push({
            exportedName: name,
            localName: "*",
            reExportFrom,
            isStar: false,
            siteLine,
          });
        }
      } else if (exportClause) {
        for (const specifier of exportClause.namedChildren) {
          if (specifier?.type !== "export_specifier") continue;
          const name = specifier.childForFieldName("name")?.text;
          const alias = specifier.childForFieldName("alias")?.text;
          if (name) {
            exports.push({
              exportedName: alias ?? name,
              localName: name,
              reExportFrom,
              isStar: false,
              siteLine,
            });
          }
        }
      } else if (hasToken(node, "*") && reExportFrom) {
        exports.push({
          exportedName: "*",
          localName: null,
          reExportFrom,
          isStar: true,
          siteLine,
        });
      } else {
        const declaration = node.childForFieldName("declaration");
        const value = node.childForFieldName("value");
        if (isDefault) {
          const localName =
            declaration?.childForFieldName("name")?.text ??
            value?.childForFieldName("name")?.text ??
            (value?.type === "identifier" ? value.text : "default");
          exports.push({
            exportedName: "default",
            localName,
            reExportFrom: null,
            isStar: false,
            siteLine,
          });
        } else if (declaration?.type === "lexical_declaration") {
          for (const declarator of declaration.namedChildren) {
            if (declarator?.type !== "variable_declarator") continue;
            const name = declarator.childForFieldName("name")?.text;
            if (name) {
              exports.push({
                exportedName: name,
                localName: name,
                reExportFrom: null,
                isStar: false,
                siteLine,
              });
            }
          }
        } else {
          const name = declaration?.childForFieldName("name")?.text;
          if (name) {
            exports.push({
              exportedName: name,
              localName: name,
              reExportFrom: null,
              isStar: false,
              siteLine,
            });
          }
        }
      }
    }

    for (let index = 0; index < node.childCount; index += 1) {
      const child = node.child(index);
      if (child) visit(child);
    }
  };

  visit(tree.rootNode);
  return { imports, exports };
}
