import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  DOC_PATH,
  generateDoc,
  NoDocumentableModulesError,
  writeDoc,
} from "../../src/doc/index.js";
import { DOC_MARKER } from "../../src/doc/render.js";
import { RepoBoundary } from "../../src/repo/boundary.js";
import { migrate, openDb, Store, type Db } from "../../src/store/index.js";

const databases: Db[] = [];

function repo(): RepoBoundary {
  return new RepoBoundary(mkdtempSync(join(tmpdir(), "sonde-docgen-")));
}

function emptyStore(): Store {
  const db = openDb(":memory:");
  databases.push(db);
  migrate(db);
  return new Store(db);
}

afterEach(() => {
  for (const db of databases.splice(0)) db.close();
});

describe("generateDoc", () => {
  it("uses real module, drift, and parse-failure evidence", () => {
    const boundary = repo();
    boundary.writeFile("main.ts", "export function run() {}\n");
    const stat = boundary.stat("main.ts");
    const store = emptyStore();
    store.upsertFile({
      path: "main.ts",
      contentHash: "intentionally-stale",
      mtimeMs: 0,
      size: stat.size,
      parseState: "partial",
    });
    store.insertSymbols([
      {
        stableKey: "ts:main.ts#run",
        filePath: "main.ts",
        qualifiedName: "run",
        shortName: "run",
        kind: "function",
        signature: "()",
        startByte: 0,
        endByte: 24,
        startLine: 1,
        endLine: 1,
        bodyHash: null,
        exported: true,
        isTest: false,
      },
    ]);

    const output = generateDoc(boundary, store);
    expect(output).toContain("| `.` | 1 | 1 |");
    expect(output).toContain("1 file(s) differ from the index");
    expect(output).toContain("1 file(s) did not parse cleanly");
  });

  it("refuses an empty index instead of generating a confident empty page", () => {
    expect(() => generateDoc(repo(), emptyStore())).toThrow(
      NoDocumentableModulesError,
    );
  });
});

describe("writeDoc", () => {
  it("creates the file when absent", () => {
    const boundary = repo();
    expect(writeDoc(boundary, `${DOC_MARKER}\nbody\n`)).toEqual({
      action: "created",
    });
  });

  it("overwrites a file it generated itself", () => {
    const boundary = repo();
    writeDoc(boundary, `${DOC_MARKER}\nold\n`);
    expect(writeDoc(boundary, `${DOC_MARKER}\nnew\n`)).toEqual({
      action: "updated",
    });
    expect(boundary.readFile(DOC_PATH).toString("utf8")).toContain("new");
  });

  it("reports unchanged when content is byte-identical", () => {
    const boundary = repo();
    const content = `${DOC_MARKER}\nbody\n`;
    writeDoc(boundary, content);
    expect(writeDoc(boundary, content)).toEqual({ action: "unchanged" });
  });

  it("refuses to overwrite a human-owned file and leaves it intact", () => {
    const boundary = repo();
    boundary.writeFile(DOC_PATH, "# My own notes\n");
    expect(writeDoc(boundary, `${DOC_MARKER}\nbody\n`)).toEqual({
      action: "refused",
      reason: "not-generated-by-sonde",
    });
    expect(boundary.readFile(DOC_PATH).toString("utf8")).toBe(
      "# My own notes\n",
    );
  });

  it("does not claim a human file that only mentions the marker inline", () => {
    const boundary = repo();
    const human = `Do not add ${DOC_MARKER} as its own line.\n`;
    boundary.writeFile(DOC_PATH, human);
    expect(writeDoc(boundary, `${DOC_MARKER}\nbody\n`)).toEqual({
      action: "refused",
      reason: "not-generated-by-sonde",
    });
    expect(boundary.readFile(DOC_PATH).toString("utf8")).toBe(human);
  });
});
