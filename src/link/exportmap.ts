import type { ExtractResult } from "../adapters/types.js";
import type { TsConfig } from "../tsconfig/load.js";
import type { RepoBoundary } from "../repo/boundary.js";
import { resolveSpecifier, type Resolution } from "../tsconfig/resolve.js";

export type ExportMap = Map<string, Map<string, string>>; // file → (name → owning file)

type ResolveFn = (spec: string, from: string, cfg: TsConfig, b: RepoBoundary) => Resolution;

/**
 * Computes each module's export set. `export * from` makes this a fixpoint over
 * the module graph; barrels routinely form cycles, so iterate to stability with
 * a bounded pass count rather than recursing (spec §4.2).
 */
export function buildExportMap(
  files: Map<string, ExtractResult>,
  cfg: TsConfig,
  boundary: RepoBoundary,
  resolveFn: ResolveFn = resolveSpecifier,
): ExportMap {
  const map: ExportMap = new Map();
  for (const f of files.keys()) map.set(f, new Map());

  // Pass 1: local exports and named re-exports (direct targets only).
  for (const [file, res] of files) {
    const own = map.get(file)!;
    for (const e of res.exports) {
      if (e.isStar) continue;
      if (!e.reExportFrom) { own.set(e.exportedName, file); continue; }
      const t = resolveFn(e.reExportFrom, file, cfg, boundary);
      if (t.kind === "internal") own.set(e.exportedName, t.path);
    }
  }

  // Pass 2..N: propagate star re-exports until stable.
  const MAX_PASSES = 20;
  for (let pass = 0; pass < MAX_PASSES; pass++) {
    let changed = false;
    for (const [file, res] of files) {
      const own = map.get(file)!;
      for (const e of res.exports) {
        if (!e.isStar || !e.reExportFrom) continue;
        const t = resolveFn(e.reExportFrom, file, cfg, boundary);
        if (t.kind !== "internal") continue;
        const src = map.get(t.path);
        if (!src) continue;
        for (const [name, owner] of src) {
          if (name === "default") continue; // `export *` never re-exports default
          if (!own.has(name)) { own.set(name, owner); changed = true; }
        }
      }
    }
    if (!changed) break;
  }

  // Pass N+1: resolve named re-exports that pointed at a barrel.
  for (const [file, res] of files) {
    const own = map.get(file)!;
    for (const e of res.exports) {
      if (e.isStar || !e.reExportFrom) continue;
      const t = resolveFn(e.reExportFrom, file, cfg, boundary);
      if (t.kind !== "internal") continue;
      const owner = map.get(t.path)?.get(e.exportedName);
      if (owner) own.set(e.exportedName, owner);
    }
  }

  return map;
}
