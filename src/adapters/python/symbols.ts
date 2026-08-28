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

/**
 * Decorator text lines attached to a definition, if any.
 *
 * The decorators are the only in-source evidence that distinguishes an
 * `@overload` type declaration from an implementation, or a property setter
 * from its getter. Both are needed to keep stable keys unique without falling
 * back on line numbers (invariant 9).
 */
function decoratorsOf(decorated: SyntaxNode): string[] {
  return decorated.namedChildren
    .filter((child) => child?.type === "decorator")
    .map((child) => child!.text.split("\n")[0]!.trim());
}

function isOverloadStub(decorators: string[]): boolean {
  return decorators.some((d) => /^@\s*(typing\.)?overload\b/.test(d));
}

/** `@x.setter` → "setter". A plain `@property` is the base accessor. */
function accessorRole(decorators: string[]): string | null {
  for (const decorator of decorators) {
    const match = /^@[A-Za-z_][\w.]*\.(setter|getter|deleter)\b/.exec(decorator);
    if (match) return match[1]!;
  }
  return null;
}

function record(
  path: string,
  scope: string[],
  name: string,
  kind: SymbolKind,
  node: SyntaxNode,
  signature: string | null,
  keyName: string = name,
): SymbolRecord {
  return {
    // The key may carry a disambiguating suffix; the display fields never do,
    // so `find_symbols` still matches what a human would type.
    stableKey: stableKey(path, [...scope, keyName]),
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

interface Candidate {
  symbol: SymbolRecord;
  /** An `@overload` declaration, which is a type stub rather than code. */
  overload: boolean;
}

/**
 * Guarantee one symbol per stable key.
 *
 * Four distinct causes produced collisions on real code, measured on pydantic:
 * module-level rebinding (37 keys), `@overload` families (29), property
 * accessor triples (9), and genuine same-scope redefinitions (13). Each needs
 * different treatment, and none may resort to a line number (invariant 9).
 */
function deduplicate(candidates: Candidate[]): SymbolRecord[] {
  const byKey = new Map<string, Candidate[]>();
  for (const candidate of candidates) {
    const group = byKey.get(candidate.symbol.stableKey) ?? [];
    group.push(candidate);
    byKey.set(candidate.symbol.stableKey, group);
  }

  const kept = new Set<SymbolRecord>();
  for (const group of byKey.values()) {
    const first = group[0]!;
    if (group.length === 1) {
      kept.add(first.symbol);
      continue;
    }

    // A name rebound in one scope is one variable, however often it is assigned.
    if (first.symbol.kind === "variable") {
      kept.add(first.symbol);
      continue;
    }

    // PEP 484 overloads declare types for a single runtime function, so the
    // family is one symbol. Prefer the implementation; a .pyi stub file has
    // none, so the first declaration represents it.
    const implementations = group.filter((c) => !c.overload);
    if (implementations.length <= 1 && group.some((c) => c.overload)) {
      kept.add((implementations[0] ?? first).symbol);
      continue;
    }

    // What remains is genuinely distinct code sharing a scope chain. The first
    // keeps its bare key so existing identities never move; the rest take an
    // ordinal, which survives line moves and body edits and changes only when
    // a same-named sibling is inserted before them.
    for (const [index, candidate] of group.entries()) {
      kept.add(
        index === 0
          ? candidate.symbol
          : { ...candidate.symbol, stableKey: `${candidate.symbol.stableKey}$${index + 1}` },
      );
    }
  }

  // Preserve source order rather than grouping order.
  const order = new Map(candidates.map((c, i) => [c.symbol, i]));
  return [...kept].sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0));
}

export function extractPythonSymbols(
  path: string,
  _source: string,
  tree: Tree,
): SymbolRecord[] {
  const candidates: Candidate[] = [];

  const visit = (
    node: SyntaxNode,
    scope: string[],
    enclosingKind: EnclosingKind,
  ): void => {
    for (const child of node.namedChildren) {
      if (!child) continue;

      // A decorated def/class wraps the definition. The decorators must travel
      // with it: they are what separates an overload stub from an
      // implementation, and a property setter from its getter.
      const decorated = child.type === "decorated_definition";
      const definition = decorated
        ? child.namedChildren.find(
            (c) =>
              c?.type === "function_definition" || c?.type === "class_definition",
          )
        : child;
      if (decorated && !definition) continue;
      const decorators = decorated ? decoratorsOf(child) : [];
      const target = definition!;

      if (
        target.type === "function_definition" ||
        target.type === "class_definition"
      ) {
        const name = target.childForFieldName("name")?.text;
        if (!name) continue;
        const kind: SymbolKind =
          target.type === "class_definition"
            ? "class"
            : enclosingKind === "class"
              ? "method"
              : "function";
        // `@` cannot appear in a Python identifier, so a role suffix can never
        // collide with a real name.
        const role = accessorRole(decorators);
        candidates.push({
          symbol: record(
            path,
            scope,
            name,
            kind,
            target,
            target.type === "function_definition" ? signatureOf(target) : null,
            role ? `${name}@${role}` : name,
          ),
          overload: isOverloadStub(decorators),
        });
        const body = target.childForFieldName("body");
        if (body) {
          visit(
            body,
            [...scope, name],
            target.type === "class_definition" ? "class" : "function",
          );
        }
        continue;
      }

      if (child.type === "expression_statement" && scope.length === 0) {
        const assignment = child.namedChildren.find(
          (candidate) => candidate?.type === "assignment",
        );
        const assignTarget = assignment?.namedChildren[0];
        if (assignTarget?.type === "identifier") {
          candidates.push({
            symbol: record(path, scope, assignTarget.text, "variable", child, null),
            overload: false,
          });
        }
        continue;
      }

      if (child.type === "block") visit(child, scope, enclosingKind);
    }
  };

  visit(tree.rootNode, [], null);
  return deduplicate(candidates);
}
