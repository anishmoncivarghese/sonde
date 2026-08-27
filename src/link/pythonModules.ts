import { PYTHON_STDLIB_MODULES } from "../adapters/python/stdlib.js";
import type { RepoBoundary } from "../repo/boundary.js";
import type { Resolution } from "../tsconfig/resolve.js";

function exists(boundary: RepoBoundary, relativePath: string): boolean {
  try {
    return boundary.stat(relativePath).isFile();
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "ENOTDIR") return false;
    throw error;
  }
}

/** A module path resolves to `x/y.py` or to the package's `x/y/__init__.py`. */
function moduleFile(boundary: RepoBoundary, base: string): string | null {
  const asModule = `${base}.py`;
  if (exists(boundary, asModule)) return asModule;
  const asPackage = `${base}/__init__.py`;
  if (exists(boundary, asPackage)) return asPackage;
  return null;
}

/**
 * spec §5.2: the import root is derived, not configured.
 *
 * Walk up from the file's directory while each level holds `__init__.py`; the
 * first directory that does not is the root. This makes `src/` layout work
 * with no pyproject.toml parsing, no sys.path emulation, and no execution of
 * repository code (invariant 5).
 */
function importRoot(boundary: RepoBoundary, fromFile: string): string {
  const parts = fromFile.split("/").slice(0, -1);
  while (
    parts.length > 0 &&
    exists(boundary, [...parts, "__init__.py"].join("/"))
  ) {
    parts.pop();
  }
  return parts.join("/");
}

function join(...segments: string[]): string {
  return segments.filter((segment) => segment.length > 0).join("/");
}

export function resolvePythonModule(
  specifier: string,
  fromFile: string,
  boundary: RepoBoundary,
): Resolution {
  const dots = /^\.+/.exec(specifier)?.[0].length ?? 0;

  if (dots > 0) {
    const rest = specifier.slice(dots);
    let directory = fromFile.split("/").slice(0, -1);
    // One dot is the current package; each extra dot climbs one level.
    for (let index = 1; index < dots; index += 1) {
      directory = directory.slice(0, -1);
    }
    const base =
      rest.length === 0
        ? join(directory.join("/"), "__init__")
        : join(directory.join("/"), rest.split(".").join("/"));
    const hit =
      rest.length === 0
        ? exists(boundary, `${base}.py`)
          ? `${base}.py`
          : null
        : moduleFile(boundary, base);
    return hit
      ? { kind: "internal", path: hit }
      : { kind: "external", pkg: specifier };
  }

  const segments = specifier.split(".");
  const top = segments[0] ?? specifier;

  for (const root of [importRoot(boundary, fromFile), ""]) {
    const hit = moduleFile(boundary, join(root, segments.join("/")));
    if (hit) return { kind: "internal", path: hit };
  }

  // spec §5.4: stdlib and third-party imports are EXTERNAL, never UNRESOLVED,
  // so the unresolved count stays a meaningful in-repository completeness signal.
  return {
    kind: "external",
    pkg: PYTHON_STDLIB_MODULES.has(top) ? top : top,
  };
}
