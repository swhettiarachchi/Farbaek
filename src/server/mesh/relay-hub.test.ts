import { describe, expect, it } from "vitest";
import { RelayHub, type CloseReason, type RelayAgent } from "./relay-hub";

const A: RelayAgent = { agentId: "agent-a", orgId: "org-1" };
const B: RelayAgent = { agentId: "agent-b", orgId: "org-1" };
const C: RelayAgent = { agentId: "agent-c", orgId: "org-1" };
const STRANGER: RelayAgent = { agentId: "agent-x", orgId: "org-2" };
const FA = "aaaaaaaaaaaaaaaa";
const FB = "bbbbbbbbbbbbbbbb";

function hub(over: { allow?: boolean; limits?: ConstructorParameters<typeof RelayHub>[0]["limits"] } = {}) {
  let clock = 1_000_000;
  const charged: number[] = [];
  const ended: { bytes: number; reason: CloseReason }[] = [];
  const h = new RelayHub({
    now: () => clock,
    charge: async (_org, bytes) => (charged.push(bytes), over.allow ?? true),
    ended: async (i) => void ended.push({ bytes: i.bytes, reason: i.reason }),
    limits: over.limits,
  });
  return { h, charged, ended, tick: (ms: number) => (clock += ms) };
}

async function connected(h: RelayHub) {
  h.setReachable(B, FB);
  const call = h.call(A, FB, FA);
  if (!call.ok) throw new Error(call.message);
  const calls = await h.waitForCalls(B, 0);
  expect(calls).toEqual({ ok: true, value: [{ session: call.value.session, from: FA, mode: "relay" }] });
  expect(h.join(B, call.value.session)).toEqual({ ok: true, value: null });
  return call.value.session;
}

const read = async (h: RelayHub, agent: RelayAgent, id: string, from: number) => {
  const r = await h.read(agent, id, from, 0);
  if (!r.ok) throw new Error(r.message);
  return r.value;
};

