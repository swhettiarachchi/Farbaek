/**
 * Setting up a direct link between two paired Farbaek Agents (ADR 0095).
 * The WebRTC offer, answer and network candidates travel as lines of JSON
 * over a Farbaek relay session, which already checks both agents' tokens and
 * keeps calls inside the workspace. Once the direct link is open, the relay
 * session closes and no file byte goes near the server.
 *
 * The server could change what's said here. It gains nothing by it: the
 * Noise handshake that runs over the direct link proves each side holds the
 * key its person paired, so a link to anyone else carries nothing readable.
 */
import type { Duplex } from "node:stream";
import { SIGNAL_LIMITS, SignalSchema, type Signal } from "@/core/mesh/direct-protocol";

/** A direct link couldn't be opened: the words say why, and the sender is offered the relay. */
export class DirectError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DirectError";
  }
}

const MAX_LINE = SIGNAL_LIMITS.line;
const MAX_CANDIDATES = SIGNAL_LIMITS.candidates;

export { SignalSchema, type Signal };

interface Waiter {
  resolve: (signal: Signal) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout | null;
}

/** Lines of JSON over a byte stream, each checked before it's used. */
export class SignalChannel {
  private pending = "";
  private readonly queue: Signal[] = [];
  private readonly waiters: Waiter[] = [];
  private failure: Error | null = null;
  private candidates = 0;

  constructor(private readonly stream: Duplex) {
    stream.setEncoding?.("utf8");
    stream.on("data", (chunk: string | Buffer) => this.onData(typeof chunk === "string" ? chunk : chunk.toString("utf8")));
    stream.on("end", () => this.fail(new DirectError("The other computer stopped setting up the direct link.")));
    stream.on("error", () => this.fail(new DirectError("The connection that sets up the direct link failed.")));
    stream.on("close", () => this.fail(new DirectError("The other computer stopped setting up the direct link.")));
  }

  private onData(text: string): void {
    this.pending += text;
    let newline = this.pending.indexOf("\n");
    while (newline >= 0) {
      const line = this.pending.slice(0, newline);
      this.pending = this.pending.slice(newline + 1);
      this.take(line);
      newline = this.pending.indexOf("\n");
    }
    if (this.pending.length > MAX_LINE) this.refuse();
  }

  private take(line: string): void {
    if (line.length > MAX_LINE) return this.refuse();
    let json: unknown;
    try {
      json = JSON.parse(line);
    } catch {
      return this.refuse();
    }
    const parsed = SignalSchema.safeParse(json);
    if (!parsed.success) return this.refuse();
    if (parsed.data.t === "ice" && ++this.candidates > MAX_CANDIDATES) return this.refuse();
    const waiter = this.waiters.shift();
    if (waiter) {
      if (waiter.timer) clearTimeout(waiter.timer);
      waiter.resolve(parsed.data);
    } else {
      this.queue.push(parsed.data);
    }
  }

  private refuse(): void {
    this.fail(new DirectError("The other computer sent something that isn't part of setting up a direct link."));
    this.stream.destroy();
  }

  private fail(error: Error): void {
    if (this.failure) return;
    this.failure = error;
    for (const w of this.waiters.splice(0)) {
      if (w.timer) clearTimeout(w.timer);
      w.reject(error);
    }
  }

  /** Every message as it arrives, until the channel ends. */
  onMessage(listener: (signal: Signal) => void): void {
    const pump = (): void => {
      this.next()
        .then((s) => {
          listener(s);
          pump();
        })
        .catch(() => undefined);
    };
    pump();
  }

  /** The next message, waiting at most `timeoutMs` when given. */
  next(timeoutMs?: number): Promise<Signal> {
    const queued = this.queue.shift();
    if (queued) return Promise.resolve(queued);
    if (this.failure) return Promise.reject(this.failure);
    return new Promise((resolve, reject) => {
      const waiter: Waiter = { resolve, reject, timer: null };
      if (timeoutMs !== undefined) {
        waiter.timer = setTimeout(() => {
          const i = this.waiters.indexOf(waiter);
          if (i >= 0) this.waiters.splice(i, 1);
          reject(new DirectError("The other computer didn't answer in time."));
        }, timeoutMs);
      }
      this.waiters.push(waiter);
    });
  }

  send(signal: Signal): void {
    if (this.failure || this.stream.destroyed) return;
    this.stream.write(`${JSON.stringify(signal)}\n`);
  }

  /** Ends the setup channel: the direct link carries on without it. */
  close(): void {
    this.failure ??= new DirectError("The setup channel closed.");
    if (!this.stream.destroyed) this.stream.end();
  }

  get closed(): boolean {
    return this.failure !== null;
  }
}
