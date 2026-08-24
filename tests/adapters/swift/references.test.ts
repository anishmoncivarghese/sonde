import { beforeAll, describe, expect, it } from "vitest";
import { getSwiftParser, swiftParser } from "../../../src/adapters/swift/parser.js";
import { extractSwiftSymbols } from "../../../src/adapters/swift/symbols.js";
import { extractSwiftReferences } from "../../../src/adapters/swift/references.js";

beforeAll(async () => { await getSwiftParser(); });
const run = (src: string, path = "Sources/App/A.swift") => {
  const tree = swiftParser().parse(src)!;
  return extractSwiftReferences(path, src, tree, extractSwiftSymbols(path, src, tree));
};

describe("extractSwiftReferences", () => {
  it("records a bare call with no receiver", () => {
    const r = run("func a() { helper() }").find((x) => x.name === "helper")!;
    expect(r.kind).toBe("CALLS");
    expect(r.receiver).toBeNull();
  });

  it("records a member call with its receiver, which stays HEURISTIC later", () => {
    const r = run("func a() { gateway.save() }").find((x) => x.name === "save")!;
    expect(r.receiver).toBe("gateway");
  });

  it("carries the declaring file in the scope hint", () => {
    const r = run("func a() { helper() }").find((x) => x.name === "helper")!;
    expect(r.scopeHint?.file).toBe("Sources/App/A.swift");
  });

  it("carries the SwiftPM target inferred from the path", () => {
    // Sources/<Target>/... is the SwiftPM convention and is the only
    // module signal available without building the package.
    const r = run("func a() { helper() }").find((x) => x.name === "helper")!;
    expect(r.scopeHint?.module).toBe("App");
  });

  it("carries only an explicitly written local receiver type", () => {
    const explicit = run(
      "func a() { let gateway: Gateway = makeGateway(); gateway.save() }",
    ).find((x) => x.name === "save")!;
    const inferred = run(
      "func a() { let gateway = makeGateway(); gateway.save() }",
    ).find((x) => x.name === "save")!;
    expect(explicit.scopeHint?.receiverType).toBe("Gateway");
    expect(inferred.scopeHint?.receiverType).toBeNull();
  });

  it("records protocol conformance", () => {
    const r = run("class A: Gateway {}").find((x) => x.name === "Gateway")!;
    expect(["IMPLEMENTS", "INHERITS"]).toContain(r.kind);
  });

  it("attributes a reference inside a closure to the nearest named symbol", () => {
    const r = run("func outer() { [1].map { _ in helper() } }").find((x) => x.name === "helper")!;
    expect(r.fromSymbolKey).toBe("swift:Sources/App/A.swift#outer");
  });
});
