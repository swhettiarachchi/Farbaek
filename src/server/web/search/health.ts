/**
 * A breaker for the search service (stage 205, ADR 0222): after three failed searches in a row it rests for a minute, so a
 * service that's down costs each question no time at all, and the answer says at once that the web couldn't be checked. One
 * success closes it again. In memory, per server process.
 */
export interface Breaker {
  /** True while it's resting: don't try. */
  open(): boolean;
  ok(): void;
  fail(): void;
}

export function createBreaker({ failures = 3, restMs = 60_000, now = Date.now }: { failures?: number; restMs?: number; now?: () => number } = {}): Breaker {
  let streak = 0;
  let until = 0;
  return {
    open: () => now() < until,
    ok() {
      streak = 0;
      until = 0;
    },
    fail() {
      streak++;
      if (streak >= failures) {
        until = now() + restMs;
        streak = 0;
      }
    },
  };
}
