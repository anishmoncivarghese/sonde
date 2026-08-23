import type { Notifier, TaskEvent } from "./notifier.js";

export class EmailNotifier implements Notifier {
  notify(event: TaskEvent): void {
    this.sendMail(`Task ${event.kind}: ${event.task.title}`);
  }

  private sendMail(body: string): void {
    console.log(`[email] ${body}`);
  }
}
