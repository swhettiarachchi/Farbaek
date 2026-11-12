/**
 * A browser and a Farbaek Agent through Farbaek's relay (ADR 0096), end to
 * end: the browser's own code (Web Crypto Noise, wire, relay pipe, pairing,
 * sender) against a real MeshNode, with the real relay hub in between.
 */
import { randomBytes } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { duplexPair, type Duplex } from "node:stream";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { SecureChannel, initiate, respond } from "@/agent-runtime/mesh/channel";
import { FramedSocket } from "@/agent-runtime/mesh/framing";
import { MeshNode } from "@/agent-runtime/mesh/node";
import { XXHandshake, generateKeyPair, pairingCode, pairingCommit } from "@/agent-runtime/mesh/noise";
import { fakeRelay } from "@/agent-runtime/mesh/relay-fake";
import { PAIRING_REFUSED_THERE, PAIRING_STEPS_FAILED, PAIRING_TIMED_OUT, runPairingSteps, type PairingCrypto } from "@/core/mesh/pairing";
import { MESH_PROLOGUE, type MeshMessage } from "@/core/mesh/protocol";
import { WebXXHandshake, concat, generateWebKeyPair, webFingerprint, webPairingCode, webPairingCommit, type WebKeyPair } from "./noise";
import { packPicked } from "./pack";
import { WebPairing, WebPairingError, type PairedComputer } from "./pair";
import { WebRelay } from "./relay-pipe";
import { WebOutgoing } from "./send";
import { WebIncoming } from "./receive";
import { FrameReader, WebSecureChannel, initiateWeb, respondWeb, type BytePipe } from "./wire";

// Every temp folder made here is removed after this file's tests, so test runs don't fill the disk.
const made: string[] = [];
const tmp = async (name: string) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), `farbaek-web-${name}-`));
  made.push(dir);
  return dir;
};
afterAll(() => Promise.all(made.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true }))));
const nodes: MeshNode[] = [];
afterEach(async () => {
  await Promise.all(nodes.splice(0).map((n) => n.close()));
});

async function until(check: () => boolean, ms = 15_000): Promise<void> {
  const end = Date.now() + ms;
  while (!check()) {
    if (Date.now() > end) throw new Error("Timed out waiting");
    await new Promise((r) => setTimeout(r, 10));
  }
}

async function setup() {
  const relay = fakeRelay();
  let vault: string | null = null;
  const computer = new MeshNode({
    dataDir: await tmp("computer"),
    name: () => "Studio PC",
    vault: { get: async () => vault, set: async (v) => void (vault = v) },
    discovery: false,
    relay: () => relay.client("agent-studio"),
    onUpdate: () => undefined,
  });
  await computer.init();
  nodes.push(computer);
  await computer.setReachable(true);
  relay.client("browser-phone");
  const web = new WebRelay({ base: "http://localhost:3000/api/v1/agent/relay", headers: { Authorization: "Bearer token-browser-phone" }, fetcher: relay.fetcher });
  const key = await generateWebKeyPair();
  return { relay, computer, web, key, me: await webFingerprint(key.publicKey) };
}

/** A Node stream as a browser byte pipe. */
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

/** Each side's hashing for the pairing steps (ADR 0194), as pair.ts and node.ts use it. */
const BROWSER_PAIRING: PairingCrypto = { random: () => globalThis.crypto.getRandomValues(new Uint8Array(32)), commit: webPairingCommit, code: webPairingCode };
const AGENT_PAIRING: PairingCrypto = { random: () => randomBytes(32), commit: pairingCommit, code: pairingCode };

/** A Farbaek Agent from before pairing version 2 answering a call: its hello says nothing about pairing. */
async function olderComputer(socket: Duplex, name: string): Promise<SecureChannel> {
  const framed = new FramedSocket(socket);
  const hs = new XXHandshake({ initiator: false, prologue: MESH_PROLOGUE, staticKey: generateKeyPair() });
  hs.readMessage(await framed.read(10_000));
  await framed.write(hs.writeMessage(Buffer.from(JSON.stringify({ v: 1, name }))));
  const theirs = hs.readMessage(await framed.read(10_000));
  return new SecureChannel(framed, hs.result(), { publicKey: hs.remoteStatic!, hello: JSON.parse(theirs.toString("utf8")) }, hs.handshakeHash);
}

