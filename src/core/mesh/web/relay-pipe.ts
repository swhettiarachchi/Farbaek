/**
 * Farbaek's relay from a browser (ADR 0096): the agent's offset protocol
 * (src/agent-runtime/mesh/relay.ts) over fetch. A browser reaches it at
 * /api/v1/mesh/relay with the person's own session, and says which of their
 * browsers it is with a device id. Writes go in batches at byte offsets, so
 * one sent again after a lost answer is kept once; reads are long polls that
 * say how much has arrived.
 */
import { z } from "zod";
import type { BytePipe } from "./wire";

const WRITE_BATCH = 2 * 1024 * 1024;
const OUTBOX_HIGH = 4 * 1024 * 1024;
const POLL_WAIT_S = 25;
const BACKOFF_MS = [250, 500, 1_000, 2_000, 4_000];
const GIVE_UP_MS = 60_000;
const FATAL = new Set(["NOT_FOUND", "CLOSED", "GAP", "FORBIDDEN", "TOO_LARGE", "UNAUTHENTICATED"]);

export class WebRelayError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "WebRelayError";
  }
}

export interface RelayEndpoint {
  /** Where the relay's routes start, e.g. https://www.farbaek.com/api/v1/mesh/relay. */
  base: string;
  /** Sent with every request: the device id, and for an agent its token. */
  headers: Record<string, string>;
  fetcher?: (url: string, init: RequestInit) => Promise<Response>;
}

const ErrorBody = z.object({ error: z.object({ code: z.string(), message: z.string() }) });
const Called = z.object({ data: z.object({ session: z.uuid() }) });
const Calls = z.object({
  data: z.object({ calls: z.array(z.object({ session: z.uuid(), from: z.string().regex(/^[0-9a-f]{16}$/), mode: z.enum(["relay", "direct", "pair"]).default("relay") })).max(20) }),
});
const Written = z.object({ data: z.object({ end: z.number().int().min(0), full: z.boolean() }) });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class WebRelay {
  constructor(private readonly endpoint: RelayEndpoint) {}

  async request(path: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<Response> {
    let res: Response;
    try {
      res = await (this.endpoint.fetcher ?? fetch)(`${this.endpoint.base}${path}`, {
        ...init,
        credentials: "same-origin",
        // The relay never redirects; a redirect is the app sending a signed-out browser to sign in.
        redirect: "manual",
        signal: AbortSignal.timeout(init.timeoutMs ?? 30_000),
        headers: { ...this.endpoint.headers, ...(init.headers as Record<string, string> | undefined) },
      });
    } catch {
      throw new WebRelayError("UNAVAILABLE", "Farbaek couldn't be reached. Check this device's internet connection.");
    }
    if (res.type === "opaqueredirect" || (res.status >= 300 && res.status < 400)) throw new WebRelayError("UNAUTHENTICATED", "You're signed out. Sign in again, then try again.");
    if (res.ok) return res;
    const body = ErrorBody.safeParse(await res.json().catch(() => null));
    if (body.success) throw new WebRelayError(body.data.error.code, body.data.error.message);
    throw new WebRelayError(res.status >= 500 ? "UNAVAILABLE" : "INVALID", `Farbaek answered ${res.status}.`);
  }

  /** Calls a computer of this workspace that's reachable now, by its device fingerprint. */
  async call(to: string, from: string, mode: "relay" | "direct" | "pair"): Promise<string> {
    const res = await this.request("/calls", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ to, from, mode }) });
    const body = Called.safeParse(await res.json().catch(() => null));
    if (!body.success) throw new WebRelayError("INVALID", "Farbaek's answer couldn't be read.");
    return body.data.data.session;
  }

  /** Turns this browser's reachability on (with its device fingerprint) or off. */
  async setReachable(fingerprint: string, on: boolean): Promise<void> {
    await this.request("/presence", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fingerprint, on }) });
  }

  /** Waits for computers calling this browser. Polling is what keeps it reachable. */
  async waitForCalls(waitSeconds = POLL_WAIT_S): Promise<{ session: string; from: string; mode: "relay" | "direct" | "pair" }[]> {
    const res = await this.request(`/presence?wait=${waitSeconds}`, { method: "GET", timeoutMs: (waitSeconds + 15) * 1000 });
    const body = Calls.safeParse(await res.json().catch(() => null));
    if (!body.success) throw new WebRelayError("INVALID", "Farbaek's answer couldn't be read.");
    return body.data.data.calls;
  }

  async join(session: string): Promise<void> {
    await this.request(`/sessions/${encodeURIComponent(session)}/join`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
  }

  async close(session: string, reason: "done" | "cancelled"): Promise<void> {
    await this.request(`/sessions/${encodeURIComponent(session)}?reason=${reason}`, { method: "DELETE" }).catch(() => undefined);
  }

  /** The session as a byte pipe. */
  open(session: string): RelayPipe {
    return new RelayPipe(this, session);
  }
}

