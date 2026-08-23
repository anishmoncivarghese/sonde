import { describe, expect, it } from "vitest";
import { nextDelay } from "./retryPolicy.js";

describe("nextDelay", () => {
  it("grows exponentially and caps at 30 seconds", () => {
    expect(nextDelay(0)).toBe(100);
    expect(nextDelay(10)).toBe(30000);
  });
});
