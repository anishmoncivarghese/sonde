import { dirname, extname, join, resolve } from "node:path";
import ts from "typescript";
import type { RepoBoundary } from "../repo/boundary.js";

export interface TsConfig {
  baseUrl: string | null;
  paths: Record<string, string[]>;
  moduleResolution: string;
}

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readOptional(boundary: RepoBoundary, path: string): string | null {
  try {
    return boundary.readFile(path).toString("utf8");
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "ENOTDIR") return null;
    throw error;
  }
}

function parseJsonc(path: string, text: string): JsonObject {
  const parsed = ts.parseConfigFileTextToJson(path, text);
  if (parsed.error) {
    throw new Error(
      `invalid tsconfig ${path}: ${ts.flattenDiagnosticMessageText(parsed.error.messageText, "\n")}`,
    );
  }
  return isObject(parsed.config) ? parsed.config : {};
}

function packageParts(specifier: string): { name: string; subpath: string } {
  const parts = specifier.split("/");
  const name = specifier.startsWith("@")
    ? parts.slice(0, 2).join("/")
    : (parts[0] ?? specifier);
  return { name, subpath: parts.slice(name.split("/").length).join("/") };
}

function withJsonExtension(path: string): string {
  return extname(path) ? path : `${path}.json`;
}

function resolveExtends(
  value: string,
  configPath: string,
  boundary: RepoBoundary,
): string {
  if (value.startsWith(".") || value.startsWith("/")) {
    return withJsonExtension(resolve(dirname(configPath), value));
  }

  const { name, subpath } = packageParts(value);
  const packageRoot = join(boundary.root, "node_modules", name);
  if (subpath) return withJsonExtension(join(packageRoot, subpath));

  const packageJsonText = readOptional(
    boundary,
    join(packageRoot, "package.json"),
  );
  if (packageJsonText) {
    const packageJson = JSON.parse(packageJsonText) as JsonObject;
    if (typeof packageJson.tsconfig === "string") {
      return join(packageRoot, packageJson.tsconfig);
    }
  }
  return join(packageRoot, "tsconfig.json");
}

export function loadTsConfig(boundary: RepoBoundary): TsConfig {
  const merged: TsConfig = {
    baseUrl: null,
    paths: {},
    moduleResolution: "node",
  };
  const seen = new Set<string>();

  const load = (path: string): void => {
    // resolve() enforces containment even when the candidate does not exist.
    const containedPath = boundary.resolve(path);
    if (seen.has(containedPath)) return;
    seen.add(containedPath);

    const text = readOptional(boundary, containedPath);
    if (text === null) return;
    const config = parseJsonc(containedPath, text);

    const inherited = Array.isArray(config.extends)
      ? config.extends
      : [config.extends];
    for (const value of inherited) {
      if (typeof value === "string") {
        load(resolveExtends(value, containedPath, boundary));
      }
    }

    const compilerOptions = isObject(config.compilerOptions)
      ? config.compilerOptions
      : {};
    if (typeof compilerOptions.baseUrl === "string") {
      merged.baseUrl = boundary.resolve(
        resolve(dirname(containedPath), compilerOptions.baseUrl),
      );
    }
    if (isObject(compilerOptions.paths)) {
      for (const [pattern, targets] of Object.entries(compilerOptions.paths)) {
        if (
          Array.isArray(targets) &&
          targets.every((target) => typeof target === "string")
        ) {
          merged.paths[pattern] = targets;
        }
      }
    }
    if (
      typeof compilerOptions.moduleResolution === "string" ||
      typeof compilerOptions.moduleResolution === "number"
    ) {
      merged.moduleResolution = String(
        compilerOptions.moduleResolution,
      ).toLowerCase();
    }
  };

  load(join(boundary.root, "tsconfig.json"));
  return merged;
}
