import { createHash } from "node:crypto";
import type { Node as SyntaxNode, Tree } from "web-tree-sitter";
import type { SymbolKind } from "../../store/repos.js";
import type { SymbolRecord, SymbolVisibility } from "../types.js";

const TEST_PATH = /(^|\/)Tests\//;

interface PendingSymbol {
  node: SyntaxNode;
  name: string;
  kind: SymbolKind;
  chain: string[];
  signature: string;
  visibility: SymbolVisibility;
  isTest: boolean;
}

function hash8(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 8);
}

function stableKey(path: string, chain: string[]): string {
  return `swift:${path}#${chain.join(".")}`;
}

function signatureOf(node: SyntaxNode, source: string): string {
  const body =
    node.childForFieldName("body") ??
    node.namedChildren.find((child) =>
      child !== null &&
      [
        "class_body",
        "enum_class_body",
        "function_body",
        "protocol_body",
      ].includes(child.type),
    );
  const end = body?.startIndex ?? node.endIndex;
  return source.slice(node.startIndex, end).replace(/\s+/g, " ").trim();
}

function visibilityOf(
  node: SyntaxNode,
  inherited: SymbolVisibility = "internal",
): SymbolVisibility {
  const modifiers = node.namedChildren.find(
    (child) => child?.type === "modifiers",
  );
  const text = modifiers?.namedChildren
    .find((child) => child?.type === "visibility_modifier")
    ?.text.trim();
  if (!text) return inherited;
  if (text.startsWith("fileprivate")) return "fileprivate";
  if (text.startsWith("private")) return "private";
  if (text.startsWith("internal")) return "internal";
  if (text.startsWith("public")) return "public";
  if (text.startsWith("open")) return "open";
  return inherited;
}

function isTypeContainer(node: SyntaxNode): boolean {
  return node.type === "class_declaration" || node.type === "protocol_declaration";
}

function nearestNamedContainer(node: SyntaxNode): SyntaxNode | null {
  let current = node.parent;
  while (current) {
    if (
      isTypeContainer(current) ||
      current.type === "function_declaration" ||
      current.type === "protocol_function_declaration"
    ) {
      return current;
    }
    current = current.parent;
  }
  return null;
}

function keyword(node: SyntaxNode): string | null {
  return node.children.find((child) =>
    child !== null &&
    ["actor", "class", "enum", "extension", "struct"].includes(child.type),
  )?.type ?? null;
}

function simpleName(node: SyntaxNode): string | null {
  return node.childForFieldName("name")?.text.trim() ?? null;
}

function extensionChain(node: SyntaxNode): string[] | null {
  const declaredType = simpleName(node);
  if (!declaredType) return null;
  return declaredType
    .replace(/\s+/g, "")
    .split(".")
    .filter(Boolean);
}

function kindAndName(
  node: SyntaxNode,
): { kind: SymbolKind; name: string } | null {
  if (node.type === "class_declaration") {
    const declarationKeyword = keyword(node);
    if (declarationKeyword === "extension") return null;
    const name = simpleName(node);
    if (!name) return null;
    return {
      kind: declarationKeyword === "enum" ? "enum" : "class",
      name,
    };
  }

  if (node.type === "protocol_declaration") {
    const name = simpleName(node);
    return name ? { kind: "interface", name } : null;
  }

  if (node.type === "typealias_declaration") {
    const name = simpleName(node);
    return name ? { kind: "type", name } : null;
  }

  if (node.type === "associatedtype_declaration") {
    const name = simpleName(node);
    return name ? { kind: "type", name } : null;
  }

  if (
    node.type === "function_declaration" ||
    node.type === "protocol_function_declaration"
  ) {
    const name = simpleName(node);
    if (!name) return null;
    const container = nearestNamedContainer(node);
    return {
      kind: container && isTypeContainer(container) ? "method" : "function",
      name,
    };
  }

  if (node.type === "init_declaration") {
    return { kind: "method", name: "init" };
  }

  if (node.type === "deinit_declaration") {
    return { kind: "method", name: "deinit" };
  }

  if (node.type === "subscript_declaration") {
    return { kind: "method", name: "subscript" };
  }

  if (
    node.type === "property_declaration" ||
    node.type === "protocol_property_declaration"
  ) {
    const name = simpleName(node);
    if (!name) return null;
    const container = nearestNamedContainer(node);
    return {
      kind: container && isTypeContainer(container) ? "property" : "variable",
      name,
    };
  }

  return null;
}

function assignStableKeys(path: string, pending: PendingSymbol[]): SymbolRecord[] {
  const groups = new Map<string, PendingSymbol[]>();
  for (const symbol of pending) {
    const base = stableKey(path, symbol.chain);
    const group = groups.get(base) ?? [];
    group.push(symbol);
    groups.set(base, group);
  }

  const keys = new Map<PendingSymbol, string>();
  for (const [base, group] of groups) {
    if (group.length === 1) {
      const only = group[0];
      if (only) keys.set(only, base);
      continue;
    }

    const occurrences = new Map<string, number>();
    for (const symbol of group) {
      const signatureHash = hash8(symbol.signature);
      const occurrence = (occurrences.get(signatureHash) ?? 0) + 1;
      occurrences.set(signatureHash, occurrence);
      const collisionSuffix = occurrence === 1 ? "" : `~${occurrence}`;
      keys.set(symbol, `${base}~${signatureHash}${collisionSuffix}`);
    }
  }

  return pending.map((symbol) => ({
    stableKey: keys.get(symbol) ?? stableKey(path, symbol.chain),
    qualifiedName: symbol.chain.join("."),
    shortName: symbol.name,
    kind: symbol.kind,
    signature: symbol.signature,
    startByte: symbol.node.startIndex,
    endByte: symbol.node.endIndex,
    startLine: symbol.node.startPosition.row + 1,
    endLine: symbol.node.endPosition.row + 1,
    bodyHash: createHash("sha256").update(symbol.node.text).digest("hex"),
    exported: symbol.visibility === "public" || symbol.visibility === "open",
    isTest: symbol.isTest,
    visibility: symbol.visibility,
  }));
}

export function extractSwiftSymbols(
  path: string,
  source: string,
  tree: Tree,
): SymbolRecord[] {
  const pending: PendingSymbol[] = [];
  const fileIsTest = TEST_PATH.test(path);

  const visit = (
    node: SyntaxNode,
    chain: string[],
    inheritedVisibility: SymbolVisibility = "internal",
  ): void => {
    let nextChain = chain;
    let childVisibility = inheritedVisibility;

    if (node.type === "class_declaration" && keyword(node) === "extension") {
      const extended = extensionChain(node);
      if (extended) nextChain = extended;
      childVisibility = visibilityOf(node, inheritedVisibility);
    } else {
      const declaration = kindAndName(node);
      if (declaration) {
        nextChain = [...chain, declaration.name];
        const visibility = visibilityOf(node, inheritedVisibility);
        pending.push({
          node,
          name: declaration.name,
          kind: declaration.kind,
          chain: nextChain,
          signature: signatureOf(node, source),
          visibility,
          isTest: fileIsTest,
        });
      }
    }

    for (const child of node.namedChildren) {
      if (child) visit(child, nextChain, childVisibility);
    }
  };

  visit(tree.rootNode, []);
  return assignStableKeys(path, pending);
}
