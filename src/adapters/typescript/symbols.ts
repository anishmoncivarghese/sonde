import { createHash } from "node:crypto";
import type { Node as SyntaxNode, Tree } from "web-tree-sitter";
import type { SymbolKind } from "../../store/repos.js";
import type { SymbolRecord } from "../types.js";

const TEST_PATH = /(\.test\.|\.spec\.|(^|\/)__tests__\/)/;

interface PendingSymbol {
  node: SyntaxNode;
  name: string;
  kind: SymbolKind;
  chain: string[];
  signature: string;
  exported: boolean;
  isTest: boolean;
}

export function stableKey(
  path: string,
  scopeChain: string[],
  signatureHash?: string,
): string {
  const suffix = signatureHash ? `~${signatureHash}` : "";
  return `ts:${path}#${scopeChain.join(".")}${suffix}`;
}

function hash8(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 8);
}

/** Bodies do not participate in overload identity (spec §6.2). */
function signatureOf(node: SyntaxNode, source: string): string {
  const body = node.childForFieldName("body");
  const end = body?.startIndex ?? node.endIndex;
  return source
    .slice(node.startIndex, end)
    .replace(/\s+/g, " ")
    .trim()
    .replace(/;$/, "");
}

function isExported(node: SyntaxNode): boolean {
  let current: SyntaxNode | null = node;
  while (current) {
    if (current.type === "export_statement") return true;
    current = current.parent;
  }
  return false;
}

function isDefaultExport(node: SyntaxNode): boolean {
  const parent = node.parent;
  return (
    parent?.type === "export_statement" &&
    parent.children.some((child) => child?.type === "default")
  );
}

function nameOf(node: SyntaxNode): string | null {
  return node.childForFieldName("name")?.text ?? null;
}

function symbolKind(node: SyntaxNode): SymbolKind | null {
  switch (node.type) {
    case "function_declaration":
    case "function_signature":
    case "generator_function_declaration":
      return "function";
    case "class_declaration":
    case "abstract_class_declaration":
    case "class":
      return "class";
    case "interface_declaration":
      return "interface";
    case "type_alias_declaration":
      return "type";
    case "enum_declaration":
      return "enum";
    case "internal_module":
      return "module";
    case "method_definition":
    case "method_signature":
    case "abstract_method_signature":
      return "method";
    case "public_field_definition":
    case "property_signature":
      return "property";
    case "variable_declarator": {
      const value = node.childForFieldName("value");
      return value?.type === "arrow_function" ||
        value?.type === "function_expression"
        ? "function"
        : "variable";
    }
    default:
      return null;
  }
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

    const hashOccurrences = new Map<string, number>();
    for (const symbol of group) {
      const signatureHash = hash8(symbol.signature);
      const occurrence = (hashOccurrences.get(signatureHash) ?? 0) + 1;
      hashOccurrences.set(signatureHash, occurrence);
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
    bodyHash: createHash("sha256")
      .update(symbol.node.text)
      .digest("hex"),
    exported: symbol.exported,
    isTest: symbol.isTest,
  }));
}

export function extractSymbols(
  path: string,
  source: string,
  tree: Tree,
): SymbolRecord[] {
  const pending: PendingSymbol[] = [];
  const fileIsTest = TEST_PATH.test(path);

  const visit = (node: SyntaxNode, chain: string[]): void => {
    let nextChain = chain;
    const kind = symbolKind(node);

    if (kind) {
      let name = nameOf(node);
      if (!name && kind === "class" && isDefaultExport(node)) {
        name = "default";
      }

      // Destructuring has several bindings and no single stable scope name.
      // Its identifiers are handled by later reference extraction instead.
      const nameNode = node.childForFieldName("name");
      const simpleBinding =
        node.type !== "variable_declarator" || nameNode?.type === "identifier";
      if (name && simpleBinding) {
        nextChain = [...chain, name];
        pending.push({
          node,
          name,
          kind,
          chain: nextChain,
          signature: signatureOf(node, source),
          exported: isExported(node),
          isTest: fileIsTest,
        });
      }
    }

    // Anonymous callbacks/classes do not extend the named scope chain. Named
    // declarations inside them remain attributed to the nearest named symbol.
    for (let index = 0; index < node.childCount; index += 1) {
      const child = node.child(index);
      if (child) visit(child, nextChain);
    }
  };

  visit(tree.rootNode, []);
  return assignStableKeys(path, pending);
}