/** A relay session as bytes in order, exactly once, each way. */
export class RelayPipe implements BytePipe {
  private outbox: Uint8Array[] = [];
  private outboxBytes = 0;
  private sent = 0;
  private received = 0;
  private flushing: Promise<void> | null = null;
  private failure: Error | null = null;
  private ended = false;
  private closing = false;
  private roomWaiters: (() => void)[] = [];

  constructor(
    private readonly relay: WebRelay,
    readonly session: string,
  ) {}

  async write(bytes: Uint8Array): Promise<void> {
    if (this.failure) throw this.failure;
    if (this.closing) throw new WebRelayError("CLOSED", "The connection closed.");
    this.outbox.push(new Uint8Array(bytes));
    this.outboxBytes += bytes.length;
    void this.flush();
    while (this.outboxBytes >= OUTBOX_HIGH && !this.failure) await new Promise<void>((r) => this.roomWaiters.push(r));
    if (this.failure) throw this.failure;
  }

  private flush(): Promise<void> {
    this.flushing ??= (async () => {
      try {
        while (this.outboxBytes > 0 && !this.failure) {
          const batch = this.takeBatch();
          await this.send(batch);
          this.sent += batch.length;
          this.outboxBytes -= batch.length;
          this.drop(batch.length);
          if (this.outboxBytes < OUTBOX_HIGH) for (const r of this.roomWaiters.splice(0)) r();
        }
      } catch (error) {
        this.fail(error as Error);
      } finally {
        this.flushing = null;
      }
    })();
    return this.flushing;
  }

  private takeBatch(): Uint8Array {
    const parts: Uint8Array[] = [];
    let size = 0;
    for (const b of this.outbox) {
      if (size >= WRITE_BATCH) break;
      const take = b.length <= WRITE_BATCH - size ? b : b.subarray(0, WRITE_BATCH - size);
      parts.push(take);
      size += take.length;
    }
    const out = new Uint8Array(size);
    let at = 0;
    for (const p of parts) {
      out.set(p, at);
      at += p.length;
    }
    return out;
  }

  private drop(bytes: number): void {
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

  private async send(batch: Uint8Array): Promise<void> {
    const since = Date.now();
    for (let attempt = 0; ; attempt++) {
      try {
        const res = await this.relay.request(`/sessions/${encodeURIComponent(this.session)}/data?offset=${this.sent}`, {
          method: "POST",
          headers: { "Content-Type": "application/octet-stream" },
          body: new Uint8Array(batch),
          timeoutMs: 45_000,
        });
        const body = Written.safeParse(await res.json().catch(() => null));
        if (!body.success) throw new WebRelayError("INVALID", "Farbaek's answer couldn't be read.");
        if (!body.data.data.full) return;
        attempt = -1;
      } catch (error) {
        if (error instanceof WebRelayError && FATAL.has(error.code)) throw error;
        if (Date.now() - since > GIVE_UP_MS) throw error;
        await sleep(BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length - 1)]!);
      }
    }
  }

  async read(): Promise<Uint8Array | null> {
    if (this.ended) return null;
    const since = Date.now();
    for (let attempt = 0; ; ) {
      if (this.failure) throw this.failure;
      let res: Response;
      try {
        res = await this.relay.request(`/sessions/${encodeURIComponent(this.session)}/data?from=${this.received}&wait=${POLL_WAIT_S}`, { method: "GET", timeoutMs: (POLL_WAIT_S + 15) * 1000 });
      } catch (error) {
        // A session already cleaned up after the other side finished: the stream has ended.
        if (error instanceof WebRelayError && (error.code === "NOT_FOUND" || error.code === "CLOSED") && this.received > 0) {
          this.ended = true;
          return null;
        }
        if ((error instanceof WebRelayError && FATAL.has(error.code)) || Date.now() - since > GIVE_UP_MS) {
          this.fail(error as Error);
          throw error;
        }
        await sleep(BACKOFF_MS[Math.min(attempt++, BACKOFF_MS.length - 1)]!);
        continue;
      }
      const offset = Number(res.headers.get("x-relay-offset"));
      const bytes = new Uint8Array(await res.arrayBuffer());
      if (offset !== this.received) {
        const gap = new WebRelayError("GAP", "The connection lost its place.");
        this.fail(gap);
        throw gap;
      }
      if (bytes.length > 0) {
        this.received += bytes.length;
        return bytes;
      }
      if (res.headers.get("x-relay-closed") === "1") {
        this.ended = true;
        return null;
      }
    }
  }

  close(): void {
    if (this.closing) return;
    this.closing = true;
    void (async () => {
      while (this.outboxBytes > 0 && !this.failure) await (this.flushing ?? this.flush());
      await this.relay.close(this.session, this.failure ? "cancelled" : "done");
    })();
  }

  private fail(error: Error): void {
    this.failure ??= error;
    for (const r of this.roomWaiters.splice(0)) r();
  }
}
