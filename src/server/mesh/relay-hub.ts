/**
 * Mesh's secure relay (spec §11, ADR 0094): two paired Farbaek Agents that
 * aren't on the same network send to each other through Farbaek's own
 * server. The server only passes bytes along. Each agent runs the same Noise
 * XX handshake it uses nearby, end to end through the pipe, so what crosses
 * here is ciphertext the server can't read, and each device still checks the
 * other's key against the devices its person paired on a local network.
 *
 * Each session is two byte streams with offsets, so a write retried over a
 * flaky connection is kept once and in order, and a read says how much was
 * received, which lets the server drop it. Nothing is written to disk:
 * bytes wait in memory, at most 8 MiB in each direction, only while both
 * agents are connected, and are gone when the session ends.
 *
 * Calls go only to an agent of the same workspace that turned on
 * "Reachable through Farbaek" and is polling now. The hub keeps no file
 * names or contents; the database records a day's relayed total for the
 * workspace's allowance and one audit event per session.
 */
import { randomUUID } from "node:crypto";

export const RELAY_LIMITS = {
  /** Bytes waiting in each direction of a session. */
  bufferBytes: 8 * 1024 * 1024,
  /** Bytes in one write. */
  writeBytes: 2 * 1024 * 1024,
  /** Calls waiting for one agent to answer. */
  pendingCalls: 5,
  callTtlMs: 60_000,
  /** An agent stops counting as reachable this long after its last poll. */
  presenceTtlMs: 60_000,
  /** A session ends when neither agent has asked for anything this long. */
  idleMs: 2 * 60_000,
  maxSessionMs: 6 * 60 * 60_000,
  sessionsPerOrg: 3,
  sessionsTotal: 20,
  /** Relayed bytes a workspace may use in a day, counted in the database. */
  dailyBytes: 5 * 1024 ** 3,
  /** How often relayed bytes are counted against the day. */
  chargeEvery: 8 * 1024 * 1024,
  /** The longest a read or a poll for calls waits for something to arrive. */
  waitMs: 25_000,
  /** The longest a write waits for room before the agent is told to try again. */
  writeWaitMs: 20_000,
} as const;

export type RelayLimits = { [K in keyof typeof RELAY_LIMITS]: number };

export type RelayErrorCode = "NOT_FOUND" | "FORBIDDEN" | "NOT_REACHABLE" | "BUSY" | "GAP" | "TOO_LARGE" | "CLOSED";
export type RelayResult<T> = { ok: true; value: T } | { ok: false; code: RelayErrorCode; message: string };

export interface RelayAgent {
  agentId: string;
  orgId: string;
}

export type CallMode = "relay" | "direct" | "pair";

export interface RelayCall {
  session: string;
  /** The caller's mesh fingerprint, as it said. Only a hint: the Noise handshake proves who it is. */
  from: string;
  /**
   * relay: the files go through this session. direct: it only sets up a
   * direct link (ADR 0095). pair: a phone or browser pairing with a computer
   * that opened a pairing window (ADR 0096).
   */
  mode: CallMode;
}

export type CloseReason = "done" | "cancelled" | "idle" | "expired" | "allowance" | "unreachable" | "declined";

export interface RelayHubDeps {
  /** Adds relayed bytes to the workspace's day, and says whether the day's allowance still holds. */
  charge(orgId: string, bytes: number): Promise<boolean>;
  /** One record per session, once it ends. */
  ended(info: { orgId: string; caller: string; callee: string; bytes: number; reason: CloseReason }): Promise<void>;
  now?: () => number;
  limits?: Partial<RelayLimits>;
}

const FINGERPRINT = /^[0-9a-f]{16}$/;

const CLOSED_WORDS: Record<CloseReason, string> = {
  done: "The transfer finished.",
  cancelled: "The other computer closed the connection.",
  idle: "Neither computer was heard from for two minutes, so the relay closed the connection.",
  expired: "A relayed connection lasts at most six hours.",
  allowance: "Your workspace has used today's relay allowance. Send nearby, or try again tomorrow.",
  unreachable: "The other computer stopped answering.",
  declined: "The other computer didn't take the call.",
};

