import { createHash } from "node:crypto";
import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { RepoBoundary } from "../repo/boundary.js";

/** Indexes are disposable cache data keyed by canonical root (spec §3). */
export function indexPathFor(root: string): string {
  const boundary = new RepoBoundary(root);
  const hash = createHash("sha256")
    .update(boundary.root)
    .digest("hex")
    .slice(0, 16);
  const directory = join(homedir(), ".cache", "codegraph", hash);
  mkdirSync(directory, { recursive: true });
  return join(directory, "index.sqlite");
}
