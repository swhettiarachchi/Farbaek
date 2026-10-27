/**
 * The Farbaek Agent's side of Mesh's secure relay (ADR 0094). The relay is
 * a byte pipe through the Farbaek server the agent is paired with: this
 * file turns a relay session into a stream the Noise channel reads and
 * writes like a TCP socket, so the handshake, the offer, the BLAKE3 checks,
 * resume and the verified report all run exactly as nearby, end to end.
 *
 * Writes go out in batches of up to 2 MiB, each at its byte offset, so a
 * batch sent again after a lost answer is kept once. Reads are long polls
 * that say how much has arrived, which lets the server drop it. Requests go
 * only to the server's own origin, with the agent's token, over HTTPS.
 */
import { Duplex } from "node:stream";
import { z } from "zod";
import { checkServerUrl } from "../farbaek-client";

export type Fetcher = (url: string, init: RequestInit) => Promise<Response>;

const WRITE_BATCH = 2 * 1024 * 1024;
/** Bytes held for sending before writes wait. */
const OUTBOX_HIGH = 4 * 1024 * 1024;
const POLL_WAIT_S = 25;
const BACKOFF_MS = [250, 500, 1_000, 2_000, 4_000];
/** How long the stream keeps retrying an unanswered server before giving up. */
const GIVE_UP_MS = 60_000;

export class RelayError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "RelayError";
  }
}

const ErrorBody = z.object({ error: z.object({ code: z.string(), message: z.string() }) });
const Calls = z.object({
  data: z.object({ calls: z.array(z.object({ session: z.uuid(), from: z.string().regex(/^[0-9a-f]{16}$/), mode: z.enum(["relay", "direct", "pair"]).default("relay") })).max(20) }),
});
const Called = z.object({ data: z.object({ session: z.uuid() }) });
const Written = z.object({ data: z.object({ end: z.number().int().min(0), full: z.boolean() }) });

/** Fatal for a session: the server says it's gone, ended or out of step. */
const FATAL = new Set(["NOT_FOUND", "CLOSED", "GAP", "FORBIDDEN", "TOO_LARGE", "UNAUTHENTICATED"]);

export interface RelayCallView {
  session: string;
  from: string;
  mode: "relay" | "direct" | "pair";
}

/** Calls to the relay with the agent's token. */
export class RelayClient {
  private readonly origin: string;

  constructor(
    server: string,
    private readonly token: string,
    private readonly fetcher: Fetcher = fetch,
  ) {
    this.origin = checkServerUrl(server);
  }