describe("the relay hub", () => {
  it("passes bytes each way in order, keeps a retried write once, and refuses a gap", async () => {
    const { h } = hub();
    const id = await connected(h);
    expect(await h.write(A, id, 0, Buffer.from("hello "), 0)).toEqual({ ok: true, value: { end: 6, full: false } });
    // The same write again (a retry after a lost answer), then one that overlaps it.
    expect(await h.write(A, id, 0, Buffer.from("hello "), 0)).toEqual({ ok: true, value: { end: 6, full: false } });
    expect(await h.write(A, id, 3, Buffer.from("lo world"), 0)).toEqual({ ok: true, value: { end: 11, full: false } });
    expect(await h.write(A, id, 20, Buffer.from("x"), 0)).toMatchObject({ ok: false, code: "GAP" });
    const got = await read(h, B, id, 0);
    expect(got.bytes.toString()).toBe("hello world");
    await h.write(B, id, 0, Buffer.from("hi back"), 0);
    expect((await read(h, A, id, 0)).bytes.toString()).toBe("hi back");
  });

  it("drops what the reader acknowledges, and keeps nothing once a session ends", async () => {
    const { h, ended, tick } = hub();
    const id = await connected(h);
    await h.write(A, id, 0, Buffer.from("0123456789"), 0);
    expect((await read(h, B, id, 4)).bytes.toString()).toBe("456789");
    expect(h.stats().bufferedBytes).toBe(6);
    expect(await h.read(B, id, 2, 0)).toMatchObject({ ok: false, code: "GAP" });
    h.close(A, id, "done");
    // What was sent before the close can still be read, then the end.
    expect((await read(h, B, id, 4)).bytes.toString()).toBe("456789");
    expect(await read(h, B, id, 10)).toMatchObject({ closed: true });
    tick(6_000);
    expect(h.stats()).toEqual({ reachable: 1, sessions: 0, bufferedBytes: 0 });
    expect(await h.read(B, id, 10, 0)).toMatchObject({ ok: false, code: "NOT_FOUND" });
    expect(ended).toEqual([{ bytes: 10, reason: "done" }]);
  });

  it("holds at most the buffer in each direction, and makes room as the reader catches up", async () => {
    const { h } = hub({ limits: { bufferBytes: 8, writeBytes: 8 } });
    const id = await connected(h);
    expect(await h.write(A, id, 0, Buffer.from("12345678"), 0)).toMatchObject({ ok: true, value: { end: 8 } });
    expect(await h.write(A, id, 8, Buffer.from("9"), 0)).toEqual({ ok: true, value: { end: 8, full: true } });
    const waiting = h.write(A, id, 8, Buffer.from("9"), 1_000);
    await read(h, B, id, 8);
    expect(await waiting).toEqual({ ok: true, value: { end: 9, full: false } });
    expect(await h.write(A, id, 9, Buffer.alloc(9), 0)).toMatchObject({ ok: false, code: "TOO_LARGE" });
  });

  it("lets only one computer in a workspace be reachable with a fingerprint, so another member can't take its calls", () => {
    const { h } = hub();
    expect(h.setReachable(B, FB)).toEqual({ ok: true, value: null });
    expect(h.setReachable(C, FB)).toMatchObject({ ok: false, code: "FORBIDDEN" });
    // The same computer turning it on again is fine, and another workspace's fingerprints are its own.
    expect(h.setReachable(B, FB)).toEqual({ ok: true, value: null });
    expect(h.setReachable(STRANGER, FB)).toEqual({ ok: true, value: null });
    // Once the first computer turns it off, the fingerprint is free.
    h.setReachable(B, null);
    expect(h.setReachable(C, FB)).toEqual({ ok: true, value: null });
  });

  it("calls only a reachable agent of the same workspace, and only its two agents can use a session", async () => {
    const { h } = hub();
    expect(h.call(A, FB, FA)).toMatchObject({ ok: false, code: "NOT_REACHABLE" });
    h.setReachable(STRANGER, FB);
    expect(h.call(A, FB, FA)).toMatchObject({ ok: false, code: "NOT_REACHABLE" });
    expect(h.setReachable(B, "not-a-fingerprint")).toMatchObject({ ok: false, code: "FORBIDDEN" });
    const id = await connected(h);
    for (const outsider of [C, STRANGER]) {
      expect(await h.write(outsider, id, 0, Buffer.from("x"), 0)).toMatchObject({ ok: false, code: "NOT_FOUND" });
      expect(await h.read(outsider, id, 0, 0)).toMatchObject({ ok: false, code: "NOT_FOUND" });
      expect(h.join(outsider, id)).toMatchObject({ ok: false, code: "NOT_FOUND" });
    }
    // Only the called agent takes the call.
    expect(h.join(A, id)).toMatchObject({ ok: false, code: "NOT_FOUND" });
  });

  it("keeps to the workspace's and the server's number of sessions, and to the calls an agent can have waiting", async () => {
    const { h } = hub({ limits: { sessionsPerOrg: 2, pendingCalls: 2 } });
    h.setReachable(B, FB);
    expect(h.call(A, FB, FA).ok).toBe(true);
    expect(h.call(A, FB, FA).ok).toBe(true);
    expect(h.call(A, FB, FA)).toMatchObject({ ok: false, code: "BUSY", message: expect.stringMatching(/already has 2 relayed transfers/) });
    const total = hub({ limits: { sessionsTotal: 1 } });
    total.h.setReachable(B, FB);
    total.h.setReachable(STRANGER, FA);
    expect(total.h.call(A, FB, FA).ok).toBe(true);
    expect(total.h.call({ agentId: "agent-y", orgId: "org-2" }, FA, FB)).toMatchObject({ ok: false, code: "BUSY", message: expect.stringMatching(/relay is busy/) });
  });

  it("ends calls nobody takes, sessions where one side goes quiet, and reachability that isn't polled", async () => {
    const { h, tick, ended } = hub();
    h.setReachable(B, FB);
    const unanswered = h.call(A, FB, FA);
    tick(61_000);
    expect(h.stats().sessions).toBe(0);
    expect(h.call(A, FB, FA)).toMatchObject({ ok: false, code: "NOT_REACHABLE" });

    const second = hub();
    const id = await connected(second.h);
    second.tick(30_000);
    await read(second.h, A, id, 0);
    second.tick(31_000);
    await second.h.read(A, id, 0, 0);
    // B said nothing for 61 seconds.
    expect(await second.h.write(A, id, 0, Buffer.from("x"), 0)).toMatchObject({ ok: false, code: "CLOSED", message: expect.stringMatching(/stopped answering/) });
    expect(unanswered.ok && ended).toEqual([{ bytes: 0, reason: "unreachable" }]);
    expect(second.ended).toEqual([{ bytes: 0, reason: "unreachable" }]);
  });

  it("counts relayed bytes against the day, and closes the session when the allowance is spent", async () => {
    const { h, charged, ended } = hub({ allow: false, limits: { chargeEvery: 4 } });
    const id = await connected(h);
    await h.write(A, id, 0, Buffer.from("12345"), 0);
    await new Promise((r) => setTimeout(r, 0));
    expect(charged).toEqual([5]);
    expect(await h.write(A, id, 5, Buffer.from("6"), 0)).toMatchObject({ ok: false, code: "CLOSED", message: expect.stringMatching(/today's relay allowance/) });
    expect(ended).toEqual([{ bytes: 5, reason: "allowance" }]);
  });

  it("wakes a waiting reader as soon as bytes arrive, and a waiting agent as soon as it's called", async () => {
    const { h } = hub();
    h.setReachable(B, FB);
    const polling = h.waitForCalls(B, 5_000);
    const call = h.call(A, FB, FA);
    expect((await polling).ok && (await polling)).toMatchObject({ value: [{ from: FA }] });
    if (!call.ok) throw new Error();
    h.join(B, call.value.session);
    const waiting = h.read(B, call.value.session, 0, 5_000);
    await h.write(A, call.value.session, 0, Buffer.from("now"), 0);
    expect((await waiting).ok && (await waiting)).toMatchObject({ value: { bytes: Buffer.from("now") } });
    // Turning reachability off declines what was waiting.
    h.setReachable(B, FB);
    const later = h.call(A, FB, FA);
    h.setReachable(B, null);
    if (!later.ok) throw new Error();
    expect(h.join(B, later.value.session)).toMatchObject({ ok: false });
  });

  it("carries a call's mode, including a phone pairing", async () => {
    const { h } = hub();
    h.setReachable(B, FB);
    const call = h.call(A, FB, FA, "pair");
    expect(call.ok).toBe(true);
    expect(await h.waitForCalls(B, 0)).toMatchObject({ ok: true, value: [{ from: FA, mode: "pair" }] });
  });
});
