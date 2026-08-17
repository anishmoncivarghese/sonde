import { createHash } from "node:crypto";
import { extname, join, relative, sep } from "node:path";
import type { RepoBoundary } from "./boundary.js";
import { buildIgnore } from "./ignore.js";

export interface FileRecord {
  path: string;
  contentHash: string;
  mtimeMs: number;
  size: number;
}

const DEFAULT_MAX_BYTES = 2_000_000;
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".mts", ".cts"]);

export function discover(
  boundary: RepoBoundary,
  options: { maxBytes?: number } = {},
): FileRecord[] {
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const ignore = buildIgnore(boundary);
  const files: FileRecord[] = [];

  const walk = (relativeDirectory: string): void => {
    for (const entry of boundary.readDirectory(relativeDirectory)) {
      const relativePath = relative(
        boundary.root,
        join(boundary.root, relativeDirectory, entry.name),
      )
        .split(sep)
        .join("/");
      if (ignore.ignores(relativePath)) {
        continue;
      }

      // spec SEC-002: discovery never follows symbolic links.
      if (entry.isSymbolicLink()) {
        continue;
      }
      if (entry.isDirectory()) {
        walk(relativePath);
        continue;
      }
      if (!entry.isFile() || !SOURCE_EXTENSIONS.has(extname(entry.name))) {
        continue;
      }

      const stat = boundary.stat(relativePath);
      if (stat.size > maxBytes) {
        continue;
      }
      const bytes = boundary.readFile(relativePath);
      files.push({
        path: relativePath,
        contentHash: createHash("sha256").update(bytes).digest("hex"),
        mtimeMs: stat.mtimeMs,
        size: stat.size,
      });
    }
  };

  walk(".");
  return files.sort((left, right) => left.path.localeCompare(right.path));
}
