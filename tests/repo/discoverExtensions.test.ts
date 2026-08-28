import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { RepoBoundary } from "../../src/repo/boundary.js";
import { discover } from "../../src/repo/discover.js";

function repo(): RepoBoundary {
  const root = mkdtempSync(join(tmpdir(), "sonde-disc-"));
  writeFileSync(join(root, "a.ts"), "export const a = 1;\n");
  writeFileSync(join(root, "b.py"), "def b():\n    pass\n");
  return new RepoBoundary(root);
}

describe("discover extension filtering", () => {
  it("discovers Python files by default now that the adapter ships", () => {
    // Registration in registry.ts alone is a silent no-op: the registry
    // decides which adapter handles a file, discovery decides whether the
    // file is ever offered to one.
    const found = discover(repo(), { hashContent: false }).map(
      (file) => file.path,
    );
    expect(found).toContain("a.ts");
    expect(found).toContain("b.py");
  });

  it("honours an explicit extension override", () => {
    const found = discover(repo(), {
      hashContent: false,
      extensions: new Set([".py"]),
    }).map((file) => file.path);
    expect(found).toEqual(["b.py"]);
  });
});
