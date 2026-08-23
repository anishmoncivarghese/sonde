import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createCompilerContext,
  TSC_VERSION,
} from "../../src/resolve/compilerPass.js";

function fixture(withConfig: boolean): string {
  const root = mkdtempSync(join(tmpdir(), "cg-compiler-"));
  mkdirSync(join(root, "src"));
  writeFileSync(
    join(root, "src", "a.ts"),
    "export function a(): number { return 1; }",
  );
  if (withConfig) {
    writeFileSync(
      join(root, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: {
          strict: true,
          moduleResolution: "bundler",
          module: "esnext",
          target: "es2022",
        },
        include: ["src"],
      }),
    );
  }
  return root;
}

describe("createCompilerContext", () => {
  it("builds a program when a tsconfig is present", () => {
    const context = createCompilerContext(fixture(true));
    expect(context).not.toBeNull();
    expect(context!.program.getSourceFiles().length).toBeGreaterThan(0);
  });

  it("returns null rather than throwing when tsconfig is absent", () => {
    // Invariant 8: a missing toolchain degrades with a warning; it never
    // crashes an index that would otherwise have succeeded.
    expect(createCompilerContext(fixture(false))).toBeNull();
  });

  it("returns null rather than throwing on a malformed tsconfig", () => {
    const root = fixture(false);
    writeFileSync(join(root, "tsconfig.json"), "{ this is not json");
    expect(createCompilerContext(root)).toBeNull();
  });

  it("classifies repository files as in-repo and node_modules as out", () => {
    const root = fixture(true);
    const context = createCompilerContext(root)!;
    expect(context.inRepo(join(root, "src", "a.ts"))).toBe(true);
    expect(context.inRepo(join(root, "node_modules", "x", "index.d.ts"))).toBe(
      false,
    );
  });

  it("reports the bundled compiler version, not the target repository's", () => {
    // SEC-008: the target repo's typescript is never loaded. Disclosing which
    // version resolved the edges is required by spec §5.3.
    expect(TSC_VERSION).toMatch(/^\d+\.\d+/);
  });
});
