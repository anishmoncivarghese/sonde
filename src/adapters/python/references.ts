import type { Node as SyntaxNode, Tree } from "web-tree-sitter";
import type {
  ReferenceRecord,
  ScopeHint,
  SymbolRecord,
} from "../types.js";
import { stableKey } from "./symbols.js";

/**
 * The nearest named enclosing symbol, falling back to the file symbol.
 *
 * The fallback is not cosmetic: module-level code and code inside anonymous
 * constructs would otherwise be dropped, which is the exact defect that hid
 * 37 of 44 unresolved Hono references until the compiler pass gained the same
 * file-level fallback (spec §6.2).
 */
function enclosingKey(path: string, scope: string[]): string {
  return stableKey(path, scope);
}

function hintFor(path: string, receiverType: string | null): ScopeHint {
  return {
    module: null,
    file: path,
    visibility: null,
    receiver: null,
    // spec §5.1: only written-in-source evidence; never inferred.
    receiverType,
  };
}

export function extractPythonReferences(
  path: string,
  _source: string,
  tree: Tree,
  _symbols: SymbolRecord[],
): ReferenceRecord[] {
  const out: ReferenceRecord[] = [];

  const push = (
    name: string,
    receiver: string | null,
    kind: ReferenceRecord["kind"],
    node: SyntaxNode,
    scope: string[],
    enclosingClass: string | null,
  ): void => {
    const receiverType =
      receiver === "self" || receiver === "cls" ? enclosingClass : null;
    out.push({
      fromSymbolKey: enclosingKey(path, scope),
      name,
      receiver,
      scopeHint: hintFor(path, receiverType),
      kind,
      siteLine: node.startPosition.row + 1,
    });
  };

  const visitExpression = (
    node: SyntaxNode,
    scope: string[],
    enclosingClass: string | null,
  ): void => {
    if (node.type === "call") {
      const fn = node.childForFieldName("function");
      if (fn?.type === "identifier") {
        push(fn.text, null, "CALLS", fn, scope, enclosingClass);
      } else if (fn?.type === "attribute") {
        const object = fn.childForFieldName("object");
        const attribute = fn.childForFieldName("attribute");
        if (attribute) {
          push(
            attribute.text,
            object?.type === "identifier" ? object.text : null,
            "CALLS",
            attribute,
            scope,
            enclosingClass,
          );
        }
      }
    }
    if (node.type === "type") {
      for (const identifier of node.descendantsOfType("identifier")) {
        if (identifier) {
          push(
            identifier.text,
            null,
            "REFERENCES",
            identifier,
            scope,
            enclosingClass,
          );
        }
      }
      return;
    }
    for (const child of node.namedChildren) {
      if (child) visitExpression(child, scope, enclosingClass);
    }
  };

  const visitDecorator = (
    decorator: SyntaxNode,
    scope: string[],
    enclosingClass: string | null,
  ): void => {
    const expression = decorator.namedChildren[0];
    if (!expression) return;
    if (expression.type === "attribute") {
      const object = expression.childForFieldName("object");
      const attribute = expression.childForFieldName("attribute");
      if (attribute) {
        push(
          attribute.text,
          object?.type === "identifier" ? object.text : null,
          "REFERENCES",
          attribute,
          scope,
          enclosingClass,
        );
      }
      return;
    }
    if (expression.type === "identifier") {
      push(
        expression.text,
        null,
        "REFERENCES",
        expression,
        scope,
        enclosingClass,
      );
      return;
    }
    visitExpression(expression, scope, enclosingClass);
  };

  const visit = (
    node: SyntaxNode,
    scope: string[],
    enclosingClass: string | null,
  ): void => {
    for (const child of node.namedChildren) {
      if (!child) continue;

      if (child.type === "decorated_definition") {
        for (const decorator of child.namedChildren) {
          if (decorator?.type === "decorator") {
            visitDecorator(decorator, scope, enclosingClass);
          }
        }
        visit(child, scope, enclosingClass);
        continue;
      }

      if (child.type === "class_definition") {
        const name = child.childForFieldName("name")?.text;
        if (!name) continue;
        const bases = child.childForFieldName("superclasses");
        for (const base of bases?.namedChildren ?? []) {
          if (base?.type === "identifier") {
            push(base.text, null, "INHERITS", base, scope, enclosingClass);
          }
        }
        const body = child.childForFieldName("body");
        if (body) visit(body, [...scope, name], name);
        continue;
      }

      if (child.type === "function_definition") {
        const name = child.childForFieldName("name")?.text;
        if (!name) continue;
        const returns = child.childForFieldName("return_type");
        if (returns) visitExpression(returns, scope, enclosingClass);
        const body = child.childForFieldName("body");
        if (body) visit(body, [...scope, name], enclosingClass);
        continue;
      }

      if (child.type === "block") {
        visit(child, scope, enclosingClass);
        continue;
      }
      visitExpression(child, scope, enclosingClass);
    }
  };

  visit(tree.rootNode, [], null);
  return out;
}
