import { createRequire } from "node:module";

/**
 * The published package version, read from package.json so there is one source
 * of truth. `sonde --version` and the MCP server handshake both previously
 * carried a hardcoded copy, which would have drifted on the first release.
 *
 * The relative path holds in both layouts: `src/version.ts` and the compiled
 * `dist/version.js` are each one directory below the package root.
 */
const packageJson = createRequire(import.meta.url)("../package.json") as {
  version: string;
};

export const PACKAGE_VERSION: string = packageJson.version;

/** Bumped when the stored schema changes; a mismatch refuses the index. */
export const SCHEMA_VERSION = 3;

/**
 * Deliberately NOT the package version.
 *
 * This is stamped on every edge and participates in cache invalidation, so it
 * must change when extraction behaviour changes. Tying it to the package
 * version would force a full reindex on every patch release, which is a cost
 * with no correctness benefit.
 */
export const EXTRACTOR_VERSION = "0.1.0";
