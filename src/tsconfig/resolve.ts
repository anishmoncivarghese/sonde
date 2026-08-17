import { dirname, join, relative, resolve, sep } from "node:path";
import type { Stats } from "node:fs";
import type { RepoBoundary } from "../repo/boundary.js";
import type { TsConfig } from "./load.js";

export type Resolution =
  | { kind: "internal"; path: string }
  | { kind: "external"; pkg: string };

const EXTENSIONS = [
  ".ts",
  ".tsx",
  ".d.ts",
  ".mts",
  ".cts",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
];

function statOptional(boundary: RepoBoundary, path: string): Stats | null {
  try {
    return boundary.stat(path);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "ENOTDIR") return null;
    throw error;
  }
}

function probe(boundary: RepoBoundary, path: string): string | null {
  const exact = statOptional(boundary, path);
  if (exact?.isFile()) return boundary.resolve(path);

  for (const extension of EXTENSIONS) {
    const candidate = `${path}${extension}`;
    if (statOptional(boundary, candidate)?.isFile()) {
      return boundary.resolve(candidate);
    }
  }

  if (exact?.isDirectory()) {
    for (const extension of EXTENSIONS) {
      const candidate = join(path, `index${extension}`);
      if (statOptional(boundary, candidate)?.isFile()) {
        return boundary.resolve(candidate);
      }
    }
  }
  return null;
}

function mappedCandidates(specifier: string, moduleResolution: string): string[] {
  if (
    /\.(js|mjs|cjs)$/.test(specifier) &&
    moduleResolution !== "node" &&
    moduleResolution !== "classic"
  ) {
    return [specifier.replace(/\.(js|mjs|cjs)$/, ""), specifier];
  }
  return [specifier];
}

function escapeRegExp(value: string): string {
  return value.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&");
}

function aliasMatch(pattern: string, specifier: string): string | null {
  const expression = new RegExp(
    `^${pattern.split("*").map(escapeRegExp).join("(.*)")}$`,
  );
  const match = expression.exec(specifier);
  return match ? (match[1] ?? "") : null;
}

function packageParts(specifier: string): {
  packageName: string;
  exportKey: string;
} {
  const parts = specifier.split("/");
  const packageName = specifier.startsWith("@")
    ? parts.slice(0, 2).join("/")
    : (parts[0] ?? specifier);
  const rest = parts.slice(packageName.split("/").length).join("/");
  return { packageName, exportKey: rest ? `./${rest}` : "." };
}

function selectExport(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    for (const candidate of value) {
      const selected = selectExport(candidate);
      if (selected) return selected;
    }
  } else if (typeof value === "object" && value !== null) {
    const conditions = value as Record<string, unknown>;
    for (const key of ["types", "import", "default", "node"]) {
      const selected = selectExport(conditions[key]);
      if (selected) return selected;
    }
  }
  return null;
}

function packageExportTarget(
  exportsValue: unknown,
  exportKey: string,
): string | null {
  if (typeof exportsValue === "string") {
    return exportKey === "." ? exportsValue : null;
  }
  if (typeof exportsValue !== "object" || exportsValue === null) return null;

  const exportsMap = exportsValue as Record<string, unknown>;
  if (
    exportKey === "." &&
    !Object.keys(exportsMap).some((key) => key.startsWith("."))
  ) {
    return selectExport(exportsMap);
  }
  const exact = selectExport(exportsMap[exportKey]);
  if (exact) return exact;

  for (const [pattern, value] of Object.entries(exportsMap)) {
    const wildcard = aliasMatch(pattern, exportKey);
    if (wildcard === null) continue;
    const selected = selectExport(value);
    if (selected) return selected.replace(/\*/g, wildcard);
  }
  return null;
}

function workspaceExport(
  specifier: string,
  config: TsConfig,
  boundary: RepoBoundary,
): string | null {
  const { packageName, exportKey } = packageParts(specifier);
  const lexicalPackageJson = join(
    boundary.root,
    "node_modules",
    packageName,
    "package.json",
  );

  let packageJsonPath: string;
  let packageJson: Record<string, unknown>;
  try {
    packageJsonPath = boundary.resolve(lexicalPackageJson);
    packageJson = JSON.parse(
      boundary.readFile(lexicalPackageJson).toString("utf8"),
    ) as Record<string, unknown>;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "ENOTDIR") return null;
    throw error;
  }

  const packageRelative = relative(boundary.root, packageJsonPath)
    .split(sep)
    .join("/");
  if (packageRelative.startsWith("node_modules/")) return null;

  let target = packageExportTarget(packageJson.exports, exportKey);
  if (!target && exportKey === ".") {
    target =
      (typeof packageJson.types === "string" ? packageJson.types : null) ??
      (typeof packageJson.module === "string" ? packageJson.module : null) ??
      (typeof packageJson.main === "string" ? packageJson.main : null);
  }
  if (!target || !target.startsWith("./")) return null;

  const packageRoot = dirname(packageJsonPath);
  for (const candidate of mappedCandidates(target, config.moduleResolution)) {
    const hit = probe(boundary, resolve(packageRoot, candidate));
    if (hit) return hit;
  }
  return null;
}

export function resolveSpecifier(
  specifier: string,
  fromFile: string,
  config: TsConfig,
  boundary: RepoBoundary,
): Resolution {
  const toInternal = (absolute: string): Resolution => ({
    kind: "internal",
    path: relative(boundary.root, boundary.resolve(absolute))
      .split(sep)
      .join("/"),
  });

  const candidates = mappedCandidates(specifier, config.moduleResolution);
  for (const candidate of candidates) {
    if (candidate.startsWith(".")) {
      const sourcePath = boundary.resolve(fromFile);
      const hit = probe(boundary, resolve(dirname(sourcePath), candidate));
      if (hit) return toInternal(hit);
      continue;
    }

    for (const [pattern, targets] of Object.entries(config.paths)) {
      const wildcard = aliasMatch(pattern, candidate);
      if (wildcard === null) continue;
      for (const target of targets) {
        const substituted = target.replace(/\*/g, wildcard);
        const hit = probe(
          boundary,
          resolve(config.baseUrl ?? boundary.root, substituted),
        );
        if (hit) return toInternal(hit);
      }
    }

    if (config.baseUrl) {
      const hit = probe(boundary, resolve(config.baseUrl, candidate));
      if (hit) return toInternal(hit);
    }
  }

  if (!specifier.startsWith(".")) {
    const hit = workspaceExport(specifier, config, boundary);
    if (hit) return toInternal(hit);
  }

  const { packageName } = packageParts(specifier);
  return {
    kind: "external",
    pkg: specifier.startsWith(".") ? specifier : packageName,
  };
}