/** One direction of a session: bytes from `start` to `end`, waiting to be read. */
class Pipe {
  private chunks: Buffer[] = [];
  start = 0;
  end = 0;

  get buffered(): number {
    return this.end - this.start;
  }

  append(bytes: Buffer): void {
    if (bytes.length === 0) return;
    this.chunks.push(bytes);
    this.end += bytes.length;
  }

  /** Drops everything before `offset`, which the reader says it holds. */
  acknowledge(offset: number): void {
    let drop = offset - this.start;
    while (drop > 0 && this.chunks.length > 0) {
      const first = this.chunks[0]!;
      if (first.length <= drop) {
        this.chunks.shift();
        drop -= first.length;
        this.start += first.length;
      } else {
        this.chunks[0] = first.subarray(drop);
        this.start += drop;
        drop = 0;
      }
    }
  }

  /** Up to `max` bytes from `start`. */
  peek(max: number): Buffer {
    const out: Buffer[] = [];
    let left = max;
    for (const c of this.chunks) {
      if (left <= 0) break;
      const take = c.length <= left ? c : c.subarray(0, left);
      out.push(take);
      left -= take.length;
    }
    return out.length === 1 ? Buffer.from(out[0]!) : Buffer.concat(out);
  }

  clear(): void {
    this.chunks = [];
    this.start = this.end;
  }
}

interface Session {
  id: string;
  orgId: string;
  caller: string;
  callee: string;
  joined: boolean;
  createdAt: number;
  lastActive: number;
  /** When each agent last asked for anything: one going quiet ends the session. */
  seen: { caller: number; callee: number };
  toCallee: Pipe;
  toCaller: Pipe;
  /** Set when either side closes or a limit ends it. What's buffered can still be read. */
  closed: CloseReason | null;
  relayed: number;
  uncharged: number;
  reported: boolean;
}

interface Presence {
  agent: RelayAgent;
  fingerprint: string;
  seenAt: number;
  calls: (RelayCall & { at: number })[];
}

type Waiter = () => void;

export class RelayHub {
  private readonly limits: RelayLimits;
  private readonly now: () => number;
  private readonly presence = new Map<string, Presence>();
  private readonly sessions = new Map<string, Session>();
  /** Who's waiting for what: an agent's calls, or a session's data or room. */
  private readonly waiters = new Map<string, Set<Waiter>>();

  constructor(private readonly deps: RelayHubDeps) {
    this.limits = { ...RELAY_LIMITS, ...deps.limits };
    this.now = deps.now ?? Date.now;
  }

  // Reachability

  /** Turns "Reachable through Farbaek" on (with this device's mesh fingerprint) or off. */
  setReachable(agent: RelayAgent, fingerprint: string | null): RelayResult<null> {
    if (fingerprint === null) {
      const was = this.presence.get(agent.agentId);
      this.presence.delete(agent.agentId);
      for (const call of was?.calls ?? []) this.end(call.session, "declined");
      this.wake(`calls:${agent.agentId}`);
      return { ok: true, value: null };
    }
    if (!FINGERPRINT.test(fingerprint)) return { ok: false, code: "FORBIDDEN", message: "That isn't a mesh device fingerprint." };
    // One computer per fingerprint: another agent in the workspace can't claim a reachable computer's fingerprint and take its calls.
    this.sweep();
    const taken = [...this.presence.values()].some((p) => p.agent.orgId === agent.orgId && p.fingerprint === fingerprint && p.agent.agentId !== agent.agentId);
    if (taken) return { ok: false, code: "FORBIDDEN", message: "Another computer in this workspace is already reachable with that fingerprint." };
    const existing = this.presence.get(agent.agentId);
    this.presence.set(agent.agentId, { agent, fingerprint, seenAt: this.now(), calls: existing?.fingerprint === fingerprint ? existing.calls : [] });
    return { ok: true, value: null };
  }

