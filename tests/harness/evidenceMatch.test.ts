import { describe, expect, it } from "vitest";

import { evidenceAppears } from "../../bench/harness/evidenceMatch.js";
import type { EvidenceSymbol } from "../../bench/harness/types.js";

const fileEvidence: EvidenceSymbol = {
  stableKey: "ts:src/index.ts#",
  qualifiedName: "src/index.ts",
  path: "src/index.ts",
};

const symbolEvidence: EvidenceSymbol = {
  stableKey: "ts:src/scheduler/dispatcher.ts#Dispatcher",
  qualifiedName: "Dispatcher",
  path: "src/scheduler/dispatcher.ts",
};

describe("evidenceAppears", () => {
  it("credits a finer-grained symbol from the required file", () => {
    // CodeGraph answered `ts:src/index.ts#notifiers` — the exact variable that
    // holds the reference, which is a better answer than the file. Exact
    // stable-key membership scored that 0.00 while the prose arm scored 1.00
    // for merely naming the path.
    const rendered = JSON.stringify({
      stableKey: "ts:src/index.ts#notifiers",
      path: "src/index.ts",
      qualifiedName: "notifiers",
    });
    expect(evidenceAppears(rendered, fileEvidence)).toBe(true);
  });

  it("credits a member of the required class", () => {
    const rendered = JSON.stringify({
      stableKey: "ts:src/scheduler/dispatcher.ts#Dispatcher.constructor",
      qualifiedName: "Dispatcher.constructor",
    });
    expect(evidenceAppears(rendered, symbolEvidence)).toBe(true);
  });

  it("does not credit a similarly-named symbol", () => {
    expect(evidenceAppears("DispatcherFactory was checked", symbolEvidence))
      .toBe(false);
  });

  it("does not credit an unrelated file", () => {
    expect(evidenceAppears('{"path":"src/other.ts"}', fileEvidence)).toBe(false);
  });

  it("scores structured evidence and prose by the identical rule", () => {
    // The whole point: whatever the rule is, both arms must be held to it.
    const structured = JSON.stringify({ path: "src/index.ts" });
    const prose = "I examined src/index.ts and found the array.";
    expect(evidenceAppears(structured, fileEvidence))
      .toBe(evidenceAppears(prose, fileEvidence));
  });
});
