import type { Notifier, TaskEvent } from "../notifiers/notifier.js";
import type { TaskQueue } from "./queue.js";

export class Dispatcher {
  constructor(
    private readonly notifiers: Notifier[],
    private readonly queue: TaskQueue,
  ) {}

  dispatch(event: TaskEvent): void {
    this.queue.enqueue(event.task);
    for (const notifier of this.notifiers) {
      notifier.notify(event);
    }
  }
}
