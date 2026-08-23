import { describe, expect, it } from "vitest";

import { deriveMemberImplements } from "../../src/resolve/members.js";
import type { EdgeRow } from "../../src/store/repos.js";

const sym = (file: string, qualifiedName: string) =>
  [`ts:${file}#${qualifiedName}`, { file, qualifiedName }] as const;

const symbols = new Map([
  sym("src/router.ts", "Router"),
  sym("src/router.ts", "Router.add"),
  sym("src/router.ts", "Router.match"),
  sym("src/reg.ts", "RegExpRouter"),
  sym("src/reg.ts", "RegExpRouter.add"),
  sym("src/reg.ts", "RegExpRouter.match"),
  sym("src/reg.ts", "RegExpRouter.privateHelper"),
  sym("src/trie.ts", "TrieRouter"),
  sym("src/trie.ts", "TrieRouter.add"),
]);

const typeEdge = (src: string, dst: string, kind: "IMPLEMENTS" | "INHERITS"): EdgeRow => ({
  srcKey: src,
  dstKey: dst,
  kind,
  tier: "LEXICAL",
  confidence: 1,
  siteLine: 1,
});

describe("deriveMemberImplements", () => {
  const edges = [
    typeEdge("ts:src/reg.ts#RegExpRouter", "ts:src/router.ts#Router", "IMPLEMENTS"),
    typeEdge("ts:src/trie.ts#TrieRouter", "ts:src/router.ts#Router", "IMPLEMENTS"),
  ];

  it("links an implementing member to the interface member it satisfies", () => {
    // impact(Router.add) returned 49 heuristic symbols with 451 omitted and only
    // one real router, because the path Router.add -> Router -> RegExpRouter ->
    // RegExpRouter.add is three hops that nothing walked.
    const derived = deriveMemberImplements(symbols, edges);
    expect(derived).toContainEqual(
      expect.objectContaining({
        srcKey: "ts:src/reg.ts#RegExpRouter.add",
        dstKey: "ts:src/router.ts#Router.add",
        kind: "IMPLEMENTS",
        tier: "LEXICAL",
      }),
    );
  });

  it("covers every implementer of the interface", () => {
    const derived = deriveMemberImplements(symbols, edges);
    const addImplementers = derived
      .filter((e) => e.dstKey === "ts:src/router.ts#Router.add")
      .map((e) => e.srcKey);
    expect(addImplementers.sort()).toEqual([
      "ts:src/reg.ts#RegExpRouter.add",
      "ts:src/trie.ts#TrieRouter.add",
    ]);
  });

  it("is LEXICAL, not heuristic — the override is structural, not a name guess", () => {
    // The class declares that it implements the interface, and TypeScript
    // requires the member to exist. That is evidence, not a coincidence.
    const derived = deriveMemberImplements(symbols, edges);
    expect(derived.every((e) => e.tier === "LEXICAL")).toBe(true);
  });

  it("ignores members the interface does not declare", () => {
    const derived = deriveMemberImplements(symbols, edges);
    expect(derived.some((e) => e.srcKey.endsWith("privateHelper"))).toBe(false);
  });

  it("derives nothing without a type-level relationship", () => {
    expect(deriveMemberImplements(symbols, [])).toEqual([]);
  });

  it("handles inheritance as well as implementation", () => {
    const inherits = [
      typeEdge("ts:src/reg.ts#RegExpRouter", "ts:src/router.ts#Router", "INHERITS"),
    ];
    expect(deriveMemberImplements(symbols, inherits)).toHaveLength(2);
  });

  it("does not emit a self-edge when a type relates to itself", () => {
    const selfEdge = [
      typeEdge("ts:src/router.ts#Router", "ts:src/router.ts#Router", "IMPLEMENTS"),
    ];
    expect(deriveMemberImplements(symbols, selfEdge)).toEqual([]);
  });
});
