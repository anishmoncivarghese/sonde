import { nextDelay } from "./retryPolicy.js";

export function scheduleRetry(attempt: number): number {
  return nextDelay(attempt);
}