  /** Waits for calls to this agent, at most `waitMs`. Polling is what keeps it reachable. */
  async waitForCalls(agent: RelayAgent, waitMs: number = this.limits.waitMs): Promise<RelayResult<RelayCall[]>> {
    this.sweep();
    const p = this.presence.get(agent.agentId);
    if (!p || p.agent.orgId !== agent.orgId) return { ok: false, code: "NOT_REACHABLE", message: "Turn on Reachable through Farbaek first." };
    p.seenAt = this.now();
    if (p.calls.length === 0) await this.wait(`calls:${agent.agentId}`, waitMs);
    const current = this.presence.get(agent.agentId);
    if (!current) return { ok: true, value: [] };
    current.seenAt = this.now();
    const calls = current.calls.splice(0).map(({ session, from, mode }) => ({ session, from, mode }));
    return { ok: true, value: calls };
  }

  // Sessions

  /** Calls the reachable agent of this workspace with that fingerprint. */
  call(agent: RelayAgent, to: string, from: string, mode: CallMode = "relay"): RelayResult<{ session: string }> {
    this.sweep();
    if (!FINGERPRINT.test(to) || !FINGERPRINT.test(from)) return { ok: false, code: "FORBIDDEN", message: "That isn't a mesh device fingerprint." };
    const target = [...this.presence.values()].find((p) => p.agent.orgId === agent.orgId && p.fingerprint === to && p.agent.agentId !== agent.agentId);
    if (!target) return { ok: false, code: "NOT_REACHABLE", message: "That computer isn't reachable through Farbaek now. On it, open Nearby and turn on Reachable through Farbaek, and keep the app open." };
    const open = [...this.sessions.values()].filter((s) => !s.closed);
    if (open.length >= this.limits.sessionsTotal) return { ok: false, code: "BUSY", message: "The relay is busy right now. Try again in a few minutes." };
    if (open.filter((s) => s.orgId === agent.orgId).length >= this.limits.sessionsPerOrg) return { ok: false, code: "BUSY", message: `Your workspace already has ${this.limits.sessionsPerOrg} relayed transfers going. Wait for one to finish.` };
    if (target.calls.length >= this.limits.pendingCalls) return { ok: false, code: "BUSY", message: "That computer has calls waiting already. Try again in a minute." };
    const now = this.now();
    const session: Session = {
      id: randomUUID(),
      orgId: agent.orgId,
      caller: agent.agentId,
      callee: target.agent.agentId,
      joined: false,
      createdAt: now,
      lastActive: now,
      seen: { caller: now, callee: now },
      toCallee: new Pipe(),
      toCaller: new Pipe(),
      closed: null,
      relayed: 0,
      uncharged: 0,
      reported: false,
    };
    this.sessions.set(session.id, session);
    target.calls.push({ session: session.id, from, mode, at: now });
    this.wake(`calls:${target.agent.agentId}`);
    return { ok: true, value: { session: session.id } };
  }

  /** The called agent takes the call. */
  join(agent: RelayAgent, id: string): RelayResult<null> {
    this.sweep();
    const s = this.sessions.get(id);
    if (!s || s.orgId !== agent.orgId || s.callee !== agent.agentId) return { ok: false, code: "NOT_FOUND", message: "That call isn't waiting any more." };
    if (s.closed) return { ok: false, code: "CLOSED", message: CLOSED_WORDS[s.closed] };
    s.joined = true;
    s.lastActive = this.now();
    s.seen.callee = s.lastActive;
    this.wake(`data:${s.id}`);
    return { ok: true, value: null };
  }

  private party(agent: RelayAgent, id: string): RelayResult<{ s: Session; out: Pipe; in: Pipe }> {
    const s = this.sessions.get(id);
    if (!s || s.orgId !== agent.orgId || (s.caller !== agent.agentId && s.callee !== agent.agentId)) return { ok: false, code: "NOT_FOUND", message: "That relayed connection doesn't exist." };
    const isCaller = s.caller === agent.agentId;
    return { ok: true, value: { s, out: isCaller ? s.toCallee : s.toCaller, in: isCaller ? s.toCaller : s.toCallee } };
  }

