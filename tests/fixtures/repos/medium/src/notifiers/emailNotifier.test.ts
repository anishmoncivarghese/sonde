import { describe, expect, it, vi } from "vitest";
import { EmailNotifier } from "./emailNotifier.js";

describe("EmailNotifier", () => {
  it("logs the task title on notify", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    new EmailNotifier().notify({
      task: { id: "1", title: "Ship it", priority: "high" },
      kind: "created",
    });
    expect(spy).toHaveBeenCalledWith(expect.stringContaining("Ship it"));
    spy.mockRestore();
  });
});
