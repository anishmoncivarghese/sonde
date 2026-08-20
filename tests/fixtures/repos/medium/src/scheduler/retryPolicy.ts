// The maximum number of attempts before a caller should give up entirely.
export const MAX_ATTEMPTS = 5;

/** How many milliseconds to hold off before the next attempt. */
export function nextDelay(attempt: number): number {
  return Math.min(30000, 2 ** attempt * 100);
}
