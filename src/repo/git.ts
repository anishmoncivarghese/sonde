import { execFileSync } from "node:child_process";
import type { RepoBoundary } from "./boundary.js";

export interface GitState {
  revision: string | null;
  dirty: boolean;
}

function run(boundary: RepoBoundary, args: string[]): string | null {
  try {
    return execFileSync("git", args, {
      cwd: boundary.root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

/** Report repository identity without making git availability a hard dependency. */
export function gitState(boundary: RepoBoundary): GitState {
  const revision = run(boundary, ["rev-parse", "HEAD"]);
  if (revision === null) return { revision: null, dirty: false };

  const status = run(boundary, ["status", "--porcelain"]);
  return { revision, dirty: (status ?? "").length > 0 };
}

/** List committed changes from a revision, or current tracked worktree changes. */
export function changedFiles(
  boundary: RepoBoundary,
  against?: string,
): string[] {
  const args = against
    ? ["diff", "--name-only", `${against}..HEAD`]
    : ["diff", "--name-only", "HEAD"];
  const output = run(boundary, args);
  if (output === null || output.length === 0) return [];
  return output.split("\n");
}
