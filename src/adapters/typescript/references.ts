import type { Node as SyntaxNode, Tree } from "web-tree-sitter";
import type { ReferenceRecord, SymbolRecord } from "../types.js";

/** Nearest named enclosing symbol by byte containment (spec §6.2). */
function enclosing(symbols: SymbolRecord[], offset: number): string | null {
  let best: SymbolRecord | null = null;
  for (const symbol of symbols) {
    if (offset >= symbol.startByte && offset < symbol.endByte) {
      if (!best || symbol.startByte > best.startByte) best = symbol;
    }
  }
  return best?.stableKey ?? null;
}

export function extractReferences(
  _path: string,
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
    const fromSymbolKey = enclosing(symbols, node.startIndex);
    if (!fromSymbolKey) return;
    references.push({
      fromSymbolKey,
      name,
      receiver,
      kind,
      siteLine: node.startPosition.row + 1,
    });
  };

  const addCallable = (
    callable: SyntaxNode | null,
    kind: "CALLS" | "INHERITS",
  ): void => {
    if (!callable) return;
    if (callable.type === "identifier" || callable.type === "type_identifier") {
      add(callable, callable.text, null, kind);
      return;
    }
    if (callable.type === "member_expression") {
      const property = callable.childForFieldName("property");
      const object = callable.childForFieldName("object");
      if (property) add(property, property.text, object?.text ?? null, kind);
    }
  };

  const addImplemented = (implemented: SyntaxNode): void => {
    if (
      implemented.type === "identifier" ||
      implemented.type === "type_identifier"
    ) {
      add(implemented, implemented.text, null, "IMPLEMENTS");
    } else if (implemented.type === "generic_type") {
      const name = implemented.childForFieldName("name");
      if (name) add(name, name.text, null, "IMPLEMENTS");
    } else if (implemented.type === "nested_type_identifier") {
      const name = implemented.childForFieldName("name");
      const module = implemented.childForFieldName("module");
      if (name) add(name, name.text, module?.text ?? null, "IMPLEMENTS");
    }
  };

  const addArguments = (node: SyntaxNode): void => {
    const argumentsNode = node.childForFieldName("arguments");
    if (!argumentsNode) return;
    for (const argument of argumentsNode.namedChildren) {
      if (argument?.type === "identifier") {
        add(argument, argument.text, null, "REFERENCES");
      }
    }
  };

  const visit = (node: SyntaxNode): void => {
    if (node.type === "call_expression") {
      addCallable(node.childForFieldName("function"), "CALLS");
      addArguments(node);
    } else if (node.type === "new_expression") {
      addCallable(node.childForFieldName("constructor"), "CALLS");
      addArguments(node);
    } else if (node.type === "class_heritage") {
      for (const clause of node.namedChildren) {
        if (clause?.type === "extends_clause") {
          addCallable(clause.childForFieldName("value"), "INHERITS");
        } else if (clause?.type === "implements_clause") {
          for (const implemented of clause.namedChildren) {
            if (implemented) addImplemented(implemented);
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
  return references;
}
