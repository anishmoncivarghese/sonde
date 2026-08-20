import type { Task } from "../core/task.js";

export interface TaskEvent {
  task: Task;
  kind: "created" | "completed";
}

export interface Notifier {
  notify(event: TaskEvent): void;
}
