import type { Task } from "../core/task.js";

export class TaskQueue {
  private items: Task[] = [];

  enqueue(task: Task): void {
    this.items.push(task);
  }

  pending(): Task[] {
    return this.items;
  }
}
