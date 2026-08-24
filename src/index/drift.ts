import { createHash } from "node:crypto";
import { adapterForPath } from "../adapters/registry.js";
import type { RepoBoundary } from "../repo/boundary.js";
import { discover } from "../repo/discover.js";
import type { Store } from "../store/index.js";

export const AUTO_REFRESH_LIMIT = 25;

export interface DriftReport {
  state: "fresh" | "refreshed" | "partial";
  driftCount: number;
  driftedPaths: string[];
}

/**
 * Scan metadata first and hash only indexed files whose mtime or size changed.
 * Every caller-supplied repository path stays behind RepoBoundary (spec §8.2,
 * SEC-001/002/003).
 */
export function checkDrift(
  boundary: RepoBoundary,
  store: Store,
  limit = AUTO_REFRESH_LIMIT,
): DriftReport {
  const known = new Map(store.allFiles().map((file) => [file.path, file]));
  const onDisk = discover(boundary, { hashContent: false }).filter((file) =>
    adapterForPath(file.path) !== null,
  );
  const diskByPath = new Map(onDisk.map((file) => [file.path, file]));
  const driftedPaths: string[] = [];

  for (const [path, indexed] of known) {
    const current = diskByPath.get(path);
    if (!current) {
      driftedPaths.push(path);
      continue;
    }
    if (
      current.size === indexed.size &&
      current.mtimeMs === indexed.mtimeMs
    ) {
      continue;
    }

    let contentHash: string;
    try {
      contentHash = createHash("sha256")
        .update(boundary.readFile(path))
        .digest("hex");
    } catch {
      // The file changed again or became unreadable after the metadata scan.
      driftedPaths.push(path);
      continue;
    }
    if (contentHash !== indexed.contentHash) driftedPaths.push(path);
  }

  // New indexable files count as drift without needing their content hash.
  for (const file of onDisk) {
    if (!known.has(file.path)) driftedPaths.push(file.path);
  }

  const driftCount = driftedPaths.length;
  const state = store.hasParseFailures() || driftCount > limit
    ? "partial"
    : driftCount === 0
      ? "fresh"
      : "refreshed";
  return { state, driftCount, driftedPaths };
}
