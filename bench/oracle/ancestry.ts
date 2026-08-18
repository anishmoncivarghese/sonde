import ts from "typescript";

/**
 * Enclosing named symbol for a node, derived from tsc's OWN AST.
 * Deliberately does not import anything from src/ — see Task 11 rule 1.
 */
export function enclosingSymbolName(node: ts.Node): string | null {
  const chain: string[] = [];
  let n: ts.Node | undefined = node;
  while (n) {
    if (ts.isFunctionDeclaration(n) && n.name) chain.unshift(n.name.text);
    else if (ts.isClassDeclaration(n) && n.name) chain.unshift(n.name.text);
    else if (ts.isInterfaceDeclaration(n)) chain.unshift(n.name.text);
    else if (ts.isMethodDeclaration(n) && ts.isIdentifier(n.name)) chain.unshift(n.name.text);
    else if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name)) {
      const init = n.initializer;
      if (init && (ts.isArrowFunction(init) || ts.isFunctionExpression(init))) {
        chain.unshift(n.name.text);
      }
    }
    n = n.parent;
  }
  return chain.length ? chain.join(".") : null;
}
