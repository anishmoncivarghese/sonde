import { createHash } from "node:crypto";
import { relative, sep } from "node:path";
import ts from "typescript";
import { stableKey } from "../adapters/typescript/symbols.js";
import type { CompilerContext } from "./compilerPass.js";

function hasModifier(node: ts.Node, kind: ts.SyntaxKind): boolean {
  return (
    ts.canHaveModifiers(node) &&
    (ts.getModifiers(node)?.some((modifier) => modifier.kind === kind) ?? false)
  );
}

/** Keep this vocabulary aligned with symbols.ts' symbolKind/nameOf pair. */
function namedSegment(node: ts.Node): string | null {
  if (ts.isFunctionDeclaration(node) && node.name) return node.name.text;
  if (ts.isClassDeclaration(node) || ts.isClassExpression(node)) {
    if (node.name) return node.name.text;
    if (
      ts.isClassDeclaration(node) &&
      hasModifier(node, ts.SyntaxKind.DefaultKeyword)
    ) {
      return "default";
    }
    return null;
  }
  if (ts.isInterfaceDeclaration(node)) return node.name.text;
  if (ts.isTypeAliasDeclaration(node)) return node.name.text;
  if (ts.isEnumDeclaration(node)) return node.name.text;
  if (ts.isModuleDeclaration(node)) return node.name.text;
  if (
    ts.isMethodDeclaration(node) ||
    ts.isMethodSignature(node) ||
    ts.isGetAccessorDeclaration(node) ||
    ts.isSetAccessorDeclaration(node)
  ) {
    return ts.isIdentifier(node.name) ? node.name.text : null;
  }
  if (ts.isPropertyDeclaration(node) || ts.isPropertySignature(node)) {
    return ts.isIdentifier(node.name) ? node.name.text : null;
  }
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
    return node.name.text;
  }
  return null;
}

function chainFor(node: ts.Node): { chain: string[]; symbolNode: ts.Node } | null {
  const chain: string[] = [];
  let symbolNode: ts.Node | null = null;
  let current: ts.Node | undefined = node;
  while (current && !ts.isSourceFile(current)) {
    const segment = namedSegment(current);
    if (segment) {
      if (!symbolNode) symbolNode = current;
      chain.unshift(segment);
    }
    current = current.parent;
  }
  return chain.length > 0 && symbolNode ? { chain, symbolNode } : null;
}

/** Match symbols.ts' body-free, whitespace-normalized signature text. */
function signatureOf(node: ts.Node, sourceFile: ts.SourceFile): string {
  const possibleBody = (node as ts.Node & { body?: ts.Node }).body;
  const end = possibleBody?.getStart(sourceFile) ?? node.end;
  return sourceFile.text
    .slice(node.getStart(sourceFile), end)
    // tree-sitter represents export/default/declare as wrappers around the
    // declaration node, while the TypeScript AST includes them as modifiers.
    .replace(/^(?:(?:export|default|declare)\s+)+/, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/;$/, "");
}

function hash8(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 8);
}

function namedNodes(sourceFile: ts.SourceFile): ts.Node[] {
  const nodes: ts.Node[] = [];
  const visit = (node: ts.Node): void => {
    if (namedSegment(node)) nodes.push(node);
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return nodes;
}

/**
 * Produce the same stable key the tree-sitter adapter mints.
 *
 * This mapping is deliberately kept independent of stored graph rows: compiler
 * declarations must map deterministically before an edge can be upgraded. Any
 * drift from `src/adapters/typescript/symbols.ts` makes the upgrade silently
 * miss, so collision groups reuse the adapter's signature-hash rules too.
 */
export function declarationToStableKey(
  declaration: ts.Declaration,
  context: CompilerContext,
): string | null {
  const sourceFile = declaration.getSourceFile();
  if (!context.inRepo(sourceFile.fileName)) return null;

  const mapped = chainFor(declaration);
  if (!mapped) return null;

  const relativePath = relative(context.root, sourceFile.fileName)
    .split(sep)
    .join("/");
  const base = stableKey(relativePath, mapped.chain);
  const group = namedNodes(sourceFile).filter((node) => {
    const candidate = chainFor(node);
    return candidate?.chain.join(".") === mapped.chain.join(".");
  });
  if (group.length === 1) return base;

  const hashOccurrences = new Map<string, number>();
  for (const node of group) {
    const signatureHash = hash8(signatureOf(node, sourceFile));
    const occurrence = (hashOccurrences.get(signatureHash) ?? 0) + 1;
    hashOccurrences.set(signatureHash, occurrence);
    if (node === mapped.symbolNode) {
      const collisionSuffix = occurrence === 1 ? "" : `~${occurrence}`;
      return `${base}~${signatureHash}${collisionSuffix}`;
    }
  }

  return null;
}
