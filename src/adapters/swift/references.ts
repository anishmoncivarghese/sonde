import type { Node as SyntaxNode, Tree } from "web-tree-sitter";
import type {
  ReferenceRecord,
  ScopeHint,
  SymbolRecord,
} from "../types.js";

function swiftPmTarget(path: string): string | null {
  const parts = path.split("/");
  if ((parts[0] === "Sources" || parts[0] === "Tests") && parts.length >= 3) {
    return parts[1] ?? null;
  }
  return null;
}

/** Nearest named enclosing symbol by byte containment (spec §6.2). */
function enclosing(
  symbols: SymbolRecord[],
  offset: number,
): SymbolRecord | null {
  let best: SymbolRecord | null = null;
  for (const symbol of symbols) {
    if (offset >= symbol.startByte && offset < symbol.endByte) {
      if (!best || symbol.startByte > best.startByte) best = symbol;
    }
  }
  return best;
}

function navigationParts(
  node: SyntaxNode,
): { name: string; receiver: string } | null {
  if (node.type !== "navigation_expression") return null;
  const target = node.childForFieldName("target");
  const suffix = node.childForFieldName("suffix")?.childForFieldName("suffix");
  if (!target || !suffix) return null;
  return { name: suffix.text, receiver: target.text };
}

function referencedType(node: SyntaxNode): SyntaxNode | null {
  if (node.type === "type_identifier" || node.type === "simple_identifier") {
    return node;
  }
  const identifiers = node.descendantsOfType("type_identifier");
  return identifiers.at(-1) ?? null;
}

function conformanceKind(
  declaration: SyntaxNode,
  name: string,
  symbols: SymbolRecord[],
): "IMPLEMENTS" | "INHERITS" {
  const declarationKeyword = declaration.children.find((child) =>
    child !== null &&
    ["actor", "class", "enum", "extension", "struct"].includes(child.type),
  )?.type;
  if (declarationKeyword !== "class") return "IMPLEMENTS";
  return symbols.some(
    (symbol) => symbol.shortName === name && symbol.kind === "interface",
  )
    ? "IMPLEMENTS"
    : "INHERITS";
}

export function extractSwiftReferences(
  path: string,
  _source: string,
  tree: Tree,
  symbols: SymbolRecord[],
): ReferenceRecord[] {
  const references: ReferenceRecord[] = [];

  const add = (
    node: SyntaxNode,
    name: string,
    receiver: string | null,
    kind: ReferenceRecord["kind"],
  ): void => {
    const owner = enclosing(symbols, node.startIndex);
    if (!owner) return;
    const scopeHint: ScopeHint = {
      module: swiftPmTarget(path),
      file: path,
      visibility: owner.visibility ?? null,
      receiver,
    };
    references.push({
      fromSymbolKey: owner.stableKey,
      name,
      receiver,
      scopeHint,
      kind,
      siteLine: node.startPosition.row + 1,
    });
  };

  const addCall = (node: SyntaxNode): void => {
    const callable = node.namedChildren[0];
    if (!callable) return;
    if (
      callable.type === "simple_identifier" ||
      callable.type === "type_identifier"
    ) {
      add(callable, callable.text, null, "CALLS");
      return;
    }
    const navigation = navigationParts(callable);
    if (navigation) {
      add(callable, navigation.name, navigation.receiver, "CALLS");
    }
  };

  const addTypeReferences = (node: SyntaxNode): void => {
    for (const typeNode of node.descendantsOfType("type_identifier")) {
      if (typeNode) add(typeNode, typeNode.text, null, "REFERENCES");
    }
  };

  const visit = (node: SyntaxNode): void => {
    if (node.type === "call_expression") {
      addCall(node);
    } else if (node.type === "type_annotation") {
      addTypeReferences(node);
    } else if (node.type === "inheritance_specifier") {
      const typeNode = referencedType(node);
      const declaration = node.parent;
      if (typeNode && declaration) {
        add(
          typeNode,
          typeNode.text,
          null,
          conformanceKind(declaration, typeNode.text, symbols),
        );
      }
    }

    for (const child of node.namedChildren) {
      if (child) visit(child);
    }
  };

  visit(tree.rootNode);
  return references;
}
