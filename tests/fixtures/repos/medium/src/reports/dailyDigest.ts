import type { TaskQueue } from "../scheduler/queue.js";

export function summarizeActivity(queue: TaskQueue): string {
  return `${queue.pending().length} pending`;
}
