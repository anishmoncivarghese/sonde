import { describe, expect, it } from "vitest";
import { SWIFT_SDK_SYMBOLS } from "../../../src/adapters/swift/sdkSymbols.js";

describe("SWIFT_SDK_SYMBOLS", () => {
  it("classifies well-known SwiftUI and Foundation vocabulary", () => {
    expect(SWIFT_SDK_SYMBOLS.get("View")).toBe("SwiftUI");
    expect(SWIFT_SDK_SYMBOLS.get("Date")).toBe("Foundation");
    expect(SWIFT_SDK_SYMBOLS.get("String")).toBeDefined();
  });

  it("does not claim an obviously project-shaped name", () => {
    expect(SWIFT_SDK_SYMBOLS.has("NotificationInfo")).toBe(false);
  });
});
