import type { Task } from "./core/task.js";
import { ConsoleNotifier } from "./notifiers/consoleNotifier.js";
import { EmailNotifier } from "./notifiers/emailNotifier.js";
import type { Notifier } from "./notifiers/notifier.js";
import { SlackNotifier } from "./notifiers/slackNotifier.js";
import { SmsNotifier } from "./notifiers/smsNotifier.js";
import { WebhookNotifier } from "./notifiers/webhookNotifier.js";
import { Dispatcher } from "./scheduler/dispatcher.js";
import { TaskQueue } from "./scheduler/queue.js";

const notifiers: Notifier[] = [
  new EmailNotifier(),
  new SlackNotifier(),
  new SmsNotifier(),
  new WebhookNotifier(),
  new ConsoleNotifier(),
];
const dispatcher = new Dispatcher(notifiers, new TaskQueue());

export function start(task: Task): void {
  dispatcher.dispatch({ task, kind: "created" });
}
