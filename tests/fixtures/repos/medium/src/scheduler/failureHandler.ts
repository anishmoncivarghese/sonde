import { scheduleRetry } from "./retryScheduler.js";

export function handleFailure(attempt: number): number {
  return scheduleRetry(attempt);
}
