import ts from "typescript";
import { join } from "node:path";

export function createProgram(fixtureRoot: string): ts.Program {
  const configPath = join(fixtureRoot, "tsconfig.json");
  const raw = ts.readConfigFile(configPath, ts.sys.readFile);
  const parsed = ts.parseJsonConfigFileContent(raw.config, ts.sys, fixtureRoot);
  return ts.createProgram(parsed.fileNames, parsed.options);
}
