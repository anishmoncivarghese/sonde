import { describe, it, expect } from "vitest";
import { SCHEMA_VERSION, EXTRACTOR_VERSION } from "../src/version.js";

describe("scaffold", () => {
  it("exposes integer schema version", () => {
    expect(Number.isInteger(SCHEMA_VERSION)).toBe(true);
    expect(SCHEMA_VERSION).toBeGreaterThan(0);
  });
  it("exposes a semver-ish extractor version", () => {
    expect(EXTRACTOR_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
