import type { RepoBoundary } from "./boundary.js";

const ALWAYS_IGNORED = new Set([
  ".git",
  "node_modules",
  ".sonde",
  "dist",
  "build",
  "out",
  ".next",
  ".turbo",
  "coverage",
  "__pycache__",
  ".venv",
]);

interface Rule {
  re: RegExp;
  dirOnly: boolean;
  negated: boolean;
}

function escapeRegExp(character: string): string {
  return /[\\^$.*+?()[\]{}|]/.test(character) ? `\\${character}` : character;
}

function toRegExp(rawPattern: string): RegExp {
  const anchored = rawPattern.startsWith("/") || rawPattern.includes("/");
  const pattern = rawPattern.startsWith("/")
    ? rawPattern.slice(1)
    : rawPattern;
  let source = "";

  for (let index = 0; index < pattern.length; index += 1) {
    const character = pattern[index];
    if (character === "*" && pattern[index + 1] === "*") {
      if (pattern[index + 2] === "/") {
        source += "(?:.*/)?";
        index += 2;
      } else {
        source += ".*";
        index += 1;
      }
    } else if (character === "*") {
      source += "[^/]*";
    } else if (character === "?") {
      source += "[^/]";
    } else if (character !== undefined) {
      source += escapeRegExp(character);
    }
  }

  return new RegExp(anchored ? `^${source}$` : `(?:^|/)${source}$`);
}

export interface IgnoreMatcher {
  ignores(relativePath: string): boolean;
}

function readRules(boundary: RepoBoundary, path: string): string[] {
  try {
    return boundary.readFile(path).toString("utf8").split("\n");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

export function buildIgnore(boundary: RepoBoundary): IgnoreMatcher {
  const rules: Rule[] = [];
  for (const name of [".gitignore", ".sondeignore"]) {
    for (const raw of readRules(boundary, name)) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) {
        continue;
      }
      const negated = line.startsWith("!");
      const body = negated ? line.slice(1) : line;
      const dirOnly = body.endsWith("/");
      const pattern = dirOnly ? body.slice(0, -1) : body;
      rules.push({ re: toRegExp(pattern), dirOnly, negated });
    }
  }

  return {
    ignores(relativePath: string): boolean {
      if (
        relativePath
          .split("/")
          .some((segment) => ALWAYS_IGNORED.has(segment))
      ) {
        return true;
      }

      let ignored = false;
      for (const rule of rules) {
        const hit = rule.dirOnly
          ? relativePath
              .split("/")
              .some((_, index, parts) =>
                rule.re.test(parts.slice(0, index + 1).join("/")),
              )
          : rule.re.test(relativePath);
        if (hit) {
          ignored = !rule.negated;
        }
      }
      return ignored;
    },
  };
}
