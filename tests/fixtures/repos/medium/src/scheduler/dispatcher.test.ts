import { describe, expect, it } from "vitest";
import type { Notifier } from "../notifiers/notifier.js";
import { Dispatcher } from "./dispatcher.js";
import { TaskQueue } from "./queue.js";

describe("Dispatcher", () => {
  it("notifies every registered notifier and enqueues the task", () => {
    const notified: string[] = [];
    const fake: Notifier = { notify: () => notified.push("called") };
    const queue = new TaskQueue();
    const dispatcher = new Dispatcher([fake], queue);

    dispatcher.dispatch({
      task: { id: "1", title: "t", priority: "low" },
      kind: "created",
    });

    expect(notified).toEqual(["called"]);
    expect(queue.pending()).toHaveLength(1);
  });
});
