import { afterEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { swiftAdapter } from "../../../src/adapters/swift/index.js";
import { checkDrift } from "../../../src/index/drift.js";
import { indexRepo } from "../../../src/index/pipeline.js";
import { queryGraph } from "../../../src/query/traverse.js";
import { RepoBoundary } from "../../../src/repo/boundary.js";
import { migrate, openDb, Store } from "../../../src/store/index.js";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function swiftPackage(): { root: string; dbPath: string } {
  const root = mkdtempSync(join(tmpdir(), "cg-swift-adapter-"));
  roots.push(root);
  mkdirSync(join(root, "Sources", "App"), { recursive: true });
  writeFileSync(
    join(root, "Package.swift"),
    "// swift-tools-version: 6.0\nimport PackageDescription\n" +
      "let package = Package(name: \"App\", targets: [.target(name: \"App\")])\n",
  );
  writeFileSync(
    join(root, "Sources", "App", "Transport.swift"),
    [
      "public protocol Transport {",
      "  func send()",
      "}",
      "",
      "public struct HttpTransport: Transport {",
      "  public func send() {}",
      "}",
      "",
    ].join("\n"),
  );
  return { root, dbPath: join(root, "index.sqlite") };
}

describe("swiftAdapter", () => {
  it("matches Swift source files only", () => {
    expect(swiftAdapter.matches("Sources/App/Main.swift")).toBe(true);
    expect(swiftAdapter.matches("Sources/App/Main.ts")).toBe(false);
  });

  it("indexes a Swift package and finds protocol conformers end to end", async () => {
    const { root, dbPath } = swiftPackage();

    const stats = await indexRepo(root, dbPath);
    // Package.swift is Swift source too; indexing parses it but never executes
    // the manifest or any other repository code.
    expect(stats.filesIndexed).toBe(2);
    expect(stats.symbols).toBeGreaterThanOrEqual(5);
    expect(stats.edges).toBeGreaterThan(0);

    const db = openDb(dbPath);
    try {
      migrate(db);
      const result = queryGraph(db, {
        pattern: "implementations_of",
        symbol: "Transport",
      });
      expect(result.lexical).toContainEqual(expect.objectContaining({
        stableKey: "swift:Sources/App/Transport.swift#HttpTransport",
        qualifiedName: "HttpTransport",
      }));
      expect(checkDrift(new RepoBoundary(root), new Store(db))).toEqual({
        state: "fresh",
        driftCount: 0,
        driftedPaths: [],
      });
    } finally {
      db.close();
    }
  });
});
