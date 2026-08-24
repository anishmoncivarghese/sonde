import {
  readFileSync,
  readdirSync,
  realpathSync,
  statSync,
  writeFileSync,
  type Dirent,
  type Stats,
} from "node:fs";
import { isAbsolute, resolve, sep } from "node:path";

export class PathEscapeError extends Error {
  constructor(path: string) {
    super(`path escapes repository root: ${path}`);
    this.name = "PathEscapeError";
  }
}

/** The canonical filesystem security boundary (spec SEC-001/002/003). */
export class RepoBoundary {
  readonly root: string;

  constructor(root: string) {
    this.root = realpathSync(resolve(root));
  }

  contains(path: string): boolean {
    const absolute = resolve(path);
    return absolute === this.root || absolute.startsWith(this.root + sep);
  }

  /** Resolve a repo-relative path to absolute, refusing anything outside the root. */
  resolve(relativePath: string): string {
    if (relativePath.includes("\0")) {
      throw new PathEscapeError(relativePath);
    }

    const absolute = isAbsolute(relativePath)
      ? resolve(relativePath)
      : resolve(this.root, relativePath);
    if (!this.contains(absolute)) {
      throw new PathEscapeError(relativePath);
    }

    // A link inside the root may point outside it, so canonicalize and re-check.
    let realPath: string;
    try {
      realPath = realpathSync(absolute);
    } catch {
      return absolute;
    }

    if (!this.contains(realPath)) {
      throw new PathEscapeError(relativePath);
    }
    return realPath;
  }

  readFile(relativePath: string): Buffer {
    const absolute = this.resolve(relativePath);
    if (!statSync(absolute).isFile()) {
      throw new PathEscapeError(relativePath);
    }
    return readFileSync(absolute);
  }

  writeFile(relativePath: string, content: string | Uint8Array): void {
    writeFileSync(this.resolve(relativePath), content);
  }

  readDirectory(relativePath: string): Dirent[] {
    return readdirSync(this.resolve(relativePath), { withFileTypes: true });
  }

  stat(relativePath: string): Stats {
    return statSync(this.resolve(relativePath));
  }
}
