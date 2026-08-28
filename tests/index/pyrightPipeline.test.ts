import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { migrate, openDb, Store } from "../../src/store/index.js";

const pyright = vi.hoisted(() => ({ run: vi.fn() }));
vi.mock("../../src/resolve/pyrightPass.js", () => ({
  runPyrightPass: pyright.run,
}));

import { indexRepo } from "../../src/index/pipeline.js";

function pythonRepo(): string {
  const root = mkdtempSync(join(tmpdir(), "sonde-pyidx-"));
  writeFileSync(join(root, "main.py"), "def run():\n    return len([])\n");
  return root;
}

beforeEach(() => {
  pyright.run.mockReset();
  pyright.run.mockResolvedValue(null);
});

describe("pyright pass wiring", () => {
  it("runs the Python pass when resolution is requested", async () => {
    const root = pythonRepo();
    const stats = await indexRepo(root, join(root, "index.sqlite"), {
      resolve: true,
    });

    expect(pyright.run).toHaveBeenCalledOnce();
    // Registration remains gated on Task 6, so production discovery still
    // indexes zero Python files at this point.
    expect(stats.filesIndexed).toBe(0);
  });

  it("combines promotions and stores pyright provenance separately", async () => {
    pyright.run.mockResolvedValue({
      upgraded: 2,
      externalized: 1,
      unresolvedCleared: 1,
      extraUnresolvedCleared: 0,
      queries: 3,
      answered: 3,
      skippedNullSites: 0,
      unmatchedSites: 0,
      pyrightVersion: "1.1.413",
      warnings: ["one stored site did not match extraction"],
    });
    const root = pythonRepo();
    const dbPath = join(root, "index.sqlite");
    const stats = await indexRepo(root, dbPath, { resolve: true });

    expect(stats.compilerUpgraded).toBe(2);
    expect(stats.warnings).toEqual([
      "one stored site did not match extraction",
    ]);
    const db = openDb(dbPath);
    migrate(db);
    const store = new Store(db);
    expect(store.compilerVersion()).toBeNull();
    expect(store.pyrightVersion()).toBe("1.1.413");
    db.close();
  });

  it("surfaces unavailability without inventing a promotion", async () => {
    pyright.run.mockResolvedValue({
      unavailable: true,
      reason: "pyright session timed out",
      queries: 7,
      answered: 0,
    });
    const root = pythonRepo();
    const stats = await indexRepo(root, join(root, "index.sqlite"), {
      resolve: true,
    });

    expect(stats.compilerUpgraded).toBeNull();
    expect(stats.warnings).toContain(
      "pyright COMPILER tier unavailable: pyright session timed out",
    );
  });
});