/** A browser from before pairing version 2 calling to pair. */
async function olderBrowser(pipe: BytePipe, key: WebKeyPair, name: string): Promise<WebSecureChannel> {
  const reader = new FrameReader(pipe);
  const framed = (m: Uint8Array) => concat(new Uint8Array([m.length >> 8, m.length & 0xff]), m);
  const hs = new WebXXHandshake({ initiator: true, prologue: MESH_PROLOGUE, staticKey: key });
  await pipe.write(framed(await hs.writeMessage()));
  const theirs = JSON.parse(new TextDecoder().decode(await hs.readMessage(await reader.read(10_000))));
  await pipe.write(framed(await hs.writeMessage(new TextEncoder().encode(JSON.stringify({ v: 1, name, purpose: "pair" })))));
  return new WebSecureChannel(pipe, reader, hs.result(), { publicKey: hs.remoteStatic!, hello: theirs }, hs.handshakeHash);
}

async function pairPhone(computer: MeshNode, web: WebRelay, key: WebKeyPair, me: string): Promise<{ pairing: WebPairing; trusted: PairedComputer[] }> {
  computer.openRelayPairing();
  const session = await web.call(computer.fingerprint, me, "pair");
  const channel = await initiateWeb(web.open(session), key, { v: 1, name: "Suvin's phone", purpose: "pair" }, 10_000);
  const trusted: PairedComputer[] = [];
  const pairing = await WebPairing.start(channel, () => undefined, async (c) => void trusted.push(c));
  await until(() => computer.snapshot().pairing?.state === "confirming");
  expect(computer.snapshot().pairing!.code).toBe(pairing.code);
  await computer.confirmPairing(computer.snapshot().pairing!.id, true);
  await pairing.confirm(true);
  await until(() => pairing.state === "paired");
  return { pairing, trusted };
}

