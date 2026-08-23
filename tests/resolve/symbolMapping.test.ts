import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ts from "typescript";
import { getTsParser } from "../../src/adapters/typescript/parser.js";
import { extractSymbols } from "../../src/adapters/typescript/symbols.js";
import { createCompilerContext } from "../../src/resolve/compilerPass.js";
import { declarationToStableKey } from "../../src/resolve/symbolMapping.js";

function contextFor(source: string) {
  const root = mkdtempSync(join(tmpdir(), "cg-map-"));
  mkdirSync(join(root, "src"));
  writeFileSync(join(root, "src", "a.ts"), source);
  writeFileSync(
    join(root, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        strict: true,
        module: "esnext",
        target: "es2022",
        moduleResolution: "bundler",
      },
      include: ["src"],
    }),
  );
  return createCompilerContext(root)!;
}

function firstDeclarationNamed(
  context: ReturnType<typeof contextFor>,
  name: string,
): ts.Declaration {
  for (const sourceFile of context.program.getSourceFiles()) {
    if (!context.inRepo(sourceFile.fileName)) continue;
    let found: ts.Declaration | undefined;
    const visit = (node: ts.Node): void => {
      if (found) return;
      const named = node as ts.NamedDeclaration;
      if (named.name && ts.isIdentifier(named.name) && named.name.text === name) {
        found = node as ts.Declaration;
        return;
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
    if (found) return found;
  }
  throw new Error(`no declaration named ${name}`);
}

describe("declarationToStableKey", () => {
  it("keys a top-level function exactly as the adapter does", () => {
    const context = contextFor("export function refresh(): void {}");
    const key = declarationToStableKey(
      firstDeclarationNamed(context, "refresh"),
      context,
    );
    expect(key).toBe("ts:src/a.ts#refresh");
  });

  it("scopes a method under its class", () => {
    const context = contextFor("export class Auth { refresh(): void {} }");
    const key = declarationToStableKey(
      firstDeclarationNamed(context, "refresh"),
      context,
    );
    expect(key).toBe("ts:src/a.ts#Auth.refresh");
  });

  it("keys an arrow bound to a name as a function, matching the adapter", () => {
    const context = contextFor("export const handler = () => {};");
    const key = declarationToStableKey(
      firstDeclarationNamed(context, "handler"),
      context,
    );
    expect(key).toBe("ts:src/a.ts#handler");
  });

  it("attributes a declaration inside an anonymous callback to the nearest named symbol", () => {
    // spec §6.2: anonymous callbacks are never minted as symbols, so a key must
    // never contain a positional segment.
    const context = contextFor(
      "export function outer() { [1].map(() => { function inner() {} return inner; }); }",
    );
    const key = declarationToStableKey(
      firstDeclarationNamed(context, "inner"),
      context,
    );
    expect(key).toBe("ts:src/a.ts#outer.inner");
  });

  it("returns null for a declaration outside the repository", () => {
    const context = contextFor("export const x: string = '';");
    const lib = context.program
      .getSourceFiles()
      .find((file) => !context.inRepo(file.fileName));
    expect(lib).toBeDefined();
    let declaration: ts.Declaration | undefined;
    const visit = (node: ts.Node): void => {
      if (!declaration && ts.isInterfaceDeclaration(node)) declaration = node;
      else ts.forEachChild(node, visit);
    };
    visit(lib!);
    expect(declarationToStableKey(declaration!, context)).toBeNull();
  });

  it("matches the adapter's collision-hashed keys for overloads", async () => {
    const source = [
      "export function parse(x: string): string;",
      "export function parse(x: number): number;",
      "export function parse(x: string | number) { return x; }",
    ].join("\n");
    const context = contextFor(source);
    const sourceFile = context.program
      .getSourceFiles()
      .find((file) => context.inRepo(file.fileName))!;
    const declarations = sourceFile.statements.filter(ts.isFunctionDeclaration);
    const mapped = declarations.map((declaration) =>
      declarationToStableKey(declaration, context),
    );

    const parser = await getTsParser();
    const adapterKeys = extractSymbols(
      "src/a.ts",
      source,
      parser.parse(source)!,
    ).map((symbol) => symbol.stableKey);

    expect(mapped).toEqual(adapterKeys);
  });
});
