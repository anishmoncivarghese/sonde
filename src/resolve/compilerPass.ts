import { existsSync, realpathSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import ts from "typescript";
import type { Store } from "../store/index.js";
import type { EdgeKind } from "../store/repos.js";
import { declarationToStableKey } from "./symbolMapping.js";

export const TSC_VERSION = ts.version;

export class CompilerUnavailable extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = "CompilerUnavailable";
  }
}

export interface CompilerContext {
  program: ts.Program;
  checker: ts.TypeChecker;
  root: string;
  inRepo(fileName: string): boolean;
}

/**
 * Build a Program for `root`, or return null.
 *
 * Never throws: a missing or malformed tsconfig, or a compiler that cannot
 * construct a Program, must degrade to the tree-sitter tiers with a warning
 * rather than failing an index that would otherwise succeed (invariant 8).
 *
 * SEC-008: `ts` here is the bundled compiler. The target repository's own
 * TypeScript is never loaded, so resolution may differ from the version the
 * repository pins. That skew is accepted and disclosed (spec §5.3).
 */
export function createCompilerContext(root: string): CompilerContext | null {
  try {
    const realRoot = realpathSync(root);
    const configPath = join(realRoot, "tsconfig.json");
    if (!existsSync(configPath)) return null;

    const raw = ts.readConfigFile(configPath, ts.sys.readFile);
    if (raw.error) return null;

    const parsed = ts.parseJsonConfigFileContent(raw.config, ts.sys, realRoot);
    if (parsed.errors.length > 0 || parsed.fileNames.length === 0) return null;

    const program = ts.createProgram(parsed.fileNames, parsed.options);
    const prefix = realRoot + sep;

    return {
      program,
      checker: program.getTypeChecker(),
      root: realRoot,
      inRepo(fileName: string): boolean {
        if (fileName.includes(`${sep}node_modules${sep}`)) return false;
        let canonicalFile: string;
        try {
          canonicalFile = realpathSync(fileName);
        } catch {
          canonicalFile = resolve(fileName);
        }
        return canonicalFile === realRoot || canonicalFile.startsWith(prefix);
      },
    };
  } catch {
    return null;
  }
}

export interface CompilerPassResult {
  upgraded: number;
  unresolvedCleared: number;
  identifiersSeen: number;
  identifiersResolved: number;
  tscVersion: string;
}

function isDeclarationName(node: ts.Identifier): boolean {
  if (
    ts.isPropertyAccessExpression(node.parent) ||
    ts.isQualifiedName(node.parent)
  ) {
    return false;
  }
  return ts.getNameOfDeclaration(node.parent as ts.Declaration) === node;
}

/** The enclosing named symbol of a reference, in adapter key form. */
function enclosingKey(
  node: ts.Node,
  context: CompilerContext,
): string | null {
  let current: ts.Node | undefined = node.parent;
  while (current && !ts.isSourceFile(current)) {
    const key = declarationToStableKey(
      current as ts.Declaration,
      context,
    );
    if (key) return key;
    current = current.parent;
  }
  return null;
}

function edgeKindFor(node: ts.Node): EdgeKind {
  const parent = node.parent;
  if (
    parent &&
    ts.isCallExpression(parent) &&
    parent.expression === node
  ) {
    return "CALLS";
  }
  if (
    parent &&
    ts.isPropertyAccessExpression(parent) &&
    parent.parent &&
    ts.isCallExpression(parent.parent) &&
    parent.parent.expression === parent
  ) {
    return "CALLS";
  }
  return "REFERENCES";
}

function resolvedSymbol(
  node: ts.Identifier,
  context: CompilerContext,
): ts.Symbol | undefined {
  const found = context.checker.getSymbolAtLocation(node);
  if (!found) return undefined;
  return (found.flags & ts.SymbolFlags.Alias) !== 0
    ? context.checker.getAliasedSymbol(found)
    : found;
}

/**
 * Upgrade edges the tree-sitter path could only guess at.
 *
 * Only ever raises a tier. A reference the checker cannot place is left exactly
 * as the deterministic path recorded it—never fabricated, never downgraded.
 * The write phase is transactional, so a checker or mapping failure cannot
 * leave a partially upgraded graph.
 *
 * The Program is discarded when this returns. Do not cache it: spec §8.4 keeps
 * inline refresh compiler-free so idle memory stays within PRD §17.1's budget.
 */
export function runCompilerPass(
  root: string,
  store: Store,
): CompilerPassResult | null {
  const context = createCompilerContext(root);
  if (!context) return null;

  try {
    return store.transaction(() => {
      const result: CompilerPassResult = {
        upgraded: 0,
        unresolvedCleared: 0,
        identifiersSeen: 0,
        identifiersResolved: 0,
        tscVersion: TSC_VERSION,
      };

      for (const sourceFile of context.program.getSourceFiles()) {
        if (!context.inRepo(sourceFile.fileName)) continue;
        if (sourceFile.fileName.endsWith(".d.ts")) continue;

        const visit = (node: ts.Node): void => {
          if (ts.isIdentifier(node) && !isDeclarationName(node)) {
            result.identifiersSeen += 1;
            const declaration = resolvedSymbol(node, context)?.declarations?.[0];
            if (declaration) {
              result.identifiersResolved += 1;
              const dstKey = declarationToStableKey(declaration, context);
              const srcKey = enclosingKey(node, context);
              if (dstKey && srcKey && dstKey !== srcKey) {
                const kind = edgeKindFor(node);
                const promoted = store.upgradeEdgeTier(
                  srcKey,
                  dstKey,
                  kind,
                );
                const inserted = promoted
                  ? false
                  : store.insertCompilerEdge(
                      srcKey,
                      dstKey,
                      kind,
                      sourceFile.getLineAndCharacterOfPosition(
                        node.getStart(sourceFile),
                      ).line + 1,
                    );
                if (promoted || inserted) {
                  result.upgraded += 1;
                  result.unresolvedCleared += store.deleteUnresolvedFor(
                    srcKey,
                    node.text,
                  );
                }
              }
            }
          }
          ts.forEachChild(node, visit);
        };
        visit(sourceFile);
      }

      return result;
    });
  } catch {
    return null;
  }
}
