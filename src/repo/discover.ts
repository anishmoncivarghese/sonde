import { createHash } from "node:crypto";
import { extname, join, relative, sep } from "node:path";
import type { RepoBoundary } from "./boundary.js";
import { buildIgnore } from "./ignore.js";

export interface FileMetadata {
  path: string;
  mtimeMs: number;
  size: number;
}

export interface FileRecord extends FileMetadata {
  contentHash: string;
}

export interface DiscoverOptions {
  maxBytes?: number;
  /** Overrides the default allowlist for pre-registration language probes. */
  extensions?: ReadonlySet<string>;
}

const DEFAULT_MAX_BYTES = 2_000_000;
const SOURCE_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".mts",
  ".cts",
  ".swift",
  ".py",
  ".pyi",
]);

export function discover(
  boundary: RepoBoundary,
  options: DiscoverOptions & { hashContent: false },
): FileMetadata[];
export function discover(
  boundary: RepoBoundary,
  options?: DiscoverOptions & { hashContent?: true },
): FileRecord[];
export function discover(
  boundary: RepoBoundary,
  options: DiscoverOptions & { hashContent?: boolean } = {},
): Array<FileRecord | FileMetadata> {
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const hashContent = options.hashContent ?? true;
  const extensions = options.extensions ?? SOURCE_EXTENSIONS;
  const ignore = buildIgnore(boundary);
  const files: Array<FileRecord | FileMetadata> = [];

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
      if (!entry.isFile() || !extensions.has(extname(entry.name))) {
        continue;
      }

      const stat = boundary.stat(relativePath);
      if (stat.size > maxBytes) {
        continue;
      }
      const metadata: FileMetadata = {
        path: relativePath,
        mtimeMs: stat.mtimeMs,
        size: stat.size,
      };
      files.push(hashContent
        ? {
            ...metadata,
            contentHash: createHash("sha256")
              .update(boundary.readFile(relativePath))
              .digest("hex"),
          }
        : metadata);
    }
  };

  walk(".");
  return files.sort((left, right) => left.path.localeCompare(right.path));
}
