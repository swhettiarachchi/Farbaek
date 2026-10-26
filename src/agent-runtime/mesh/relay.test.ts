import { randomBytes } from "node:crypto";
import type { Duplex } from "node:stream";
import { describe, expect, it } from "vitest";
import { RelayError } from "./relay";
import { fakeRelay } from "./relay-fake";

const FA = "aaaaaaaaaaaaaaaa";
const FB = "bbbbbbbbbbbbbbbb";

/** Two agents of one workspace, with a session between them. */
async function connected(relay: ReturnType<typeof fakeRelay>) {
  const a = relay.client("agent-a");
  const b = relay.client("agent-b");
  await b.setReachable(FB, true);
  const session = await a.call(FB, FA);
  const calls = await b.waitForCalls(1);
  expect(calls).toEqual([{ session, from: FA, mode: "relay" }]);
  await b.join(session);
  return { a: a.open(session), b: b.open(session) };
}

/** Everything a stream delivers until it ends. */
function collect(stream: Duplex): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const parts: Buffer[] = [];
    stream.on("data", (c: Buffer) => parts.push(c));
    stream.on("end", () => resolve(Buffer.concat(parts)));
    stream.on("error", reject);
  });
}

describe("the relay stream", { timeout: 30_000 }, () => {
  it("carries bytes each way in order, and ends for both when one side finishes", async () => {
    const relay = fakeRelay();
    const { a, b } = await connected(relay);
    b.write(Buffer.from("ready"));
    const hello = await new Promise<Buffer>((resolve) => a.once("data", resolve));
    expect(hello.toString()).toBe("ready");
    const payload = randomBytes(5 * 1024 * 1024 + 17);
    const atB = collect(b);
    a.on("error", () => undefined);
    // Written in pieces, as the Noise channel does, then finished.
    for (let i = 0; i < payload.length; i += 60 * 1024) a.write(payload.subarray(i, i + 60 * 1024));
    a.end();
    expect(Buffer.compare(await atB, payload)).toBe(0);
  });

  it("keeps every byte once and in order when requests get lost, and when the reader falls behind", async () => {
    const relay = fakeRelay({ failEvery: 5, limits: { bufferBytes: 2 * 1024 * 1024 } });
    const { a, b } = await connected(relay);
    const payload = randomBytes(6 * 1024 * 1024);
    const atB = collect(b);
    a.end(payload);
    expect(Buffer.compare(await atB, payload)).toBe(0);
    expect(relay.hub.stats().bufferedBytes).toBe(0);
  });

  it("keeps every byte once when the server did the work but its answer was lost", async () => {
    const relay = fakeRelay({ loseAnswersEvery: 3 });
    const { a, b } = await connected(relay);
    const payload = randomBytes(7 * 1024 * 1024 + 5);
    const atB = collect(b);
    a.end(payload);
    expect(Buffer.compare(await atB, payload)).toBe(0);
  });

  it("says plainly when the other computer isn't reachable, and refuses a stranger's session", async () => {
    const relay = fakeRelay();
    const a = relay.client("agent-a");
    await expect(a.call(FB, FA)).rejects.toThrow(RelayError);
    await expect(a.call(FB, FA)).rejects.toThrow(/isn't reachable through Farbaek now/);
    const { b } = await connected(relay);
    const stranger = relay.client("agent-x", "org-2");
    const theirs = stranger.open((b as unknown as { session: string }).session);
    await expect(collect(theirs)).rejects.toThrow(/doesn't exist/);
  });
});