describe("a phone or browser and a Farbaek Agent", { timeout: 60_000 }, () => {
  it("pair through Farbaek only while the computer's window is open, with the same code on both screens", async () => {
    const { computer, web, key, me } = await setup();
    // Window closed: the computer doesn't answer.
    const refused = await web.call(computer.fingerprint, me, "pair");
    await expect(initiateWeb(web.open(refused), key, { v: 1, name: "Suvin's phone", purpose: "pair" }, 3_000)).rejects.toThrow();
    expect(computer.snapshot().pairing).toBeNull();

    const { trusted } = await pairPhone(computer, web, key, me);
    expect(trusted.map((c) => c.name)).toEqual(["Studio PC"]);
    expect(trusted[0]!.fingerprint).toBe(computer.fingerprint);
    expect(computer.snapshot().devices.map((d) => d.name)).toEqual(["Suvin's phone"]);
    // One pairing per window.
    expect(computer.snapshot().relay).toMatchObject({ pairingUntil: null });
  });

  it("sends picked files to the paired computer, which checks every byte; the relay carries nothing readable", async () => {
    const { relay, computer, web, key, me } = await setup();
    const { trusted } = await pairPhone(computer, web, key, me);
    const photo = randomBytes(5 * 1024 * 1024 + 3);
    const note = "meeting notes from the phone\n";
    const packed = await packPicked([new File([photo], "IMG_2041.jpg"), new File([note], "notes.txt"), new File(["x"], "notes.txt")], "From Suvin's phone");
    expect(packed.manifest.files.map((f) => f.path)).toEqual(["IMG_2041.jpg", "notes (2).txt", "notes.txt"]);
    const device = trusted[0]!;
    const transfer = new WebOutgoing(
      globalThis.crypto.randomUUID(),
      packed,
      device,
      "relay",
      async (via) => initiateWeb(web.open(await web.call(device.fingerprint, me, via)), key, { v: 1, name: "Suvin's phone", purpose: "transfer" }, 30_000),
      () => undefined,
      (error) => ({ message: String(error), canUseRelay: false }),
    );
    void transfer.start();
    await until(() => computer.snapshot().transfers.some((t) => t.state === "offered"));
    const incoming = computer.snapshot().transfers.find((t) => t.state === "offered")!;
    expect(incoming).toMatchObject({ via: "relay", peer: { name: "Suvin's phone" }, files: 3 });
    await computer.accept(incoming.id, await tmp("dest"));
    await until(() => transfer.state === "done" && computer.snapshot().transfers.find((t) => t.id === incoming.id)?.state === "done", 30_000);
    expect(transfer.message).toMatch(/Delivered\. Studio PC checked every file/);
    const dest = computer.snapshot().transfers.find((t) => t.id === incoming.id)!.destination!;
    expect(Buffer.compare(await fs.readFile(path.join(dest, "IMG_2041.jpg")), photo)).toBe(0);
    expect(await fs.readFile(path.join(dest, "notes.txt"), "utf8")).toBe(note);
    const carried = relay.carried();
    expect(carried.includes(Buffer.from("meeting notes"))).toBe(false);
    expect(carried.includes(photo.subarray(2_000_000, 2_000_048))).toBe(false);
  });

  it("isn't answered by a computer it never paired with", async () => {
    const { computer, web, key, me } = await setup();
    const packed = await packPicked([new File(["hello"], "hello.txt")], "Files");
    const transfer = new WebOutgoing(
      globalThis.crypto.randomUUID(),
      packed,
      { name: "Studio PC", fingerprint: computer.fingerprint, publicKey: new Uint8Array(32) },
      "relay",
      async (via) => initiateWeb(web.open(await web.call(computer.fingerprint, me, via)), key, { v: 1, name: "Stranger", purpose: "transfer" }, 3_000),
      () => undefined,
      () => ({ message: "Couldn't reach it.", canUseRelay: false }),
    );
    await transfer.start();
    expect(transfer.state).toBe("interrupted");
    expect(computer.snapshot().transfers).toEqual([]);
  });

  it("offers nothing when cancelled while it's still connecting", async () => {
    const { computer, web, key, me } = await setup();
    const { trusted } = await pairPhone(computer, web, key, me);
    const device = trusted[0]!;
    const packed = await packPicked([new File(["hello"], "hello.txt")], "Files");
    let release!: () => void;
    const connecting = new Promise<void>((r) => (release = r));
    const transfer = new WebOutgoing(
      globalThis.crypto.randomUUID(),
      packed,
      device,
      "relay",
      async (via) => {
        await connecting;
        return initiateWeb(web.open(await web.call(device.fingerprint, me, via)), key, { v: 1, name: "Suvin's phone", purpose: "transfer" }, 30_000);
      },
      () => undefined,
      (error) => ({ message: String(error), canUseRelay: false }),
    );
    const started = transfer.start();
    await transfer.cancel();
    release();
    await started;
    await new Promise((r) => setTimeout(r, 300));
    expect(transfer.state).toBe("cancelled");
    expect(computer.snapshot().transfers.filter((t) => t.state === "offered")).toEqual([]);
  });

  it("shows an incoming offer under the name saved at pairing, not the one the computer gives itself", async () => {
    const packed = await packPicked([new File(["hello"], "hello.txt")], "Files");
    const channel = {
      peer: { hello: { v: 1, name: "Bank of Somewhere" }, publicKey: new Uint8Array(32) },
      receive: () => new Promise(() => undefined),
      close: () => undefined,
    } as unknown as WebSecureChannel;
    const incoming = new WebIncoming(channel, "offer-1", packed.manifest, "relay", () => undefined, "Studio PC");
    expect(incoming.view().peer.name).toBe("Studio PC");
  });

  it("runs the pairing steps with the agent's own code in either role, to the same code (ADR 0194)", async () => {
    for (const browserCalls of [true, false]) {
      const [browserEnd, agentEnd] = duplexPair();
      const key = await generateWebKeyPair();
      const [browser, agent] = browserCalls
        ? await Promise.all([initiateWeb(pipeOf(browserEnd), key, { v: 1, name: "Suvin's phone", purpose: "pair" }), respond(agentEnd, generateKeyPair(), { v: 1, name: "Studio PC" })])
        : await Promise.all([respondWeb(pipeOf(browserEnd), key, { v: 1, name: "Suvin's phone" }), initiate(agentEnd, generateKeyPair(), { v: 1, name: "Studio PC", purpose: "pair" })]);
      expect(browser.peer.hello.pairing).toBe(2);
      expect(agent.peer.hello.pairing).toBe(2);
      const [browserCode, agentCode] = await Promise.all([
        runPairingSteps(browserCalls ? "caller" : "answerer", browser, browser.handshakeHash, BROWSER_PAIRING),
        runPairingSteps(browserCalls ? "answerer" : "caller", agent, agent.handshakeHash, AGENT_PAIRING),
      ]);
      expect(browserCode).toMatch(/^\d{6}$/);
      expect(browserCode).toBe(agentCode);
      browser.close();
      agent.close();
    }
  });

  it("refuses a computer too old to pair, before any code exists, and tells it why", async () => {
    const [browserEnd, computerEnd] = duplexPair();
    const heard: MeshMessage[] = [];
    void olderComputer(computerEnd, "Old PC")
      .then((old) => old.receive(5_000))
      .then((r) => heard.push(r.message))
      .catch(() => undefined);
    const channel = await initiateWeb(pipeOf(browserEnd), await generateWebKeyPair(), { v: 1, name: "Suvin's phone", purpose: "pair" }, 10_000);
    expect(channel.peer.hello.pairing).toBeUndefined();
    await expect(WebPairing.start(channel, () => undefined, async () => undefined)).rejects.toThrow(new WebPairingError("Update Farbaek on Old PC to pair: pairing changed to keep it safe."));
    // Its first and only message is the refusal: no commit, no code.
    await until(() => heard.length === 1);
    expect(heard[0]).toEqual({ t: "error", code: "protocol", message: PAIRING_REFUSED_THERE });
  });

  it("is refused by the computer when the browser is too old to pair, before any code exists", async () => {
    const { computer, web, key, me } = await setup();
    computer.openRelayPairing();
    const session = await web.call(computer.fingerprint, me, "pair");
    const old = await olderBrowser(web.open(session), key, "Suvin's old phone");
    expect((await old.receive(10_000)).message).toEqual({ t: "error", code: "protocol", message: PAIRING_REFUSED_THERE });
    await until(() => computer.snapshot().pairing?.state === "failed");
    expect(computer.snapshot().pairing).toMatchObject({ code: null, message: "Update Farbaek on Suvin's old phone to pair: pairing changed to keep it safe." });
    expect(computer.snapshot().devices).toEqual([]);
  });

  it("shows no code when the computer doesn't follow the pairing steps", async () => {
    const [browserEnd, computerEnd] = duplexPair();
    // A computer that skips its nonce and confirms at once.
    void respond(computerEnd, generateKeyPair(), { v: 1, name: "Odd PC" })
      .then(async (c) => {
        await c.receive(5_000);
        await c.send({ t: "pair-confirm", ok: true });
      })
      .catch(() => undefined);
    const channel = await initiateWeb(pipeOf(browserEnd), await generateWebKeyPair(), { v: 1, name: "Suvin's phone", purpose: "pair" }, 10_000);
    await expect(WebPairing.start(channel, () => undefined, async () => undefined)).rejects.toThrow(new WebPairingError(PAIRING_STEPS_FAILED));
  });

  it("says the computer took too long, not that it broke the steps, when it goes quiet", async () => {
    const [browserEnd, computerEnd] = duplexPair();
    void respond(computerEnd, generateKeyPair(), { v: 1, name: "Quiet PC" }).catch(() => undefined);
    const channel = await initiateWeb(pipeOf(browserEnd), await generateWebKeyPair(), { v: 1, name: "Suvin's phone", purpose: "pair" }, 10_000);
    await expect(WebPairing.start(channel, () => undefined, async () => undefined, 300)).rejects.toThrow(new WebPairingError(PAIRING_TIMED_OUT));
  });

  it("leaves out credentials files and secret-looking text, and refuses when nothing is left", async () => {
    const secret = ["sk", "live", "x".repeat(24)].join("_");
    const packed = await packPicked([new File(["fine"], "fine.txt"), new File([`KEY=${secret}`], "config.txt"), new File(["TOKEN=x"], ".env")], "Files");
    expect(packed.manifest.files.map((f) => f.path)).toEqual(["fine.txt"]);
    expect(packed.excluded.map((e) => e.reason).sort()).toEqual(["secret_content", "secret_file"]);
    await expect(packPicked([new File(["TOKEN=x"], ".env")], "Files")).rejects.toThrow(/None of these files can be sent/);
  });
});
