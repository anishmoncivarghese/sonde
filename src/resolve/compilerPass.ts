import { existsSync, realpathSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import ts from "typescript";

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
