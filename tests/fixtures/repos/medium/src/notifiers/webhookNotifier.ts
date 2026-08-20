import type { Notifier, TaskEvent } from "./notifier.js";

export class WebhookNotifier implements Notifier {
  notify(event: TaskEvent): void {
    this.post(JSON.stringify(event));
  }

  private post(payload: string): void {
    console.log(`[webhook] ${payload}`);
  }
}
