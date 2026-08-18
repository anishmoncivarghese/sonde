import ts from "typescript";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { createProgram } from "./program.js";
import { enclosingSymbolName } from "./ancestry.js";

export interface OracleEdge {
  srcFile: string;
  srcSymbol: string;
  dstFile: string;
  dstSymbol: string;
  kind: "CALLS" | "REFERENCES" | "INHERITS" | "IMPLEMENTS";
}

function isDeclarationName(node: ts.Identifier): boolean {
  // TypeScript exposes getNameOfDeclaration publicly, but not the companion
  // isDeclarationName helper used inside the compiler.
  return ts.getNameOfDeclaration(node.parent as ts.Declaration) === node;
}

export function buildOracle(fixtureRoot: string): OracleEdge[] {
  const root = resolve(fixtureRoot);
  const program = createProgram(root);
  const checker = program.getTypeChecker();
  const out: OracleEdge[] = [];
  const rel = (f: string) => relative(root, f).split(sep).join("/");

  const inRepo = (f: string): boolean => {
    const path = relative(root, f);
    return path !== ".." && !path.startsWith(`..${sep}`) && !isAbsolute(path) && !f.endsWith(".d.ts");
  };

  for (const sf of program.getSourceFiles()) {
    if (!inRepo(sf.fileName)) continue;

    const record = (node: ts.Node, target: ts.Node, kind: OracleEdge["kind"]): void => {
      const found = checker.getSymbolAtLocation(target);
      const sym = found && (found.flags & ts.SymbolFlags.Alias) !== 0
        ? checker.getAliasedSymbol(found)
        : found;
      const decl = sym?.declarations?.[0];
      if (!decl) return;
      const dstFile = decl.getSourceFile().fileName;
      if (!inRepo(dstFile)) return;

      const srcSymbol = enclosingSymbolName(node) ?? "<module>";
      const dstSymbol = enclosingSymbolName(decl);
      if (!dstSymbol) return;

      out.push({ srcFile: rel(sf.fileName), srcSymbol, dstFile: rel(dstFile), dstSymbol, kind });
    };

    const visit = (node: ts.Node): void => {
      if (ts.isCallExpression(node)) {
        const target = ts.isPropertyAccessExpression(node.expression)
          ? node.expression.name
          : node.expression;
        record(node, target, "CALLS");
      } else if (ts.isHeritageClause(node)) {
        const kind = node.token === ts.SyntaxKind.ExtendsKeyword ? "INHERITS" : "IMPLEMENTS";
        for (const t of node.types) record(node, t.expression, kind);
      } else if (ts.isIdentifier(node) && !isDeclarationName(node)) {
        record(node, node, "REFERENCES");
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }

  // Dedupe: CodeGraph stores symbol-to-symbol pairs, not identifier positions.
  const key = (e: OracleEdge) =>
    `${e.srcFile}|${e.srcSymbol}|${e.dstFile}|${e.dstSymbol}|${e.kind}`;
  return [...new Map(out.map(e => [key(e), e])).values()];
}
