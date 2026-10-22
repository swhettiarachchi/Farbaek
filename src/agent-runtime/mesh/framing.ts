/**
 * Noise messages over TCP: each one prefixed with its length as two bytes,
 * big-endian, so no message exceeds 65,535 bytes (the Noise limit). Reads
 * reassemble messages from however TCP splits or joins them. Both directions
 * apply backpressure: a write waits for the socket to drain, and the socket
 * is paused while unread messages pile up, so a fast sender can't make the
 * receiver hold a large file in memory.
 */
import type { Socket } from "node:net";
import { MAX_MESSAGE } from "./noise";

/** Unread messages held before the socket is paused. */
const HIGH_WATER = 64;

export class FrameError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FrameError";
  }
}

interface Waiter {
  resolve: (frame: Buffer) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout | null;
}

export class FramedSocket {
  private pending: Buffer = Buffer.alloc(0);
  private readonly frames: Buffer[] = [];
  private readonly waiters: Waiter[] = [];
  private failure: Error | null = null;
  /** Set when this side closes: it stops reading at once, even while the other side's messages are still arriving. */
  private closedHere = false;
  private paused = false;

  constructor(readonly socket: Socket) {
    socket.setNoDelay(true);
    socket.on("data", (chunk: Buffer) => this.onData(chunk));
    socket.on("error", (error) => this.fail(new FrameError(`The connection failed: ${error.message}`)));
    socket.on("close", () => this.fail(new FrameError("The connection closed.")));
  }

  get closed(): boolean {
    return this.closedHere || this.failure !== null;
  }

  private onData(chunk: Buffer): void {
    this.pending = this.pending.length === 0 ? chunk : Buffer.concat([this.pending, chunk]);
    while (this.pending.length >= 2) {
      const length = this.pending.readUInt16BE(0);
      if (this.pending.length < 2 + length) break;
      const frame = Buffer.from(this.pending.subarray(2, 2 + length));
      this.pending = this.pending.subarray(2 + length);
      const waiter = this.waiters.shift();
      if (waiter) {
        if (waiter.timer) clearTimeout(waiter.timer);
        waiter.resolve(frame);
      } else {
        this.frames.push(frame);
      }
    }
    if (this.frames.length >= HIGH_WATER && !this.paused) {
      this.paused = true;
      this.socket.pause();
    }
  }

  private fail(error: Error): void {
    if (this.failure) return;
    this.failure = error;
    for (const waiter of this.waiters.splice(0)) {
      if (waiter.timer) clearTimeout(waiter.timer);
      waiter.reject(error);
    }
  }

  /** The next message, waiting at most `timeoutMs` when given. */
  read(timeoutMs?: number): Promise<Buffer> {
    if (this.closedHere) return Promise.reject(new FrameError("The connection closed."));
    // After the other side closes, what it sent first can still be read.
    const next = this.frames.shift();
    if (this.paused && this.frames.length < HIGH_WATER / 2) {
      this.paused = false;
      this.socket.resume();
    }
    if (next) return Promise.resolve(next);
    if (this.failure) return Promise.reject(this.failure);
    return new Promise((resolve, reject) => {
      const waiter: Waiter = { resolve, reject, timer: null };
      if (timeoutMs !== undefined) {
        waiter.timer = setTimeout(() => {
          const i = this.waiters.indexOf(waiter);
          if (i >= 0) this.waiters.splice(i, 1);
          reject(new FrameError("The other computer stopped answering."));
        }, timeoutMs);
      }
      this.waiters.push(waiter);
    });
  }

  /** Sends one message, waiting while the socket's buffer is full. */
  async write(frame: Uint8Array): Promise<void> {
    if (this.closedHere) throw new FrameError("The connection closed.");
    if (this.failure) throw this.failure;
    if (frame.length > MAX_MESSAGE) throw new FrameError("A message was larger than 65,535 bytes.");
    const header = Buffer.alloc(2);
    header.writeUInt16BE(frame.length, 0);
    const flushed = this.socket.write(Buffer.concat([header, frame]));
    if (!flushed) {
      await new Promise<void>((resolve, reject) => {
        const done = () => {
          this.socket.off("drain", done);
          this.socket.off("close", closed);
          resolve();
        };
        const closed = () => {
          this.socket.off("drain", done);
          reject(this.failure ?? new FrameError("The connection closed."));
        };
        this.socket.once("drain", done);
        this.socket.once("close", closed);
      });
    }
  }

  /** Closes after flushing what was already written (a last error or verdict), then makes sure the socket is gone. */
  close(): void {
    if (!this.closedHere) {
      this.closedHere = true;
      this.frames.length = 0;
      for (const waiter of this.waiters.splice(0)) {
        if (waiter.timer) clearTimeout(waiter.timer);
        waiter.reject(new FrameError("The connection closed."));
      }
    }
    if (this.socket.destroyed) return;
    this.socket.end();
    setTimeout(() => this.socket.destroy(), 1_000).unref();
  }
}
