import type { Notifier, TaskEvent } from "./notifier.js";

export class SmsNotifier implements Notifier {
  notify(event: TaskEvent): void {
    this.sendText(`${event.kind}: ${event.task.title}`);
  }

  private sendText(body: string): void {
    console.log(`[sms] ${body}`);
  }
}
