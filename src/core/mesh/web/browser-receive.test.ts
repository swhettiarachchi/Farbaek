/**
 * A Farbaek Agent sending to a phone or browser (ADR 0097), end to end: a
 * real MeshNode through the real relay hub to the browser's own listener,
 * receiver and file sink. Also a sender that lies, to show the browser keeps
 * nothing that doesn't match and refuses what it never paired with.
 */
import { randomBytes, randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { duplexPair, type Duplex } from "node:stream";
import { afterEach, describe, expect, it } from "vitest";
import { initiate } from "@/agent-runtime/mesh/channel";
import { SignalChannel } from "@/agent-runtime/mesh/direct-signal";
import { MeshNode } from "@/agent-runtime/mesh/node";
import { fingerprint, generateKeyPair } from "@/agent-runtime/mesh/noise";
import { fakeRelay } from "@/agent-runtime/mesh/relay-fake";
import { manifestDigest } from "@/core/mesh/capsule";
import { SignalLines } from "./direct";
import { WebMeshListener, type TrustedComputer } from "./listen";
import { generateWebKeyPair, webFingerprint, type WebKeyPair } from "./noise";
import { packPicked } from "./pack";
import { WebPairing } from "./pair";
import type { WebIncoming } from "./receive";
import { WebRelay } from "./relay-pipe";
import { memorySink } from "./sinks";
import { initiateWeb, type BytePipe } from "./wire";

const tmp = (name: string) => fs.mkdtemp(path.join(os.tmpdir(), `farbaek-webrx-${name}-`));
const cleanup: (() => Promise<void>)[] = [];
afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((c) => c()));
});

async function until(check: () => boolean | Promise<boolean>, ms = 15_000): Promise<void> {
  const end = Date.now() + ms;
  while (!(await check())) {
    if (Date.now() > end) throw new Error("Timed out waiting");
    await new Promise((r) => setTimeout(r, 10));
  }
}

/** A Node stream as a browser byte pipe, for a stand-in direct link. */
function pipeOf(stream: Duplex): BytePipe {
  const queue: Uint8Array[] = [];
  const waiters: ((b: Uint8Array | null) => void)[] = [];
  let ended = false;
  stream.on("data", (b: Buffer) => {
    const w = waiters.shift();
    if (w) w(new Uint8Array(b));
    else queue.push(new Uint8Array(b));
  });
  const end = () => {
    ended = true;
    for (const w of waiters.splice(0)) w(null);
  };
  stream.on("end", end);
  stream.on("close", end);
  return {
    write: (bytes) => new Promise((resolve, reject) => stream.write(Buffer.from(bytes), (e) => (e ? reject(e) : resolve()))),
    read: () => (queue.length > 0 ? Promise.resolve(queue.shift()!) : ended ? Promise.resolve(null) : new Promise((r) => waiters.push(r))),
    close: () => void stream.end(),
  };
}

/** A direct link without WebRTC: the offer and answer really cross the relay session, then both get an in-memory stream. */
function standInDirect() {
  const links = new Map<string, Duplex>();
  return {
    async computer(signal: Duplex, role: "offer" | "answer"): Promise<Duplex> {
      if (role !== "offer") throw new Error("The computer only calls here.");
      const channel = new SignalChannel(signal);
      const id = randomUUID();
      const [mine, theirs] = duplexPair();
      links.set(id, theirs);
      channel.send({ t: "sdp", type: "offer", sdp: id });
      await channel.next(5_000);
      channel.close();
      return mine;
    },
    async browser(signal: BytePipe): Promise<BytePipe> {
      const lines = new SignalLines(signal);
      const offer = await lines.next();
      if (offer?.t !== "sdp") throw new Error("No offer arrived.");
      await lines.send({ t: "sdp", type: "answer", sdp: "stand-in" });
      return pipeOf(links.get(offer.sdp)!);
    },
  };
}

