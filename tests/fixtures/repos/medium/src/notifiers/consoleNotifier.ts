import type { Notifier, TaskEvent } from "./notifier.js";

export class ConsoleNotifier implements Notifier {
  notify(event: TaskEvent): void {
    this.print(`${event.kind}: ${event.task.title}`);
  }

  private print(line: string): void {
    console.log(`[console] ${line}`);
  }
}
