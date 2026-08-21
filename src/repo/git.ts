import { execFileSync } from "node:child_process";
import type { RepoBoundary } from "./boundary.js";

export interface GitState {
  revision: string | null;
  /**
   * `null` means git could not tell us — not a repository, or git failed.
   *
   * Deliberately not `false`. Freshness consumes this, so reporting a clean
   * worktree when git was never consulted lets a stale index present itself as
   * current: invariant 8's "degrade with a warning, never fail silently", and
   * the same defect whyline hit when `blame_line` swallowed "git is broken" as
   * "no history". Consumers must surface unknown in `warnings[]` (spec §7.6),
   * and `strictNullChecks` stops them reading it as clean by accident.
   */
  dirty: boolean | null;
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
  // No revision means no repository, or a repository with no commits. Either
  // way dirtiness is unknowable, not false.
  if (revision === null) return { revision: null, dirty: null };

  const status = run(boundary, ["status", "--porcelain"]);
  // The dangerous branch: we know the revision, so the caller has every reason
  // to trust us, and `status` is exactly the call that failed. Previously this
  // read `(status ?? "").length > 0`, coalescing the failure to an empty string
  // and reporting a clean tree.
  if (status === null) return { revision, dirty: null };

  return { revision, dirty: status.length > 0 };
}

/**
 * Changed paths, or `null` when git could not tell us.
 *
 * `null` rather than `[]` for the same reason `dirty` is nullable: an empty
 * array asserts "nothing changed", so a caller deciding what to re-index on a
 * failed git read would skip every file and call the result current.
 */
export function changedFiles(
  boundary: RepoBoundary,
  against?: string,
): string[] | null {
  const args = against
    ? ["diff", "--name-only", "--relative", `${against}..HEAD`, "--", "."]
    : ["diff", "--name-only", "--relative", "HEAD", "--", "."];
  const output = run(boundary, args);
  if (output === null) return null;
  if (output.length === 0) return [];
  return output.split("\n");
}