  /**
   * Adds bytes at `offset` to this agent's outgoing stream. Bytes the server
   * already holds (a retried write) are kept once; a gap is refused. Waits
   * up to `waitMs` for room, then says to try again.
   */
  async write(agent: RelayAgent, id: string, offset: number, bytes: Buffer, waitMs: number = this.limits.writeWaitMs): Promise<RelayResult<{ end: number; full: boolean }>> {
    this.sweep();
    if (bytes.length > this.limits.writeBytes) return { ok: false, code: "TOO_LARGE", message: "Send at most 2 MiB at a time." };
    const found = this.party(agent, id);
    if (!found.ok) return found;
    const { s, out } = found.value;
    if (s.closed) return { ok: false, code: "CLOSED", message: CLOSED_WORDS[s.closed] };
    s.lastActive = this.now();
    s.seen[s.caller === agent.agentId ? "caller" : "callee"] = s.lastActive;
    if (!Number.isSafeInteger(offset) || offset < 0 || offset > out.end) return { ok: false, code: "GAP", message: "Bytes arrived out of order. Start the transfer again." };
    // Only what the server doesn't hold yet.
    const fresh = bytes.subarray(Math.min(bytes.length, out.end - offset));
    if (fresh.length === 0) return { ok: true, value: { end: out.end, full: false } };
    if (out.buffered + fresh.length > this.limits.bufferBytes) {
      await this.wait(`room:${s.id}:${s.caller === agent.agentId ? "callee" : "caller"}`, waitMs);
      if (s.closed) return { ok: false, code: "CLOSED", message: CLOSED_WORDS[s.closed] };
      if (out.buffered + fresh.length > this.limits.bufferBytes || offset > out.end) return { ok: true, value: { end: out.end, full: true } };
      return this.write(agent, id, offset, bytes, 0);
    }
    out.append(Buffer.from(fresh));
    s.lastActive = this.now();
    s.relayed += fresh.length;
    s.uncharged += fresh.length;
    if (s.uncharged >= this.limits.chargeEvery) this.charge(s);
    this.wake(`data:${s.id}`);
    return { ok: true, value: { end: out.end, full: false } };
  }

  /**
   * Bytes for this agent from `from`, which also says it holds everything
   * before. Waits up to `waitMs` when there's nothing yet. `closed` is set
   * once the stream has ended and every byte was handed over.
   */
  async read(agent: RelayAgent, id: string, from: number, waitMs: number = this.limits.waitMs): Promise<RelayResult<{ offset: number; bytes: Buffer; closed: boolean; joined: boolean }>> {
    this.sweep();
    const found = this.party(agent, id);
    if (!found.ok) return found;
    const { s, in: pipe } = found.value;
    // Polling counts as being there: a person deciding whether to accept isn't idle.
    if (!s.closed) {
      s.lastActive = this.now();
      s.seen[s.caller === agent.agentId ? "caller" : "callee"] = s.lastActive;
    }
    if (!Number.isSafeInteger(from) || from < pipe.start || from > pipe.end) return { ok: false, code: "GAP", message: "The connection lost its place. Start the transfer again." };
    if (from > pipe.start) {
      pipe.acknowledge(from);
      s.lastActive = this.now();
      this.wake(`room:${s.id}:${pipe === s.toCallee ? "callee" : "caller"}`);
    }
    if (pipe.buffered === 0 && !s.closed) {
      await this.wait(`data:${s.id}`, waitMs);
      // A close or a sweep may have ended it while waiting.
      if (!this.sessions.has(id)) return { ok: true, value: { offset: from, bytes: Buffer.alloc(0), closed: true, joined: s.joined } };
    }
    const bytes = pipe.peek(this.limits.writeBytes);
    if (bytes.length > 0) s.lastActive = this.now();
    return { ok: true, value: { offset: pipe.start, bytes, closed: s.closed !== null && bytes.length === 0, joined: s.joined } };
  }

