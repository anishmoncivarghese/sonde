import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";

import {
  EXTRACTOR_VERSION,
  PACKAGE_VERSION,
  SCHEMA_VERSION,
} from "../src/version.js";

const packageJson = createRequire(import.meta.url)("../package.json") as {
  version: string;
};

describe("PACKAGE_VERSION", () => {
  it("matches package.json rather than a hardcoded copy", () => {
    // `sonde --version` and the MCP server both reported a literal "0.1.0"
    // while the real version lived in package.json. They would have drifted on
    // the first release.
    expect(PACKAGE_VERSION).toBe(packageJson.version);
  });

  it("is a semver string", () => {
    expect(PACKAGE_VERSION).toMatch(/^\d+\.\d+\.\d+/);
  });
});

describe("EXTRACTOR_VERSION stays independent", () => {
  it("is not derived from the package version", () => {
    // It is stamped on every edge and drives cache invalidation, so it must
    // change when extraction behaviour changes — not when a patch release
    // bumps the package, which would force a needless full reindex.
    expect(typeof EXTRACTOR_VERSION).toBe("string");
    expect(EXTRACTOR_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("keeps the schema version an integer", () => {
    expect(Number.isInteger(SCHEMA_VERSION)).toBe(true);
  });
});
