/**
 * When this server last took the every-minute tick for scheduled tasks (ADR 0278), so a page can say how soon after its time a
 * task starts. With the minute timer on, that is within a minute; without it, only the fifteen-minute sweep starts tasks.
 *
 * Kept in memory, on the process itself, because the tick's route and the page are built apart and must read the same value. A
 * restart forgets it for at most a minute: until the next tick the page promises only what the sweep keeps, which is still true.
 */
const state = (globalThis as { __farbaekMinuteTick?: { at: number } }).__farbaekMinuteTick ?? { at: 0 };
(globalThis as { __farbaekMinuteTick?: { at: number } }).__farbaekMinuteTick = state;

/** A tick counts for this long: three missed in a row, and the timer is taken to be off. */
export const MINUTE_TICK_FRESH_MS = 3 * 60_000;

/** Called by the minute tick's route once a tick has been taken. */
export function noteMinuteTick(now: number = Date.now()): void {
  state.at = now;
}

/** True while the every-minute tick is arriving. Never true for a tick dated after `now`. */
export function minuteTickRunning(now: number = Date.now()): boolean {
  return state.at > 0 && now >= state.at && now - state.at <= MINUTE_TICK_FRESH_MS;
}

/** How soon after its time a scheduled task starts, as the Scheduled page says it. */
export function startsWithinLine(now: number = Date.now()): string {
  return minuteTickRunning(now) ? "A task starts within a minute of its time." : "A task starts within 15 minutes of its time.";
}