async function setup() {
  const relay = fakeRelay();
  const direct = standInDirect();
  let vault: string | null = null;
  const computer = new MeshNode({
    dataDir: await tmp("computer"),
    name: () => "Studio PC",
    vault: { get: async () => vault, set: async (v) => void (vault = v) },
    discovery: false,
    relay: () => relay.client("agent-studio"),
    direct: (signal, role) => direct.computer(signal, role),
    onUpdate: () => undefined,
  });
  await computer.init();
  cleanup.push(() => computer.close());
  await computer.setReachable(true);
  relay.client("browser-phone");
  const web = new WebRelay({ base: "http://localhost:3000/api/v1/agent/relay", headers: { Authorization: "Bearer token-browser-phone" }, fetcher: relay.fetcher });
  const key = await generateWebKeyPair();
  const me = await webFingerprint(key.publicKey);
  const trusted: TrustedComputer[] = [];
  const incoming: WebIncoming[] = [];
  const listener = new WebMeshListener({
    relay: web,
    key,
    fingerprint: me,
    name: () => "Suvin's phone",
    trusted: async () => trusted,
    iceServers: [],
    onIncoming: (i) => incoming.push(i),
    onUpdate: () => undefined,
    answerDirect: (signal) => direct.browser(signal),
    backoffMs: () => 20,
  });
  cleanup.push(() => listener.setReachable(false));
  return { relay, computer, web, key, me, trusted, incoming, listener };
}

async function pairPhone({ computer, web, key, me, trusted }: { computer: MeshNode; web: WebRelay; key: WebKeyPair; me: string; trusted: TrustedComputer[] }): Promise<void> {
  computer.openRelayPairing();
  const session = await web.call(computer.fingerprint, me, "pair");
  const channel = await initiateWeb(web.open(session), key, { v: 1, name: "Suvin's phone", purpose: "pair" }, 10_000);
  const pairing = await WebPairing.start(channel, () => undefined, async (c) => void trusted.push(c));
  await until(() => computer.snapshot().pairing?.state === "confirming");
  await computer.confirmPairing(true);
  await pairing.confirm(true);
  await until(() => pairing.state === "paired");
}

async function folder(files: Record<string, Buffer | string>): Promise<string> {
  const root = await tmp("src");
  for (const [rel, content] of Object.entries(files)) {
    await fs.mkdir(path.dirname(path.join(root, rel)), { recursive: true });
    await fs.writeFile(path.join(root, rel), content);
  }
  return root;
}

const outgoing = (computer: MeshNode, id: string) => computer.snapshot().transfers.find((t) => t.id === id);

