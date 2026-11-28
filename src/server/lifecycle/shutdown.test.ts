import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/server/observability/log", () => ({ log: vi.fn() }));

import { DRAIN_MAX_MS, installDrain, type StoppableProcess } from "./shutdown";

/** A stand-in for the process: it records what it was asked to exit with, and lets a test send it a signal. */
function fakeProcess() {
  const listeners = new Map<string, (() => void)[]>();
  const exits: (number | undefined)[] = [];
  const realExit = ((code?: number) => {
    exits.push(code);
  }) as StoppableProcess["exit"];
  const proc: StoppableProcess = {
    on(signal, listener) {
      listeners.set(signal, [...(listeners.get(signal) ?? []), listener]);
      return proc;
    },
    exit: realExit,
  };
  return { proc, exits, realExit, send: (signal: "SIGTERM" | "SIGINT") => (listeners.get(signal) ?? []).forEach((l) => l()) };
}

describe("a stopping server lets its live work save itself (stage 291, ADR 0299)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("changes nothing at all when no work is live, which is nearly every deploy", async () => {
    const p = fakeProcess();
    const drain = vi.fn(async () => 0);
    installDrain({ drain, hasWork: () => false, proc: p.proc });
    p.send("SIGTERM");
    expect(drain).not.toHaveBeenCalled();
    expect(p.proc.exit).toBe(p.realExit);
    p.proc.exit(143);
    expect(p.exits).toEqual([143]);
  });

  it("holds the exit until the work has drained, then exits with the code that was asked for", async () => {
    const p = fakeProcess();
    let finish: (runs: number) => void = () => {};
    const drain = vi.fn(() => new Promise<number>((resolve) => (finish = resolve)));
    installDrain({ drain, hasWork: () => true, proc: p.proc });
    p.send("SIGTERM");
    expect(drain).toHaveBeenCalledWith(DRAIN_MAX_MS);

    // Next.js closes its listener and asks to exit within milliseconds: it is held.
    p.proc.exit(143);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(p.exits).toEqual([]);

    finish(2);
    await vi.advanceTimersByTimeAsync(0);
    expect(p.exits).toEqual([143]);
    // The process's own exit is back, for anything after.
    expect(p.proc.exit).toBe(p.realExit);
  });

  it("uses the first code asked for, and exits once", async () => {
    const p = fakeProcess();
    let finish: (runs: number) => void = () => {};
    installDrain({ drain: () => new Promise<number>((resolve) => (finish = resolve)), hasWork: () => true, proc: p.proc });
    p.send("SIGINT");
    p.proc.exit(130);
    p.proc.exit(1);
    finish(1);
    await vi.advanceTimersByTimeAsync(0);
    expect(p.exits).toEqual([130]);
  });

  it("never keeps the server up for a drain that hangs: the exit is released when the time is up", async () => {
    const p = fakeProcess();
    installDrain({ drain: () => new Promise<number>(() => {}), hasWork: () => true, proc: p.proc, maxMs: 3_000 });
    p.send("SIGTERM");
    p.proc.exit(143);
    await vi.advanceTimersByTimeAsync(2_999);
    expect(p.exits).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(p.exits).toEqual([143]);
  });

  it("releases the exit when the drain fails, too", async () => {
    const p = fakeProcess();
    installDrain({ drain: async () => Promise.reject(new Error("database is down")), hasWork: () => true, proc: p.proc });
    p.send("SIGTERM");
    p.proc.exit(143);
    await vi.advanceTimersByTimeAsync(0);
    expect(p.exits).toEqual([143]);
  });

  it("doesn't exit by itself when nothing asked it to: whoever stops the server still does that", async () => {
    const p = fakeProcess();
    installDrain({ drain: async () => 1, hasWork: () => true, proc: p.proc });
    p.send("SIGTERM");
    await vi.advanceTimersByTimeAsync(DRAIN_MAX_MS + 5_000);
    expect(p.exits).toEqual([]);
    // Asked afterwards, it exits at once.
    p.proc.exit(143);
    expect(p.exits).toEqual([143]);
  });

  it("drains once, however many signals arrive", async () => {
    const p = fakeProcess();
    const drain = vi.fn(() => new Promise<number>(() => {}));
    installDrain({ drain, hasWork: () => true, proc: p.proc, maxMs: 1_000 });
    p.send("SIGTERM");
    p.send("SIGTERM");
    p.send("SIGINT");
    expect(drain).toHaveBeenCalledTimes(1);
    p.proc.exit(143);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(p.exits).toEqual([143]);
  });
});
