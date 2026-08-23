import type { ImportRecord } from "../adapters/types.js";
import type { TsConfig } from "../tsconfig/load.js";
import type { RepoBoundary } from "../repo/boundary.js";
import { resolveSpecifier } from "../tsconfig/resolve.js";
import type { ExportMap } from "./exportmap.js";

export type Binding =
  | { file: string; name: string }
  | { external: string; name: string }
  | {
      unresolved: "unexported_import";
      targetFile: string;
      targetName: string;
    };

/** localName → where it actually comes from. */
export function bindImports(
  file: string, imports: ImportRecord[], exportMap: ExportMap,
  cfg: TsConfig, boundary: RepoBoundary,
): Map<string, Binding> {
  const out = new Map<string, Binding>();
  for (const imp of imports) {
    const t = resolveSpecifier(imp.specifier, file, cfg, boundary);
    if (t.kind === "external") {
      out.set(imp.localName, { external: t.pkg, name: imp.importedName });
      continue;
    }
    if (imp.importedName === "*") { out.set(imp.localName, { file: t.path, name: "*" }); continue; }
    const owner = exportMap.get(t.path)?.get(imp.importedName);
    out.set(
      imp.localName,
      owner
        ? { file: owner, name: imp.importedName }
        : {
            unresolved: "unexported_import",
            targetFile: t.path,
            targetName: imp.importedName,
          },
    );
  }
  return out;
}
