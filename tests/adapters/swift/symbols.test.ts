import { beforeAll, describe, expect, it } from "vitest";
import { getSwiftParser, swiftParser } from "../../../src/adapters/swift/parser.js";
import { extractSwiftSymbols } from "../../../src/adapters/swift/symbols.js";

beforeAll(async () => { await getSwiftParser(); });
const run = (src: string, path = "Sources/A.swift") =>
  extractSwiftSymbols(path, src, swiftParser().parse(src)!);

describe("extractSwiftSymbols", () => {
  it("keys a top-level function", () => {
    expect(run("func refresh() {}")[0]!.stableKey).toBe("swift:Sources/A.swift#refresh");
  });

  it("scopes a method under its type", () => {
    const keys = run("class Auth { func refresh() {} }").map((s) => s.stableKey);
    expect(keys).toContain("swift:Sources/A.swift#Auth.refresh");
  });

  it("attributes an extension member to the type it extends, not to the extension", () => {
    // 21/21 extensions in the spike exposed a named declaring type.
    const keys = run("extension Auth { func retry() {} }").map((s) => s.stableKey);
    expect(keys).toContain("swift:Sources/A.swift#Auth.retry");
  });

  it("records protocol requirements as members of the protocol", () => {
    const keys = run("protocol Gateway { func save() }").map((s) => s.stableKey);
    expect(keys).toContain("swift:Sources/A.swift#Gateway.save");
  });

  it("captures declared visibility, which resolution needs for narrowing", () => {
    const symbols = run("private func hidden() {}\nfunc open() {}");
    expect(symbols.find((s) => s.shortName === "hidden")?.visibility).toBe("private");
    expect(symbols.find((s) => s.shortName === "open")?.visibility).toBe("internal");
  });

  it("inherits an extension's declared visibility for its members", () => {
    const symbols = run("private extension Auth { func retry() {} }");
    expect(symbols.find((s) => s.shortName === "retry")?.visibility).toBe("private");
  });

  it("does not mint closures as symbols", () => {
    // spec §6.2: anonymous callables are never symbols; references inside them
    // attribute to the nearest named enclosing symbol.
    const symbols = run("func outer() { [1].map { x in x + 1 } }");
    expect(symbols).toHaveLength(1);
    expect(symbols[0]!.shortName).toBe("outer");
  });
});
