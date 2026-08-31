import { describe, expect, it } from "vitest";
import { unsupportedNodeMessage } from "../../src/cli/nodeVersion.js";

describe("unsupportedNodeMessage", () => {
  // better-sqlite3 requires Node 22. On Node 20 it does not fail to import --
  // it segfaults when the database is used, killing the process with exit 139
  // and no output at all. npm downgrades EBADENGINE to a warning and exits 0,
  // and `sonde --version` still works, so both signals a user would check say
  // the install succeeded. This is the silent-failure case invariant 8 exists
  // to prevent, in the first command a new user runs.

  it("rejects Node 20", () => {
    const message = unsupportedNodeMessage("20.20.2");
    expect(message).toContain("22");
    expect(message).toContain("20.20.2");
  });

  it("rejects Node 21", () => {
    expect(unsupportedNodeMessage("21.7.3")).not.toBeNull();
  });

  it("accepts Node 22", () => {
    expect(unsupportedNodeMessage("22.23.2")).toBeNull();
  });

  it("accepts Node 24", () => {
    expect(unsupportedNodeMessage("24.15.0")).toBeNull();
  });

  it("accepts a version it cannot parse rather than blocking a working install", () => {
    // A guard that misfires is worse than no guard: it would stop a user whose
    // Node is fine. Refusing only on a version we positively read as too old
    // keeps the failure mode one-directional.
    expect(unsupportedNodeMessage("weird")).toBeNull();
    expect(unsupportedNodeMessage("")).toBeNull();
  });

  it("names the cause and the fix, not just the requirement", () => {
    const message = unsupportedNodeMessage("20.20.2");
    expect(message).toMatch(/better-sqlite3/);
    expect(message).toMatch(/nvm|upgrade/i);
  });
});
