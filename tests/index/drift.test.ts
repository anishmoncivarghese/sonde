import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkDrift } from "../../src/index/drift.js";
import { indexRepo, updateRepo } from "../../src/index/pipeline.js";
import { RepoBoundary } from "../../src/repo/boundary.js";
import { migrate, openDb, Store } from "../../src/store/index.js";

let root: string;
let dbPath: string;

beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), "cg-drift-"));
  dbPath = join(root, "index.sqlite");
  mkdirSync(join(root, "src"));
  writeFileSync(join(root, "tsconfig.json"), "{}");
  writeFileSync(join(root, "src", "a.ts"), "export function a() {}");
  await indexRepo(root, dbPath);
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

function withStore<T>(run: (store: Store) => T): T {
  const db = openDb(dbPath);
  try {
    migrate(db);
    return run(new Store(db));
  } finally {
    db.close();
  }
}

describe("checkDrift", () => {
  it("reports fresh when nothing changed without reading file contents", () => {
    const boundary = new RepoBoundary(root);
    const read = vi.spyOn(boundary, "readFile");
    const report = withStore((store) => checkDrift(boundary, store));
    expect(report).toEqual({
      state: "fresh",
      driftCount: 0,
      driftedPaths: [],
    });
    expect(
      read.mock.calls.some(([path]) => String(path).startsWith("src/")),
    ).toBe(false);
  });

  it("detects a modified file and hashes only that mismatch", () => {
    writeFileSync(
      join(root, "src", "a.ts"),
      "export function a() { return 1; }",
    );
    const boundary = new RepoBoundary(root);
    const read = vi.spyOn(boundary, "readFile");
    const report = withStore((store) => checkDrift(boundary, store));
    expect(report.driftCount).toBe(1);
    expect(report.driftedPaths).toContain("src/a.ts");
    expect(read).toHaveBeenCalledWith("src/a.ts");
    expect(
      read.mock.calls.filter(([path]) => String(path).startsWith("src/")),
    ).toHaveLength(1);
  });

  it("detects a new untracked file without hashing it", () => {
    writeFileSync(join(root, "src", "b.ts"), "export function b() {}");
    const boundary = new RepoBoundary(root);
    const read = vi.spyOn(boundary, "readFile");
    const report = withStore((store) => checkDrift(boundary, store));
    expect(report.driftedPaths).toContain("src/b.ts");
    expect(
      read.mock.calls.some(([path]) => String(path).startsWith("src/")),
    ).toBe(false);
  });

  it("ignores an mtime touch when content is identical", () => {
    const later = new Date(Date.now() + 10_000);
    utimesSync(join(root, "src", "a.ts"), later, later);
    expect(withStore((store) =>
      checkDrift(new RepoBoundary(root), store).state,
    )).toBe("fresh");
  });

  it("reports partial when drift exceeds the auto-refresh limit", () => {
    for (let index = 0; index < 5; index += 1) {
      writeFileSync(
        join(root, "src", `n${index}.ts`),
        `export const n${index} = ${index};`,
      );
    }
    const report = withStore((store) =>
      checkDrift(new RepoBoundary(root), store, 2),
    );
    expect(report.state).toBe("partial");
    expect(report.driftCount).toBe(5);
  });

  it("keeps freshness partial while an indexed file has parse failures", async () => {
    writeFileSync(join(root, "src", "a.ts"), "export function ( {{{ ");
    await updateRepo(root, dbPath);
    const report = withStore((store) =>
      checkDrift(new RepoBoundary(root), store),
    );
    expect(report.state).toBe("partial");
    expect(report.driftCount).toBe(0);
  });
});