  /** Either agent ends the session. What's already buffered can still be read. */
  close(agent: RelayAgent, id: string, reason: CloseReason = "cancelled"): RelayResult<null> {
    const found = this.party(agent, id);
    if (!found.ok) return found;
    this.end(id, reason);
    return { ok: true, value: null };
  }

  /** Whether this agent is polling for calls now, so a paired computer could reach it. */
  isReachable(agentId: string): boolean {
    this.sweep();
    return this.presence.has(agentId);
  }

  /** What the server holds now: for health checks and tests, never contents. */
  stats(): { reachable: number; sessions: number; bufferedBytes: number } {
    this.sweep();
    const open = [...this.sessions.values()];
    return { reachable: this.presence.size, sessions: open.filter((s) => !s.closed).length, bufferedBytes: open.reduce((n, s) => n + s.toCallee.buffered + s.toCaller.buffered, 0) };
  }

  /** Ends sessions, calls and presence past their limits. Runs on every request; nothing needs a timer. */
  sweep(): void {
    const now = this.now();
    for (const [agentId, p] of this.presence) {
      p.calls = p.calls.filter((c) => {
        const fresh = now - c.at < this.limits.callTtlMs;
        if (!fresh) this.end(c.session, "unreachable");
        return fresh;
      });
      if (now - p.seenAt >= this.limits.presenceTtlMs) {
        this.presence.delete(agentId);
        for (const c of p.calls) this.end(c.session, "unreachable");
      }
    }
    for (const s of this.sessions.values()) {
      if (!s.closed) {
        if (now - s.createdAt >= this.limits.maxSessionMs) this.end(s.id, "expired");
        else if (now - s.lastActive >= this.limits.idleMs) this.end(s.id, "idle");
        else if (!s.joined && now - s.createdAt >= this.limits.callTtlMs) this.end(s.id, "unreachable");
        else if (s.joined && (now - s.seen.caller >= this.limits.presenceTtlMs || now - s.seen.callee >= this.limits.presenceTtlMs)) this.end(s.id, "unreachable");
      }
      // A closed session lingers only until both sides could read its end; then nothing of it is kept.
      if (s.closed && (now - s.lastActive >= this.limits.callTtlMs || (s.toCallee.buffered === 0 && s.toCaller.buffered === 0 && now - s.lastActive >= 5_000))) {
        s.toCallee.clear();
        s.toCaller.clear();
        this.sessions.delete(s.id);
      }
    }
  }

  private end(id: string, reason: CloseReason): void {
    const s = this.sessions.get(id);
    if (!s || s.closed) return;
    s.closed = reason;
    s.lastActive = this.now();
    this.wake(`data:${s.id}`);
    this.wake(`room:${s.id}:callee`);
    this.wake(`room:${s.id}:caller`);
    if (s.uncharged > 0) this.charge(s);
    if (!s.reported) {
      s.reported = true;
      void this.deps.ended({ orgId: s.orgId, caller: s.caller, callee: s.callee, bytes: s.relayed, reason }).catch(() => undefined);
    }
  }

  private charge(s: Session): void {
    const bytes = s.uncharged;
    s.uncharged = 0;
    void this.deps
      .charge(s.orgId, bytes)
      .then((allowed) => {
        if (!allowed) this.end(s.id, "allowance");
      })
      // If the count can't be kept, the relay doesn't carry on uncounted.
      .catch(() => this.end(s.id, "allowance"));
  }

  private wait(key: string, ms: number): Promise<void> {
    if (ms <= 0) return Promise.resolve();
    return new Promise((resolve) => {
      const set = this.waiters.get(key) ?? new Set<Waiter>();
      const done = () => {
        clearTimeout(timer);
        set.delete(done);
        if (set.size === 0) this.waiters.delete(key);
        resolve();
      };
      const timer = setTimeout(done, ms);
      set.add(done);
      this.waiters.set(key, set);
    });
  }

  private wake(key: string): void {
    for (const done of [...(this.waiters.get(key) ?? [])]) done();
  }
}

export const closedWords = (reason: CloseReason) => CLOSED_WORDS[reason];
