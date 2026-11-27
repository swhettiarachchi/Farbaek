import "server-only";
import { log } from "@/server/observability/log";

/**
 * How long a stopping server gives its live work to save itself. Production stops the app's container on every deploy and
 * kills it 30 seconds after the signal (`stop_grace_period` in deploy/vps/compose.yaml), so this stays well inside that.
 */
export const DRAIN_MAX_MS = 20_000;

/** The two things of the process this needs, so a test can stand in for it. */
export interface StoppableProcess {
  on(signal: "SIGTERM" | "SIGINT", listener: () => void): unknown;
  exit(code?: number): never;
}

/**
 * Lets work that lives in this process save itself when the server is told to stop (stage 291, ADR 0299).
 *
 * Next.js answers SIGTERM by closing its listener and then calling `process.exit`. With nothing in flight that is within
 * milliseconds, which is before a build's work so far can be written down. So when a stop signal arrives and there is
 * live work, the exit is held until the work has drained, or until `maxMs` has passed, whichever is first; then the exit
 * that was asked for happens, with its own code. Next.js still closes its listener as it always did.
 *
 * With no live work, which is nearly every deploy, nothing is changed at all. A drain that fails or hangs never keeps
 * the server up: the exit is released after `maxMs` regardless.
 */
export function installDrain(input: { drain: (maxMs: number) => Promise<number>; hasWork: () => boolean; proc?: StoppableProcess; maxMs?: number }): void {
  const proc = input.proc ?? (process as unknown as StoppableProcess);
  const maxMs = input.maxMs ?? DRAIN_MAX_MS;
  let draining = false;
  const onSignal = () => {
    // A second signal while draining changes nothing: the exit is already held and will be released.
    if (draining || !input.hasWork()) return;
    draining = true;
    const started = Date.now();
    // Put back exactly as it was found, once the work has drained.
    const original = proc.exit;
    const exit = original.bind(proc);
    let asked: { code: number | undefined } | null = null;
    let released = false;
    const release = (why: "drained" | "timed out" | "failed", runs: number | null) => {
      if (released) return;
      released = true;
      proc.exit = original;
      log(why === "drained" ? "info" : "warn", "shutdown.drain_ended", { why, runs, ms: Date.now() - started });
      if (asked) exit(asked.code);
    };
    // Whoever asks to exit while the work drains is answered once it has: the first code asked for is the one used.
    proc.exit = ((code?: number) => {
      asked ??= { code };
    }) as StoppableProcess["exit"];
    log("info", "shutdown.draining", { maxMs });
    const timer = setTimeout(() => release("timed out", null), maxMs);
    timer.unref?.();
    // Started in the same breath as the signal: the exit Next.js asks for can come within milliseconds.
    let work: Promise<number>;
    try {
      work = input.drain(maxMs);
    } catch (e) {
      work = Promise.reject(e instanceof Error ? e : new Error(String(e)));
    }
    void work.then(
        (runs) => {
          clearTimeout(timer);
          release("drained", runs);
        },
        () => {
          clearTimeout(timer);
          release("failed", null);
        },
      );
  };
  proc.on("SIGTERM", onSignal);
  proc.on("SIGINT", onSignal);
  log("info", "shutdown.drain_installed", { maxMs });
}
