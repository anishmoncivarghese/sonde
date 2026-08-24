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
  excluded?: SyntaxNode,
): SymbolRecord | null {
  let best: SymbolRecord | null = null;
  for (const symbol of symbols) {
    if (
      excluded &&
      symbol.startByte === excluded.startIndex &&
      symbol.endByte === excluded.endIndex
    ) {
      continue;
    }
    if (offset >= symbol.startByte && offset < symbol.endByte) {
      if (!best || symbol.startByte > best.startByte) best = symbol;
    }
  }
  return best;
}

interface TypedBinding {
  ownerKey: string;
  name: string;
  typeName: string;
  startByte: number;
}

function simpleBindingName(node: SyntaxNode): string | null {
  const field = node.childForFieldName("name");
  const direct = field?.descendantsOfType("simple_identifier").find(Boolean);
  if (direct) return direct.text;
  return node.namedChildren.find((child) => child?.type === "simple_identifier")
    ?.text ?? null;
}

function writtenTypeName(node: SyntaxNode): string | null {
  const typeIdentifiers = node
    .descendantsOfType("type_identifier")
    .filter(Boolean);
  return typeIdentifiers.at(-1)?.text ?? null;
}

function typedBindings(tree: Tree, symbols: SymbolRecord[]): TypedBinding[] {
  const bindings: TypedBinding[] = [];
  const visit = (node: SyntaxNode): void => {
    if (node.type === "property_declaration" || node.type === "parameter") {
      const name = simpleBindingName(node);
      const typeName = writtenTypeName(node);
      const owner = enclosing(symbols, node.startIndex, node);
      if (name && typeName && owner) {
        bindings.push({
          ownerKey: owner.stableKey,
          name,
          typeName,
          startByte: node.startIndex,
        });
      }
    }
    for (const child of node.namedChildren) {
      if (child) visit(child);
    }
  };
  visit(tree.rootNode);
  return bindings;
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
  const bindings = typedBindings(tree, symbols);

  const add = (
    node: SyntaxNode,
    name: string,
    receiver: string | null,
    kind: ReferenceRecord["kind"],
  ): void => {
    const owner = enclosing(symbols, node.startIndex);
    if (!owner) return;
    const receiverType =
      receiver && /^[A-Za-z_][A-Za-z0-9_]*$/.test(receiver)
        ? bindings
            .filter(
              (binding) =>
                binding.ownerKey === owner.stableKey &&
                binding.name === receiver &&
                binding.startByte <= node.startIndex,
            )
            .sort((left, right) => right.startByte - left.startByte)[0]
            ?.typeName ?? null
        : null;
    const scopeHint: ScopeHint = {
      module: swiftPmTarget(path),
      file: path,
      visibility: owner.visibility ?? null,
      receiver,
      receiverType,
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
