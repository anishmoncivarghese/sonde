import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PathEscapeError, RepoBoundary } from "../../src/repo/boundary.js";
import { loadTsConfig } from "../../src/tsconfig/load.js";
import { resolveSpecifier } from "../../src/tsconfig/resolve.js";

let base: string;
let root: string;
let boundary: RepoBoundary;
let config: ReturnType<typeof loadTsConfig>;

beforeAll(() => {
  base = mkdtempSync(join(tmpdir(), "cg-tsc-"));
  root = join(base, "repo");
  mkdirSync(join(root, "src", "auth"), { recursive: true });
  mkdirSync(join(root, "node_modules", "@config", "base"), {
    recursive: true,
  });
  mkdirSync(join(root, "node_modules", "left-pad"), { recursive: true });
  mkdirSync(join(root, "packages", "lib", "src"), { recursive: true });
  mkdirSync(join(root, "node_modules", "@workspace"), { recursive: true });

  writeFileSync(
    join(root, "node_modules", "@config", "base", "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        paths: { "@base/*": ["src/*"] },
        moduleResolution: "node16",
      },
    }),
  );
  writeFileSync(
    join(root, "tsconfig.json"),
    `{
      // Loading this proves node_modules remains readable resolution input.
      "extends": "@config/base/tsconfig.json",
      "compilerOptions": {
        "baseUrl": ".",
        "paths": {
          "@app/*": ["src/*"],
          "@exact": ["src/auth/session.ts"],
        },
        "moduleResolution": "bundler",
      },
    }`,
  );
  writeFileSync(join(root, "src", "a.ts"), "");
  writeFileSync(join(root, "src", "auth", "index.ts"), "");
  writeFileSync(join(root, "src", "auth", "session.ts"), "");
  writeFileSync(join(root, "node_modules", "left-pad", "package.json"), "{}");
  writeFileSync(join(root, "packages", "lib", "src", "index.ts"), "");
  writeFileSync(join(root, "packages", "lib", "src", "feature.ts"), "");
  writeFileSync(
    join(root, "packages", "lib", "package.json"),
    JSON.stringify({
      name: "@workspace/lib",
      exports: {
        ".": "./src/index.js",
        "./feature": { types: "./src/feature.ts", default: "./src/feature.js" },
        "./wild/*": { types: "./src/*.ts" },
      },
    }),
  );
  symlinkSync(
    join(root, "packages", "lib"),
    join(root, "node_modules", "@workspace", "lib"),
  );

  boundary = new RepoBoundary(root);
  config = loadTsConfig(boundary);
});

afterAll(() => rmSync(base, { recursive: true, force: true }));

describe("loadTsConfig", () => {
  it("loads JSONC and merges a published extends chain", () => {
    expect(config.baseUrl).toBe(boundary.root);
    expect(config.moduleResolution).toBe("bundler");
    expect(config.paths).toMatchObject({
      "@base/*": ["src/*"],
      "@app/*": ["src/*"],
    });
  });

  it("returns safe defaults when no config exists", () => {
    const empty = mkdtempSync(join(tmpdir(), "cg-no-tsc-"));
    try {
      expect(loadTsConfig(new RepoBoundary(empty))).toEqual({
        baseUrl: null,
        paths: {},
        moduleResolution: "node",
      });
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
  });

  it("rejects an extends path escaping the repository", () => {
    const escaping = join(base, "escaping");
    mkdirSync(escaping);
    writeFileSync(
      join(escaping, "tsconfig.json"),
      '{ "extends": "../../outside.json" }',
    );
    expect(() => loadTsConfig(new RepoBoundary(escaping))).toThrow(
      PathEscapeError,
    );
  });
});

describe("resolveSpecifier", () => {
  const resolve = (specifier: string, from = "src/a.ts") =>
    resolveSpecifier(specifier, from, config, boundary);

  it("resolves a relative specifier with an implicit extension", () => {
    expect(resolve("./auth/session")).toEqual({
      kind: "internal",
      path: "src/auth/session.ts",
    });
  });

  it("resolves a directory to its index file", () => {
    expect(resolve("./auth")).toEqual({
      kind: "internal",
      path: "src/auth/index.ts",
    });
  });

  it("resolves local and inherited tsconfig path aliases", () => {
    expect(resolve("@app/auth/session")).toEqual({
      kind: "internal",
      path: "src/auth/session.ts",
    });
    expect(resolve("@base/auth/session")).toEqual({
      kind: "internal",
      path: "src/auth/session.ts",
    });
    expect(resolve("@exact")).toEqual({
      kind: "internal",
      path: "src/auth/session.ts",
    });
  });

  it("maps a JavaScript specifier to TypeScript under bundler resolution", () => {
    expect(resolve("./auth/session.js")).toEqual({
      kind: "internal",
      path: "src/auth/session.ts",
    });
  });

  it("resolves exports from a linked internal workspace package", () => {
    expect(resolve("@workspace/lib")).toEqual({
      kind: "internal",
      path: "packages/lib/src/index.ts",
    });
    expect(resolve("@workspace/lib/feature")).toEqual({
      kind: "internal",
      path: "packages/lib/src/feature.ts",
    });
    expect(resolve("@workspace/lib/wild/feature")).toEqual({
      kind: "internal",
      path: "packages/lib/src/feature.ts",
    });
  });

  it("classifies installed packages as external", () => {
    expect(resolve("left-pad/subpath")).toEqual({
      kind: "external",
      pkg: "left-pad",
    });
    expect(resolve("@scope/pkg/subpath")).toEqual({
      kind: "external",
      pkg: "@scope/pkg",
    });
  });

  it("classifies an unresolvable relative specifier without guessing", () => {
    expect(resolve("./nope")).toEqual({ kind: "external", pkg: "./nope" });
  });
});