  /** One request to the relay; an error answer becomes a RelayError with the server's words. */
  async request(path: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<Response> {
    let res: Response;
    try {
      res = await this.fetcher(`${this.origin}/api/v1/agent/relay${path}`, {
        ...init,
        redirect: "error",
        signal: AbortSignal.timeout(init.timeoutMs ?? 30_000),
        headers: { Authorization: `Bearer ${this.token}`, ...(init.headers ?? {}) },
      });
    } catch {
      throw new RelayError("UNAVAILABLE", "Farbaek's relay didn't answer. Check this computer's internet connection.");
    }
    if (res.ok) return res;
    const body = ErrorBody.safeParse(await res.json().catch(() => null));
    if (body.success) throw new RelayError(body.data.error.code, body.data.error.message);
    throw new RelayError(res.status >= 500 ? "UNAVAILABLE" : "INVALID", `Farbaek's relay answered ${res.status}.`);
  }

  private async post(path: string, body: unknown): Promise<unknown> {
    const res = await this.request(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return res.json().catch(() => null);
  }

  /** Turns "Reachable through Farbaek" on or off for this device's mesh key. */
  async setReachable(fingerprint: string, on: boolean): Promise<void> {
    await this.post("/presence", { fingerprint, on });
  }

  /** Waits for calls to this device. Polling is what keeps it reachable. */
  async waitForCalls(waitSeconds = POLL_WAIT_S): Promise<RelayCallView[]> {
    const res = await this.request(`/presence?wait=${waitSeconds}`, { method: "GET", timeoutMs: (waitSeconds + 15) * 1000 });
    const body = Calls.safeParse(await res.json().catch(() => null));
    if (!body.success) throw new RelayError("INVALID", "Farbaek's relay sent an answer that couldn't be read.");
    return body.data.data.calls;
  }

  /** Calls a reachable device of this workspace, to relay the files or to set up a direct link (ADR 0095). */
  async call(to: string, from: string, mode: "relay" | "direct" | "pair" = "relay"): Promise<string> {
    const body = Called.safeParse(await this.post("/calls", { to, from, mode }));
    if (!body.success) throw new RelayError("INVALID", "Farbaek's relay sent an answer that couldn't be read.");
    return body.data.data.session;
  }

  async join(session: string): Promise<void> {
    await this.post(`/sessions/${encodeURIComponent(session)}/join`, {});
  }

  /** Ends a session; best effort, since the server ends quiet sessions itself. */
  async close(session: string, reason: "done" | "cancelled"): Promise<void> {
    await this.request(`/sessions/${encodeURIComponent(session)}?reason=${reason}`, { method: "DELETE" }).catch(() => undefined);
  }

  /** The session as a byte stream. */
  open(session: string): RelayStream {
    return new RelayStream(this, session);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** A relay session as a duplex byte stream, in order and exactly once in each direction. */
export class RelayStream extends Duplex {
  private outbox: Buffer[] = [];
  private outboxBytes = 0;
  private sent = 0;
  private received = 0;
  private flushing: Promise<void> | null = null;
  private waitingForRoom: (() => void)[] = [];
  private polling = false;
  private wantMore = true;
  private finished = false;
  private stopped = false;

  constructor(
    private readonly client: RelayClient,
    readonly session: string,
  ) {
    super({ allowHalfOpen: false });
  }

  override _write(chunk: Buffer, _encoding: BufferEncoding, callback: (error?: Error | null) => void): void {
    this.outbox.push(Buffer.from(chunk));
    this.outboxBytes += chunk.length;
    this.flush();
    if (this.outboxBytes < OUTBOX_HIGH) callback();
    else this.waitingForRoom.push(() => callback());
  }

  override _final(callback: (error?: Error | null) => void): void {
    this.finished = true;
    void (async () => {
      try {
        await this.drain();
        await this.client.close(this.session, "done");
        callback();
      } catch (error) {
        callback(error as Error);
      }
    })();
  }

  override _read(): void {
    this.wantMore = true;
    if (!this.polling) void this.poll();
  }

  override _destroy(error: Error | null, callback: (error?: Error | null) => void): void {
    this.stopped = true;
    for (const resume of this.waitingForRoom.splice(0)) resume();
    if (!this.finished) void this.client.close(this.session, "cancelled");
    callback(error);
  }

  private async drain(): Promise<void> {
    while (this.outboxBytes > 0 && !this.stopped) await (this.flushing ?? this.flush());
  }

  private flush(): Promise<void> {
    this.flushing ??= (async () => {
      try {
        while (this.outboxBytes > 0 && !this.stopped) {
          const batch = this.takeBatch();
          await this.send(batch);
          this.sent += batch.length;
          this.outboxBytes -= batch.length;
          this.dropSent(batch.length);
          if (this.outboxBytes < OUTBOX_HIGH) for (const resume of this.waitingForRoom.splice(0)) resume();
        }
      } catch (error) {
        this.destroy(error as Error);
      } finally {
        this.flushing = null;
      }
    })();
    return this.flushing;
  }

  /** Up to 2 MiB from the front of the outbox, left in place until the server has it. */
  private takeBatch(): Buffer {
    const parts: Buffer[] = [];
    let size = 0;
    for (const b of this.outbox) {
      if (size >= WRITE_BATCH) break;
      const take = b.length <= WRITE_BATCH - size ? b : b.subarray(0, WRITE_BATCH - size);
      parts.push(take);
      size += take.length;
    }
    return parts.length === 1 ? parts[0]! : Buffer.concat(parts);
  }

  private dropSent(bytes: number): void {
    let left = bytes;
    while (left > 0 && this.outbox.length > 0) {
      const first = this.outbox[0]!;
      if (first.length <= left) {
        this.outbox.shift();
        left -= first.length;
      } else {
        this.outbox[0] = first.subarray(left);
        left = 0;
      }
    }
  }

  /** Sends one batch at its offset, again while the server is full or briefly unreachable. */
  private async send(batch: Buffer): Promise<void> {
    const since = Date.now();
    for (let attempt = 0; ; attempt++) {
      if (this.stopped) throw new RelayError("CLOSED", "The relayed connection closed.");
      try {
        const res = await this.client.request(`/sessions/${encodeURIComponent(this.session)}/data?offset=${this.sent}`, {
          method: "POST",
          headers: { "Content-Type": "application/octet-stream" },
          body: new Uint8Array(batch),
          timeoutMs: 45_000,
        });
        const body = Written.safeParse(await res.json().catch(() => null));
        if (!body.success) throw new RelayError("INVALID", "Farbaek's relay sent an answer that couldn't be read.");
        if (!body.data.data.full) return;
        // The other side is behind: the server waited already, so try again at once.
        attempt = -1;
      } catch (error) {
        if (error instanceof RelayError && FATAL.has(error.code)) throw error;
        if (Date.now() - since > GIVE_UP_MS) throw error;
        await sleep(BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length - 1)]!);
      }
    }
  }

  private async poll(): Promise<void> {
    this.polling = true;
    let since = Date.now();
    let attempt = 0;
    try {
      while (this.wantMore && !this.stopped) {
        let res: Response;
        try {
          res = await this.client.request(`/sessions/${encodeURIComponent(this.session)}/data?from=${this.received}&wait=${POLL_WAIT_S}`, { method: "GET", timeoutMs: (POLL_WAIT_S + 15) * 1000 });
        } catch (error) {
          // A session the server already cleaned up after the other side finished: the stream has ended.
          if (error instanceof RelayError && (error.code === "NOT_FOUND" || error.code === "CLOSED") && this.received > 0) {
            this.push(null);
            return;
          }
          if ((error instanceof RelayError && FATAL.has(error.code)) || Date.now() - since > GIVE_UP_MS) throw error;
          await sleep(BACKOFF_MS[Math.min(attempt++, BACKOFF_MS.length - 1)]!);
          continue;
        }
        since = Date.now();
        attempt = 0;
        const offset = Number(res.headers.get("x-relay-offset"));
        const bytes = Buffer.from(await res.arrayBuffer());
        if (offset !== this.received) throw new RelayError("GAP", "The relayed connection lost its place.");
        if (bytes.length > 0) {
          this.received += bytes.length;
          this.wantMore = this.push(bytes);
        }
        if (res.headers.get("x-relay-closed") === "1") {
          this.push(null);
          return;
        }
      }
    } catch (error) {
      this.destroy(error as Error);
    } finally {
      this.polling = false;
    }
  }
}
