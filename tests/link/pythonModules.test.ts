import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { resolvePythonModule } from "../../src/link/pythonModules.js";
import { RepoBoundary } from "../../src/repo/boundary.js";

function repo(files: string[]): RepoBoundary {
  const root = mkdtempSync(join(tmpdir(), "sonde-py-"));
  for (const file of files) {
    const full = join(root, file);
    mkdirSync(join(full, ".."), { recursive: true });
    writeFileSync(full, "");
  }
  return new RepoBoundary(root);
}

describe("resolvePythonModule", () => {
  it("resolves a single-dot relative import within the package", () => {
    const boundary = repo(["pkg/__init__.py", "pkg/mod.py", "pkg/foo.py"]);
    expect(resolvePythonModule(".foo", "pkg/mod.py", boundary)).toEqual({
      kind: "internal",
      path: "pkg/foo.py",
    });
  });

  it("resolves a two-dot relative import to the parent package", () => {
    const boundary = repo([
      "pkg/__init__.py",
      "pkg/sub/__init__.py",
      "pkg/sub/m.py",
      "pkg/other.py",
    ]);
    expect(resolvePythonModule("..other", "pkg/sub/m.py", boundary)).toEqual({
      kind: "internal",
      path: "pkg/other.py",
    });
  });

  it("resolves a bare relative import to the package __init__", () => {
    const boundary = repo(["pkg/__init__.py", "pkg/mod.py"]);
    expect(resolvePythonModule(".", "pkg/mod.py", boundary)).toEqual({
      kind: "internal",
      path: "pkg/__init__.py",
    });
  });

  it("derives a src/ layout import root without reading pyproject.toml", () => {
    const boundary = repo([
      "src/whyline/__init__.py",
      "src/whyline/cli.py",
      "src/whyline/util.py",
    ]);
    // spec §5.2: walk up from a directory holding __init__.py; src/ is the root.
    expect(resolvePythonModule("whyline.util", "src/whyline/cli.py", boundary))
      .toEqual({ kind: "internal", path: "src/whyline/util.py" });
  });

  it("resolves a package import to its __init__.py", () => {
    const boundary = repo([
      "src/whyline/__init__.py",
      "src/whyline/sub/__init__.py",
      "src/whyline/cli.py",
    ]);
    expect(resolvePythonModule("whyline.sub", "src/whyline/cli.py", boundary))
      .toEqual({ kind: "internal", path: "src/whyline/sub/__init__.py" });
  });

  it("classifies a stdlib module as external", () => {
    const boundary = repo(["a.py"]);
    expect(resolvePythonModule("os.path", "a.py", boundary)).toEqual({
      kind: "external",
      pkg: "os",
    });
  });

  it("classifies an unknown third-party module as external", () => {
    const boundary = repo(["a.py"]);
    expect(resolvePythonModule("httpx", "a.py", boundary)).toEqual({
      kind: "external",
      pkg: "httpx",
    });
  });

  it("prefers a repository module over a same-named external", () => {
    const boundary = repo(["json.py", "a.py"]);
    expect(resolvePythonModule("json", "a.py", boundary)).toEqual({
      kind: "internal",
      path: "json.py",
    });
  });
});
