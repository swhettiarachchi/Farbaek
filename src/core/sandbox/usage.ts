/**
 * Sandbox usage, measured the way runtimes bill it. A sandbox costs money for
 * every second it exists and runs, whatever it is doing, so Farbaek meters
 * provisioned running time (and from it vCPU-seconds and GiB-seconds of
 * memory) separately from active execution time (seconds a command was
 * actually running). Paused time isn't counted as running; the runtime may
 * still charge for storing the paused snapshot.
 *
 * These are Farbaek's own measurements for limits and cost estimates, not a
 * provider invoice.
 */

export interface MeteredSession {
  /** Running seconds already closed (each pause or stop closes a segment). */
  billedSeconds: number;
  /** Start of the current running segment, or null when not running. */
  runningSince: string | null;
  vcpu: number | null;
  memoryMiB: number | null;
}

export function runningSeconds(s: MeteredSession, now: Date): number {
  const open = s.runningSince ? Math.max(0, Math.floor((now.getTime() - Date.parse(s.runningSince)) / 1000)) : 0;
  return s.billedSeconds + open;
}

export interface UsageTotals {
  runningSeconds: number;
  vcpuSeconds: number;
  gibSeconds: number;
  activeExecutionSeconds: number;
}

export function sessionUsage(s: MeteredSession, activeExecutionMs: number, now: Date): UsageTotals {
  const seconds = runningSeconds(s, now);
  return {
    runningSeconds: seconds,
    vcpuSeconds: seconds * (s.vcpu ?? 0),
    gibSeconds: Math.round(seconds * ((s.memoryMiB ?? 0) / 1024) * 100) / 100,
    activeExecutionSeconds: Math.round(activeExecutionMs / 100) / 10,
  };
}

export function addUsage(a: UsageTotals, b: UsageTotals): UsageTotals {
  return {
    runningSeconds: a.runningSeconds + b.runningSeconds,
    vcpuSeconds: a.vcpuSeconds + b.vcpuSeconds,
    gibSeconds: Math.round((a.gibSeconds + b.gibSeconds) * 100) / 100,
    activeExecutionSeconds: Math.round((a.activeExecutionSeconds + b.activeExecutionSeconds) * 10) / 10,
  };
}

export const ZERO_USAGE: UsageTotals = { runningSeconds: 0, vcpuSeconds: 0, gibSeconds: 0, activeExecutionSeconds: 0 };

/** Minutes rounded up, the unit plan limits use. */
export function wholeMinutes(seconds: number): number {
  return Math.ceil(seconds / 60);
}

/** "12 min", "1 h 05 min". */
export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.max(0, Math.round(seconds))} s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, "0")} min`;
}
