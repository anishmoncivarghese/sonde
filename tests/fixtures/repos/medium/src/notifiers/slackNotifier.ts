import type { Notifier, TaskEvent } from "./notifier.js";

export class SlackNotifier implements Notifier {
  notify(event: TaskEvent): void {
    this.postMessage(`Task ${event.kind}: ${event.task.title}`);
  }

  private postMessage(text: string): void {
    console.log(`[slack] ${text}`);
  }
}
