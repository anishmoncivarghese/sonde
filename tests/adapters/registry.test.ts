import { describe, expect, it } from "vitest";
import { adapterForPath } from "../../src/adapters/registry.js";

describe("adapterForPath", () => {
  it("routes TypeScript sources to the TypeScript adapter", () => {
    expect(adapterForPath("src/index.ts")?.language).toBe("typescript");
    expect(adapterForPath("src/App.tsx")?.language).toBe("typescript");
  });

  it("routes Swift sources to the Swift adapter", () => {
    expect(adapterForPath("Sources/App/Model.swift")?.language).toBe("swift");
  });

  it("routes Python sources to the Python adapter", () => {
    expect(adapterForPath("src/app/util.py")?.language).toBe("python");
    expect(adapterForPath("src/app/util.pyi")?.language).toBe("python");
  });

  it("returns null for a file no adapter claims", () => {
    expect(adapterForPath("README.md")).toBeNull();
  });

  it("does not claim TypeScript declaration files", () => {
    // Declarations carry no implementation, so indexing them would add
    // symbols with no bodies for edges to point at.
    expect(adapterForPath("types/global.d.ts")).toBeNull();
  });
});