describe("a Farbaek Agent sending to a phone or browser", { timeout: 60_000 }, () => {
  it("delivers a folder through the relay; the browser checks every byte and the relay carries nothing readable", async () => {
    const s = await setup();
    await pairPhone(s);
    await s.listener.setReachable(true);
    const photo = randomBytes(5 * 1024 * 1024 + 3);
    const note = "the plan for Thursday\n";
    const prepared = await s.computer.prepare(await folder({ "plans/notes.txt": note, "photo.jpg": photo, "empty.txt": "" }));
    const phone = s.computer.snapshot().devices[0]!;
    const id = s.computer.sendOverInternet(prepared.id, phone.fingerprint, "relay");

    await until(() => s.incoming.length === 1);
    const incoming = s.incoming[0]!;
    await until(() => incoming.view().peer.fingerprint !== "");
    expect(incoming.view()).toMatchObject({ state: "offered", via: "relay", files: 3, bytes: photo.length + note.length, peer: { name: "Studio PC", fingerprint: s.computer.fingerprint } });
    expect(outgoing(s.computer, id)?.state).toBe("waiting");

    const sink = memorySink();
    await incoming.accept(sink);
    expect(incoming.state).toBe("done");
    expect(incoming.message).toBe("Every file matched its hash.");
    await until(() => outgoing(s.computer, id)?.state === "done");
    expect(outgoing(s.computer, id)?.message).toMatch(/Delivered\. Suvin's phone checked every file/);

    const kept = new Map((await sink.files()).map((f) => [f.path, f.file]));
    expect([...kept.keys()].sort()).toEqual(["empty.txt", "photo.jpg", "plans/notes.txt"]);
    expect(Buffer.compare(Buffer.from(await kept.get("photo.jpg")!.arrayBuffer()), photo)).toBe(0);
    expect(await kept.get("plans/notes.txt")!.text()).toBe(note);
    expect(kept.get("plans/notes.txt")!.name).toBe("notes.txt");
    expect(kept.get("empty.txt")!.size).toBe(0);
    const carried = s.relay.carried();
    expect(carried.includes(Buffer.from("the plan for Thursday"))).toBe(false);
    expect(carried.includes(photo.subarray(3_000_000, 3_000_048))).toBe(false);
  });

  it("receives over a direct link, with only the setup going through the relay", async () => {
    const s = await setup();
    await pairPhone(s);
    await s.listener.setReachable(true);
    const before = s.relay.carried().length;
    const big = randomBytes(2 * 1024 * 1024);
    const prepared = await s.computer.prepare(await folder({ "video.mp4": big }));
    const id = s.computer.sendOverInternet(prepared.id, s.computer.snapshot().devices[0]!.fingerprint, "direct");
    await until(() => s.incoming.length === 1);
    expect(s.incoming[0]!.via).toBe("direct");
    const sink = memorySink();
    await s.incoming[0]!.accept(sink);
    await until(() => outgoing(s.computer, id)?.state === "done");
    const [file] = await sink.files();
    expect(Buffer.compare(Buffer.from(await file!.file.arrayBuffer()), big)).toBe(0);
    // Only the offer and answer crossed the relay.
    expect(s.relay.carried().length - before).toBeLessThan(4_096);
  });

  it("declines, and the computer is told nothing was sent", async () => {
    const s = await setup();
    await pairPhone(s);
    await s.listener.setReachable(true);
    const prepared = await s.computer.prepare(await folder({ "a.txt": "a" }));
    // Paired through Farbaek: a phone or browser, which this network's Send can't reach.
    const phone = s.computer.snapshot().devices[0]!;
    expect(phone).toMatchObject({ name: "Suvin's phone", via: "farbaek" });
    expect(() => s.computer.send(prepared.id, phone.fingerprint)).toThrow(/phones and browsers receive over the internet/);
    const id = s.computer.sendOverInternet(prepared.id, phone.fingerprint, "relay");
    await until(() => s.incoming.length === 1);
    await s.incoming[0]!.decline();
    expect(s.incoming[0]!.message).toBe("You declined this transfer. Nothing was kept.");
    await until(() => outgoing(s.computer, id)?.state === "declined");
    expect(outgoing(s.computer, id)?.message).toBe("Suvin's phone declined. Nothing was sent.");
  });

  it("isn't answered by a computer it forgot, and a computer that lies about who it is gets nothing", async () => {
    const s = await setup();
    await pairPhone(s);
    await s.listener.setReachable(true);
    // The phone forgot the computer: its call is closed without being joined.
    const studio = s.trusted.splice(0);
    const prepared = await s.computer.prepare(await folder({ "a.txt": "a" }));
    const id = s.computer.sendOverInternet(prepared.id, s.computer.snapshot().devices[0]!.fingerprint, "relay");
    await until(() => outgoing(s.computer, id)?.state === "interrupted", 20_000);
    expect(s.incoming).toEqual([]);

    // Someone else in the workspace claims to be the paired computer: the handshake shows another key.
    s.trusted.push(...studio);
    s.relay.client("browser-other");
    const other = new WebRelay({ base: "http://localhost:3000/api/v1/agent/relay", headers: { Authorization: "Bearer token-browser-other" }, fetcher: s.relay.fetcher });
    const session = await other.call(s.me, s.computer.fingerprint, "relay");
    const channel = await initiateWeb(other.open(session), await generateWebKeyPair(), { v: 1, name: "Studio PC", purpose: "transfer" }, 10_000);
    const { message } = await channel.receive(10_000);
    expect(message).toMatchObject({ t: "error", code: "not_paired" });
    expect(s.incoming).toEqual([]);
  });

  it("keeps nothing when a chunk doesn't match, and refuses a list of files that climbs out of its folder", async () => {
    const s = await setup();
    await s.listener.setReachable(true);
    // A paired computer whose sender lies: its key is one the phone trusts.
    const liar = generateKeyPair();
    s.trusted.push({ name: "Studio PC", fingerprint: fingerprint(liar.publicKey), publicKey: new Uint8Array(liar.publicKey) });
    const link = s.relay.client("agent-liar");
    const call = async () => initiate(link.open(await link.call(s.me, fingerprint(liar.publicKey), "relay")), liar, { v: 1, name: "Studio PC", purpose: "transfer" }, 10_000);

    const bytes = randomBytes(5 * 1024 * 1024);
    const packed = await packPicked([new File([bytes], "model.bin")], "Folder");
    const channel = await call();
    const body = Buffer.from(JSON.stringify(packed.manifest));
    await channel.sendBlob({ t: "offer", session: randomUUID(), digest: packed.digest, size: body.length }, body);
    await until(() => s.incoming.length === 1);
    const sink = memorySink();
    const accepted = s.incoming[0]!.accept(sink);
    const { message } = await channel.receive(10_000);
    if (message.t !== "accept") throw new Error("Expected accept");
    expect(JSON.parse((await channel.receiveBlob(message.size, 10_000)).toString())).toEqual({ resume: [] });
    await channel.send({ t: "file", f: 0, from: 0 });
    const tampered = Buffer.from(bytes);
    tampered[1_000_000] = tampered[1_000_000]! ^ 0xff;
    try {
      for (let at = 0; at < tampered.length; at += 60 * 1024) await channel.send({ t: "data" }, tampered.subarray(at, at + 60 * 1024));
    } catch {
      // The browser stopped listening.
    }
    await accepted;
    expect(s.incoming[0]!.state).toBe("failed");
    expect(s.incoming[0]!.message).toBe("model.bin didn't match its hash at chunk 1. The transfer stopped and nothing was kept.");
    expect(await sink.files()).toEqual([]);
    const verdict = await channel.receive(10_000);
    expect(verdict.message).toMatchObject({ t: "error", code: "chunk_mismatch" });

    // A list of files naming a path outside the folder is refused before anyone is asked.
    const climbing = { ...packed.manifest, files: packed.manifest.files.map((f) => ({ ...f, path: "../../startup/model.bin" })) };
    const again = await call();
    const climbingBody = Buffer.from(JSON.stringify(climbing));
    await again.sendBlob({ t: "offer", session: randomUUID(), digest: manifestDigest(climbing), size: climbingBody.length }, climbingBody);
    const refused = await again.receive(10_000);
    expect(refused.message).toMatchObject({ t: "error", code: "bad_offer" });
    expect(refused.message.t === "error" && refused.message.message).toMatch(/^Some files in this transfer can't be accepted\./);
    expect(s.incoming).toHaveLength(1);
  });

  it("stops listening, in words, when the person is signed out", async () => {
    const s = await setup();
    const signedOut = new WebMeshListener({
      relay: new WebRelay({ base: "http://localhost:3000/api/v1/agent/relay", headers: { Authorization: "Bearer nobody" }, fetcher: s.relay.fetcher }),
      key: s.key,
      fingerprint: s.me,
      name: () => "Suvin's phone",
      trusted: async () => [],
      iceServers: [],
      onIncoming: () => undefined,
      onUpdate: () => undefined,
    });
    await expect(signedOut.setReachable(true)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    expect(signedOut.reachable).toBe(false);
  });
});
