import { describe, it, expect } from "vitest";
import { buildExportMap } from "../../src/link/exportmap.js";
import type { ExtractResult } from "../../src/adapters/types.js";

const empty = { symbols: [], references: [], imports: [], diagnostics: [] };
const mk = (exports: any[]): ExtractResult => ({ ...empty, exports } as ExtractResult);

// Resolver stub: "./x" from any file → "x.ts"
const cfg = { baseUrl: null, paths: {}, moduleResolution: "bundler" } as any;
const boundary = { root: "/r", contains: () => true } as any;
const stubResolve = (spec: string) => ({ kind: "internal", path: spec.replace("./", "") + ".ts" });

describe("buildExportMap", () => {
  it("maps a local export to its own file", () => {
    const files = new Map([["a.ts", mk([{ exportedName: "foo", localName: "foo", reExportFrom: null, isStar: false, siteLine: 1 }])]]);
    const m = buildExportMap(files, cfg, boundary, stubResolve as any);
    expect(m.get("a.ts")!.get("foo")).toBe("a.ts");
  });

  it("follows a named re-export to the owning file", () => {
    const files = new Map([
      ["a.ts", mk([{ exportedName: "foo", localName: "foo", reExportFrom: null, isStar: false, siteLine: 1 }])],
      ["index.ts", mk([{ exportedName: "foo", localName: null, reExportFrom: "./a", isStar: false, siteLine: 1 }])],
    ]);
    const m = buildExportMap(files, cfg, boundary, stubResolve as any);
    expect(m.get("index.ts")!.get("foo")).toBe("a.ts");
  });

  it("follows a named re-export transitively regardless of file order", () => {
    const files = new Map([
      ["d.ts", mk([{ exportedName: "foo", localName: null, reExportFrom: "./c", isStar: false, siteLine: 1 }])],
      ["c.ts", mk([{ exportedName: "foo", localName: null, reExportFrom: "./b", isStar: false, siteLine: 1 }])],
      ["b.ts", mk([{ exportedName: "foo", localName: null, reExportFrom: "./a", isStar: false, siteLine: 1 }])],
      ["a.ts", mk([{ exportedName: "foo", localName: "foo", reExportFrom: null, isStar: false, siteLine: 1 }])],
    ]);
    const m = buildExportMap(files, cfg, boundary, stubResolve as any);
    expect(m.get("d.ts")!.get("foo")).toBe("a.ts");
  });

  it("expands `export * from` transitively through a barrel chain", () => {
    const files = new Map([
      ["a.ts", mk([{ exportedName: "foo", localName: "foo", reExportFrom: null, isStar: false, siteLine: 1 }])],
      ["b.ts", mk([{ exportedName: "*", localName: null, reExportFrom: "./a", isStar: true, siteLine: 1 }])],
      ["index.ts", mk([{ exportedName: "*", localName: null, reExportFrom: "./b", isStar: true, siteLine: 1 }])],
    ]);
    const m = buildExportMap(files, cfg, boundary, stubResolve as any);
    expect(m.get("index.ts")!.get("foo")).toBe("a.ts");
  });

  it("terminates on an import cycle instead of hanging", () => {
    const files = new Map([
      ["a.ts", mk([{ exportedName: "*", localName: null, reExportFrom: "./b", isStar: true, siteLine: 1 }])],
      ["b.ts", mk([{ exportedName: "*", localName: null, reExportFrom: "./a", isStar: true, siteLine: 1 }])],
    ]);
    const m = buildExportMap(files, cfg, boundary, stubResolve as any);
    expect(m.size).toBe(2); // completed without hanging
  });
});
