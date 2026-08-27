import type { RepoBoundary } from "../repo/boundary.js";
import type { TsConfig } from "../tsconfig/load.js";
import { resolveSpecifier, type Resolution } from "../tsconfig/resolve.js";
import { resolvePythonModule } from "./pythonModules.js";

/** Picks a specifier resolver by the importing file's language. */
export function resolveForFile(
  specifier: string,
  fromFile: string,
  cfg: TsConfig,
  boundary: RepoBoundary,
): Resolution {
  if (/\.pyi?$/.test(fromFile)) {
    return resolvePythonModule(specifier, fromFile, boundary);
  }
  return resolveSpecifier(specifier, fromFile, cfg, boundary);
}
