import { createHash } from "node:crypto";
import type { Node as SyntaxNode, Tree } from "web-tree-sitter";
import type { SymbolKind } from "../../store/repos.js";
import type { SymbolRecord } from "../types.js";

/** spec §4.1 / invariant 9: identity is the scope chain, never a line number. */
export function stableKey(path: string, scope: string[]): string {
  return `py:${path}#${scope.join(".")}`;
}

function isTestPath(path: string): boolean {
  return (
    /(^|\/)tests?\//.test(path) ||
    /(^|\/)test_[^/]*\.py$/.test(path) ||
    /_test\.py$/.test(path)
  );
}

function bodyHash(node: SyntaxNode): string {
  return createHash("sha256").update(node.text).digest("hex").slice(0, 16);
}

function signatureOf(node: SyntaxNode): string | null {
  const params = node.childForFieldName("parameters");
  const returns = node.childForFieldName("return_type");
  if (!params) return null;
  return `${params.text}${returns ? ` -> ${returns.text}` : ""}`;
}

function record(
  path: string,
  scope: string[],
  name: string,
  kind: SymbolKind,
  node: SyntaxNode,
  signature: string | null,
): SymbolRecord {
  return {
    stableKey: stableKey(path, [...scope, name]),
    qualifiedName: [...scope, name].join("."),
    shortName: name,
    kind,
    signature,
    startByte: node.startIndex,
    endByte: node.endIndex,
    startLine: node.startPosition.row + 1,
    endLine: node.endPosition.row + 1,
    bodyHash: bodyHash(node),
    // Python has no export keyword; the leading-underscore convention is the
    // only in-source signal, so it gates `exported` but never candidate
    // narrowing (spec §5.1).
    exported: !name.startsWith("_"),
    isTest: isTestPath(path),
  };
}

type EnclosingKind = "class" | "function" | null;

export function extractPythonSymbols(
  path: string,
  _source: string,
  tree: Tree,
): SymbolRecord[] {
  const out: SymbolRecord[] = [];

  const visit = (
    node: SyntaxNode,
    scope: string[],
    enclosingKind: EnclosingKind,
  ): void => {
    for (const child of node.namedChildren) {
      if (!child) continue;

      // A decorated def/class wraps the definition; recurse past the wrapper.
      if (child.type === "decorated_definition") {
        visit(child, scope, enclosingKind);
        continue;
      }

      if (
        child.type === "function_definition" ||
        child.type === "class_definition"
      ) {
        const name = child.childForFieldName("name")?.text;
        if (!name) continue;
        const kind: SymbolKind =
          child.type === "class_definition"
            ? "class"
            : enclosingKind === "class"
              ? "method"
              : "function";
        out.push(
          record(
            path,
            scope,
            name,
            kind,
            child,
            child.type === "function_definition" ? signatureOf(child) : null,
          ),
        );
        const body = child.childForFieldName("body");
        if (body) {
          visit(
            body,
            [...scope, name],
            child.type === "class_definition" ? "class" : "function",
          );
        }
        continue;
      }

      if (child.type === "expression_statement" && scope.length === 0) {
        const assignment = child.namedChildren.find(
          (candidate) => candidate?.type === "assignment",
        );
        const target = assignment?.namedChildren[0];
        if (target?.type === "identifier") {
          out.push(record(path, scope, target.text, "variable", child, null));
        }
        continue;
      }

      if (child.type === "block") visit(child, scope, enclosingKind);
    }
  };

  visit(tree.rootNode, [], null);
  return out;
}
