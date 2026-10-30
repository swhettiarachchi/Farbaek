import { randomBytes } from "node:crypto";
import { EventEmitter } from "node:events";
import { promises as fs } from "node:fs";
import type { Socket } from "node:net";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CHUNK_BYTES, ChunkHasher, blake3Hex, checkManifest, manifestDigest, type CapsuleManifest } from "@/core/mesh/capsule";
import { TRANSFER_LIMITS } from "@/core/mesh/protocol";
import type { Duplex } from "node:stream";
import { SecureChannel, initiate, respond } from "./channel";
import { fakeDirect } from "./direct-fake";
import { FrameError, FramedSocket } from "./framing";
import type { KeyVault } from "./identity";
import { generateKeyPair } from "./noise";
import { MeshNode, type RelayLink } from "./node";
import { fakeRelay } from "./relay-fake";
import { packFolder } from "./pack";
import type { IncomingView } from "./receive";

const tmp = (name: string) => fs.mkdtemp(path.join(os.tmpdir(), `farbaek-mesh-${name}-`));
const fakeKey = () => "AKIA" + "Q".repeat(16);

function memoryVault(): KeyVault {
  let value: string | null = null;
  return {
    get: async () => value,
    set: async (v) => {
      value = v;
    },
  };
}

async function until(check: () => boolean, timeoutMs = 10_000): Promise<void> {
  const end = Date.now() + timeoutMs;
  while (!check()) {
    if (Date.now() > end) throw new Error("Timed out waiting");
    await new Promise((r) => setTimeout(r, 10));
  }
}

const nodes: MeshNode[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(nodes.splice(0).map((n) => n.close()));
});

type Direct = (signal: Duplex, role: "offer" | "answer") => Promise<Duplex>;

/** Each node's data folder, so a test can start the same device again. */
const dataDirs = new Map<MeshNode, string>();

async function makeNode(name: string, relay?: () => RelayLink | string, direct?: Direct, dataDir?: string): Promise<MeshNode> {
  const dir = dataDir ?? (await tmp(`data-${name}`));
  const node = new MeshNode({ dataDir: dir, name: () => name, vault: memoryVault(), discovery: false, listenHost: "127.0.0.1", relay, direct, onUpdate: () => undefined });
  await node.init();
  nodes.push(node);
  dataDirs.set(node, dir);
  return node;
}

async function paired(relays: { a?: () => RelayLink | string; b?: () => RelayLink | string; aDirect?: Direct; bDirect?: Direct } = {}): Promise<{ a: MeshNode; b: MeshNode; port: number }> {
  const a = await makeNode("Desk", relays.a, relays.aDirect);
  const b = await makeNode("Laptop", relays.b, relays.bDirect);
  await b.setVisible(true);
  const port = b.snapshot().visible!.port;
  await a.pair("127.0.0.1", port);
  await until(() => b.snapshot().pairing?.state === "confirming");
  expect(a.snapshot().pairing!.code).toMatch(/^\d{6}$/);
  expect(a.snapshot().pairing!.code).toBe(b.snapshot().pairing!.code);
  await a.confirmPairing(true);
  await b.confirmPairing(true);
  await until(() => a.snapshot().pairing?.state === "paired" && b.snapshot().pairing?.state === "paired");
  return { a, b, port };
}

async function sourceFolder(): Promise<{ root: string; big: Buffer }> {
  const root = await tmp("src");
  const big = randomBytes(10 * 1024 * 1024 + 123);
  await fs.mkdir(path.join(root, "src"));
  await fs.mkdir(path.join(root, "assets"));
  await fs.mkdir(path.join(root, "node_modules", "left"), { recursive: true });
  await fs.writeFile(path.join(root, "README.md"), "# Harbour Lane\n");
  await fs.writeFile(path.join(root, "src", "app.ts"), "export const answer = 42;\n");
  await fs.writeFile(path.join(root, "src", "empty.txt"), "");
  await fs.writeFile(path.join(root, "assets", "big.bin"), big);
  await fs.writeFile(path.join(root, ".env"), "TOKEN=nope\n");
  await fs.writeFile(path.join(root, "src", "keys.ts"), `export const k = "${fakeKey()}";\n`);
  await fs.writeFile(path.join(root, "node_modules", "left", "index.js"), "module.exports = 1;\n");
  return { root, big };
}

async function offerTo(a: MeshNode, b: MeshNode, port: number, root: string): Promise<{ outId: string; inId: string }> {
  const prepared = await a.prepare(root);
  const outId = a.send(prepared.id, b.fingerprint, { address: "127.0.0.1", port });
  await until(() => b.snapshot().transfers.some((t) => t.state === "offered"));
  return { outId, inId: b.snapshot().transfers.find((t) => t.state === "offered")!.id };
}

const stateOf = (node: MeshNode, id: string) => node.snapshot().transfers.find((t) => t.id === id)?.state;

describe("framing", () => {
  function fakeSocket() {
    const emitter = new EventEmitter();
    const written: Buffer[] = [];
    const socket = Object.assign(emitter, { setNoDelay: () => socket, pause: () => socket, resume: () => socket, write: (b: Buffer) => (written.push(b), true), destroy: () => emitter.emit("close") });
    return { socket: socket as unknown as Socket, emitter, written };
  }

  it("reassembles messages however TCP splits or joins them", async () => {
    const { socket, emitter } = fakeSocket();
    const framed = new FramedSocket(socket);
    const frame = (s: string) => Buffer.concat([Buffer.from([0, s.length]), Buffer.from(s)]);
    const stream = Buffer.concat([frame("one"), frame("two"), frame("three")]);
    emitter.emit("data", stream.subarray(0, 4));
    emitter.emit("data", stream.subarray(4, 11));
    emitter.emit("data", stream.subarray(11));
    expect((await framed.read()).toString()).toBe("one");
    expect((await framed.read()).toString()).toBe("two");
    expect((await framed.read()).toString()).toBe("three");
  });

  it("refuses a message over 65,535 bytes and fails reads once closed", async () => {
    const { socket, emitter } = fakeSocket();
    const framed = new FramedSocket(socket);
    await expect(framed.write(Buffer.alloc(65_536))).rejects.toThrow(FrameError);
    const pending = framed.read();
    emitter.emit("close");
    await expect(pending).rejects.toThrow(FrameError);
  });
});

describe("manifest checks and chunk hashing", () => {
  it("hashes a stream into 4 MiB chunks exactly as packing does", () => {
    const bytes = randomBytes(9 * 1024 * 1024);
    const seen: number[] = [];
    const hasher = new ChunkHasher((c) => seen.push(c.index));
    for (let at = 0; at < bytes.length; at += 777_777) hasher.update(bytes.subarray(at, at + 777_777));
    const out = hasher.digest();
    expect(out.blake3).toBe(blake3Hex(bytes));
    expect(out.chunks.map((c) => c.bytes)).toEqual([CHUNK_BYTES, CHUNK_BYTES, 1024 * 1024]);
    expect(out.chunks[1]!.blake3).toBe(blake3Hex(bytes.subarray(CHUNK_BYTES, 2 * CHUNK_BYTES)));
    expect(seen).toEqual([0, 1, 2]);
    const empty = new ChunkHasher().digest();
    expect(empty.chunks).toEqual([{ index: 0, bytes: 0, blake3: blake3Hex(new Uint8Array()) }]);
  });

  it("refuses traversal, Windows device names, credentials files and bad chunk lists", () => {
    const entry = (p: string, bytes = 1) => ({ path: p, bytes, blake3: "a".repeat(64), chunks: [{ index: 0, bytes, blake3: "a".repeat(64) }] });
    const manifest = (files: ReturnType<typeof entry>[]): CapsuleManifest => ({
      format: "farbaek.capsule/1",
      id: "00000000-0000-4000-8000-000000000001",
      createdAt: new Date().toISOString(),
      source: { projectId: null, projectName: "x" },
      files,
      excluded: [],
      totals: { files: files.length, bytes: files.reduce((s, f) => s + f.bytes, 0) },
    });
    const problems = (files: ReturnType<typeof entry>[]) => checkManifest(manifest(files), TRANSFER_LIMITS, { diskPaths: true }).join(" ");
    expect(problems([entry("../outside.txt")])).toMatch(/"\." or "\.\."/);
    expect(problems([entry("docs/con.txt")])).toMatch(/reserved device name/);
    expect(problems([entry(".env")])).toMatch(/can't be in a Capsule/);
    expect(problems([entry("a.txt"), entry("A.txt")])).toMatch(/differ only in capital letters/);
    expect(problems([{ ...entry("big.bin", CHUNK_BYTES + 1) }])).toMatch(/chunk list doesn't match its size/);
    expect(problems([entry("fine.txt")])).toBe("");
  });
});

describe("packing a folder", () => {
  it("leaves out credentials, dependency folders and secret-looking text, and hashes the rest", async () => {
    const { root, big } = await sourceFolder();
    const packed = await packFolder(root);
    expect(packed.manifest.files.map((f) => f.path)).toEqual(["README.md", "assets/big.bin", "src/app.ts", "src/empty.txt"]);
    expect(packed.manifest.excluded).toEqual(
      expect.arrayContaining([
        { path: ".env", reason: "secret_file" },
        { path: "node_modules/", reason: "ignored_folder" },
        { path: "src/keys.ts", reason: "secret_content" },
      ]),
    );
    const bigEntry = packed.manifest.files.find((f) => f.path === "assets/big.bin")!;
    expect(bigEntry.blake3).toBe(blake3Hex(big));
    expect(bigEntry.chunks).toHaveLength(3);
    expect(packed.digest).toBe(manifestDigest(packed.manifest));
    expect(checkManifest(packed.manifest, TRANSFER_LIMITS, { diskPaths: true })).toEqual([]);
    // Hashing the multi-chunk file takes over 5 s when the whole suite runs at once.
  }, 30_000);
});

describe("nearby transfer between two agents", { timeout: 30_000 }, () => {
  it("pairs only when both people confirm the same code", async () => {
    const { a, b } = await paired();
    expect(a.snapshot().devices.map((d) => d.name)).toEqual(["Laptop"]);
    expect(a.snapshot().devices[0]!.via).toBe("nearby");
    expect(b.snapshot().devices.map((d) => d.name)).toEqual(["Desk"]);

    const c = await makeNode("Stranger");
    const port = b.snapshot().visible!.port;
    b.dismissPairing();
    await c.pair("127.0.0.1", port);
    await until(() => b.snapshot().pairing?.state === "confirming");
    await b.confirmPairing(false);
    await until(() => c.snapshot().pairing?.state === "declined");
    expect(b.snapshot().devices.map((d) => d.name)).toEqual(["Desk"]);
  });

  it("sends a folder and the receiver checks every byte before reporting it delivered", async () => {
    const { a, b, port } = await paired();
    const { root, big } = await sourceFolder();
    const parent = await tmp("dest");
    const { outId, inId } = await offerTo(a, b, port, root);
    expect(stateOf(a, outId)).toBe("waiting");
    await b.accept(inId, parent);
    await until(() => stateOf(a, outId) === "done" && stateOf(b, inId) === "done");

    const dest = b.snapshot().transfers.find((t) => t.id === inId)!.destination!;
    expect(path.dirname(dest)).toBe(parent);
    expect(Buffer.compare(await fs.readFile(path.join(dest, "assets", "big.bin")), big)).toBe(0);
    expect(await fs.readFile(path.join(dest, "src", "app.ts"), "utf8")).toBe("export const answer = 42;\n");
    expect(await fs.readFile(path.join(dest, "src", "empty.txt"), "utf8")).toBe("");
    const names = await fs.readdir(dest);
    expect(names.sort()).toEqual(["README.md", "assets", "src"]);
    await expect(fs.access(path.join(dest, ".env"))).rejects.toThrow();
  });

  it("puts a second transfer of the same folder in a new folder, never over the first", async () => {
    const { a, b, port } = await paired();
    const { root } = await sourceFolder();
    const parent = await tmp("dest");
    await fs.mkdir(path.join(parent, path.basename(root)));
    await fs.writeFile(path.join(parent, path.basename(root), "mine.txt"), "keep me");
    const { outId, inId } = await offerTo(a, b, port, root);
    await b.accept(inId, parent);
    await until(() => stateOf(a, outId) === "done");
    expect(b.snapshot().transfers.find((t) => t.id === inId)!.destination).toBe(path.join(parent, `${path.basename(root)} (2)`));
    expect(await fs.readFile(path.join(parent, path.basename(root), "mine.txt"), "utf8")).toBe("keep me");
  });

  it("sends only what changed when the receiver points at an earlier copy, and leaves that copy as it was (ADR 0138)", async () => {
    const { a, b, port } = await paired();
    const { root, big } = await sourceFolder();
    const parent = await tmp("dest");
    const first = await offerTo(a, b, port, root);
    await b.accept(first.inId, parent);
    await until(() => stateOf(b, first.inId) === "done");
    const earlier = b.snapshot().transfers.find((t) => t.id === first.inId)!.destination!;

    // One file edited, the big one grown at its end, one added.
    await fs.writeFile(path.join(root, "src", "app.ts"), "export const answer = 43;\n");
    await fs.appendFile(path.join(root, "assets", "big.bin"), "0123456789");
    await fs.writeFile(path.join(root, "src", "new.ts"), "export const fresh = true;\n");
    const sent: number[] = [];
    const real = SecureChannel.prototype.send;
    vi.spyOn(SecureChannel.prototype, "send").mockImplementation(function (this: SecureChannel, message, body) {
      if (message.t === "data" && body) sent.push(body.length);
      // The manifest and the resume points travel as data too: they aren't file bytes.
      if (message.t === "offer" || message.t === "accept") sent.push(-message.size);
      return real.call(this, message, body);
    });
    const second = await offerTo(a, b, port, root);
    await b.accept(second.inId, parent, earlier);
    await until(() => stateOf(a, second.outId) === "done" && stateOf(b, second.inId) === "done");

    const view = b.snapshot().transfers.find((t) => t.id === second.inId) as IncomingView;
    // README.md and empty.txt whole, and the first two 4 MiB chunks of big.bin.
    expect(view.reused).toEqual({ files: 2, bytes: "# Harbour Lane\n".length + 2 * 4 * 1024 * 1024 });
    expect(view.message).toMatch(/2 of them were already on this computer/);
    const total = sent.reduce((n, x) => n + x, 0);
    expect(total).toBe(big.length - 2 * 4 * 1024 * 1024 + 10 + "export const answer = 43;\n".length + "export const fresh = true;\n".length);
    const dest = view.destination!;
    expect(Buffer.compare(await fs.readFile(path.join(dest, "assets", "big.bin")), Buffer.concat([big, Buffer.from("0123456789")]))).toBe(0);
    expect(await fs.readFile(path.join(dest, "src", "app.ts"), "utf8")).toBe("export const answer = 43;\n");
    expect(await fs.readFile(path.join(dest, "README.md"), "utf8")).toBe("# Harbour Lane\n");
    expect(await fs.readFile(path.join(earlier, "src", "app.ts"), "utf8")).toBe("export const answer = 42;\n");
    expect(Buffer.compare(await fs.readFile(path.join(earlier, "assets", "big.bin")), big)).toBe(0);
  });

  it("sends everything when the earlier copy has nothing in common", async () => {
    const { a, b, port } = await paired();
    const { root } = await sourceFolder();
    const parent = await tmp("dest");
    const unrelated = await tmp("other");
    await fs.writeFile(path.join(unrelated, "README.md"), "# Something else\n");
    const { outId, inId } = await offerTo(a, b, port, root);
    await b.accept(inId, parent, unrelated);
    await until(() => stateOf(a, outId) === "done" && stateOf(b, inId) === "done");
    expect((b.snapshot().transfers.find((t) => t.id === inId) as IncomingView).reused).toEqual({ files: 0, bytes: 0 });
  });

  it("writes nothing when the person declines", async () => {
    const { a, b, port } = await paired();
    const { root } = await sourceFolder();
    const parent = await tmp("dest");
    const { outId, inId } = await offerTo(a, b, port, root);
    await b.decline(inId);
    await until(() => stateOf(a, outId) === "declined");
    expect(await fs.readdir(parent)).toEqual([]);
  });

  it("resumes after a dropped connection from the last checked chunk", async () => {
    const { a, b, port } = await paired();
    const { root, big } = await sourceFolder();
    const parent = await tmp("dest");

    const receive = SecureChannel.prototype.receive;
    let pieces = 0;
    const drop = vi.spyOn(SecureChannel.prototype, "receive").mockImplementation(async function (this: SecureChannel, timeoutMs?: number) {
      const got = await receive.call(this, timeoutMs);
      if (got.message.t === "data" && ++pieces === 100) this.close();
      return got;
    });
    const answers: string[] = [];
    const sendBlob = SecureChannel.prototype.sendBlob;
    vi.spyOn(SecureChannel.prototype, "sendBlob").mockImplementation(async function (this: SecureChannel, message, json) {
      if (message.t === "accept") answers.push(Buffer.from(json).toString("utf8"));
      return sendBlob.call(this, message, json);
    });

    const { outId, inId } = await offerTo(a, b, port, root);
    await b.accept(inId, parent);
    await until(() => stateOf(a, outId) === "interrupted" && stateOf(b, inId) === "interrupted");
    drop.mockRestore();

    await a.resume(outId);
    await until(() => stateOf(a, outId) === "done" && stateOf(b, inId) === "done");
    expect(answers[0]).toBe(JSON.stringify({ resume: [] }));
    const resumed = JSON.parse(answers[1]!) as { resume: [number, number][] };
    // README.md finished; assets/big.bin had at least one chunk checked.
    expect(resumed.resume).toEqual(expect.arrayContaining([[0, 1]]));
    expect(resumed.resume.find(([f]) => f === 1)?.[1]).toBeGreaterThanOrEqual(1);
    const dest = b.snapshot().transfers.find((t) => t.id === inId)!.destination!;
    expect(Buffer.compare(await fs.readFile(path.join(dest, "assets", "big.bin")), big)).toBe(0);
  });

  it("keeps a finished transfer when the verdict is lost, and tells the sender again when it resumes", async () => {
    const { a, b, port } = await paired();
    const { root, big } = await sourceFolder();
    const parent = await tmp("dest");
    const send = SecureChannel.prototype.send;
    let dropped = false;
    vi.spyOn(SecureChannel.prototype, "send").mockImplementation(function (this: SecureChannel, message, body) {
      if (message.t === "verified" && !dropped) {
        dropped = true;
        this.close();
        return Promise.reject(new Error("lost"));
      }
      return send.call(this, message, body);
    });
    const { outId, inId } = await offerTo(a, b, port, root);
    await b.accept(inId, parent);
    await until(() => stateOf(b, inId) === "done" && stateOf(a, outId) === "interrupted");
    const dest = b.snapshot().transfers.find((t) => t.id === inId)!.destination!;
    expect(Buffer.compare(await fs.readFile(path.join(dest, "assets", "big.bin")), big)).toBe(0);

    await a.resume(outId);
    await until(() => stateOf(a, outId) === "done");
    expect(Buffer.compare(await fs.readFile(path.join(dest, "assets", "big.bin")), big)).toBe(0);
  });

  it("stops and removes everything when a chunk doesn't match its hash", async () => {
    const { a, b, port } = await paired();
    const { root } = await sourceFolder();
    const parent = await tmp("dest");
    const send = SecureChannel.prototype.send;
    let corrupted = false;
    vi.spyOn(SecureChannel.prototype, "send").mockImplementation(function (this: SecureChannel, message, body) {
      if (message.t === "data" && body && body.length > 30_000 && !corrupted) {
        corrupted = true;
        const changed = Buffer.from(body);
        changed[10]! ^= 0xff;
        return send.call(this, message, changed);
      }
      return send.call(this, message, body);
    });
    const { outId, inId } = await offerTo(a, b, port, root);
    await b.accept(inId, parent);
    await until(() => stateOf(b, inId) === "failed" && stateOf(a, outId) === "failed");
    expect(a.snapshot().transfers.find((t) => t.id === outId)!.message).toMatch(/didn't match its hash/);
    expect(b.snapshot().transfers.find((t) => t.id === inId)!.message).toMatch(/didn't match its hash/);
    expect(await fs.readdir(parent)).toEqual([]);
  });

  it("refuses an offer with a path that would escape the folder", async () => {
    const { a, b, port } = await paired();
    const { root } = await sourceFolder();
    const packed = await packFolder(root);
    const evil: CapsuleManifest = { ...packed.manifest, files: packed.manifest.files.map((f, i) => (i === 0 ? { ...f, path: "../escaped.md" } : f)) };
    const prepared = (a as unknown as { prepared: Map<string, unknown> }).prepared;
    prepared.set("evil", { ...packed, manifest: evil, digest: manifestDigest(evil) });
    const outId = a.send("evil", b.fingerprint, { address: "127.0.0.1", port });
    await until(() => stateOf(a, outId) === "failed");
    expect(a.snapshot().transfers.find((t) => t.id === outId)!.message).toMatch(/can't be accepted/);
    expect(b.snapshot().transfers).toEqual([]);
  });

  it("refuses when there isn't enough free space", async () => {
    const { a, b, port } = await paired();
    const { root } = await sourceFolder();
    const parent = await tmp("dest");
    vi.spyOn(fs, "statfs").mockResolvedValue({ type: 0, bsize: 4096, blocks: 1, bfree: 1, bavail: 1, files: 1, ffree: 1 } as Awaited<ReturnType<typeof fs.statfs>>);
    const { outId, inId } = await offerTo(a, b, port, root);
    await b.accept(inId, parent);
    await until(() => stateOf(b, inId) === "failed" && stateOf(a, outId) === "failed");
    expect(b.snapshot().transfers.find((t) => t.id === inId)!.message).toMatch(/enough free space/);
    expect(await fs.readdir(parent)).toEqual([]);
  });

  it("refuses a device that was forgotten", async () => {
    const { a, b, port } = await paired();
    const { root } = await sourceFolder();
    await b.forget(a.fingerprint);
    const prepared = await a.prepare(root);
    const outId = a.send(prepared.id, b.fingerprint, { address: "127.0.0.1", port });
    await until(() => stateOf(a, outId) === "failed");
    expect(a.snapshot().transfers.find((t) => t.id === outId)!.message).toMatch(/aren't paired/);
    expect(b.snapshot().transfers).toEqual([]);
  });
});

describe("through Farbaek's relay", { timeout: 60_000 }, () => {
  /** Paired on one network, then apart: Laptop is reachable only through the relay. */
  async function apart() {
    const relay = fakeRelay();
    const { a, b } = await paired({ a: () => relay.client("agent-desk"), b: () => relay.client("agent-laptop") });
    await b.setVisible(false);
    await b.setReachable(true);
    return { a, b, relay };
  }

  it("is unavailable, with the reason, when the app isn't paired with Farbaek", async () => {
    const lone = await makeNode("Alone", () => "Pair this app with your Farbaek workspace first.");
    expect(lone.snapshot().relay).toEqual({ available: false, reason: "Pair this app with your Farbaek workspace first." });
    await expect(lone.setReachable(true)).rejects.toThrow(/Pair this app/);
  });

  it("sends a folder end to end encrypted: the receiver checks every byte, and the relay carried nothing readable", async () => {
    const { a, b, relay } = await apart();
    expect(b.snapshot().relay).toEqual({ available: true, reachable: true, problem: null, direct: false, pairingUntil: null });
    const { root, big } = await sourceFolder();
    const parent = await tmp("dest");
    const prepared = await a.prepare(root);
    const outId = a.sendOverInternet(prepared.id, b.fingerprint, "relay");
    await until(() => b.snapshot().transfers.some((t) => t.state === "offered"));
    const incoming = b.snapshot().transfers.find((t) => t.state === "offered")!;
    expect(incoming.via).toBe("relay");
    expect(a.snapshot().transfers.find((t) => t.id === outId)!.via).toBe("relay");
    await b.accept(incoming.id, parent);
    await until(() => stateOf(a, outId) === "done" && stateOf(b, incoming.id) === "done", 30_000);

    const dest = b.snapshot().transfers.find((t) => t.id === incoming.id)!.destination!;
    expect(Buffer.compare(await fs.readFile(path.join(dest, "assets", "big.bin")), big)).toBe(0);
    expect(await fs.readFile(path.join(dest, "src", "app.ts"), "utf8")).toBe("export const answer = 42;\n");
    const carried = relay.carried();
    expect(carried.length).toBeGreaterThan(big.length);
    for (const plain of [Buffer.from("export const answer = 42;"), Buffer.from("# Harbour Lane"), big.subarray(1_000_000, 1_000_064), Buffer.from("README.md")]) {
      expect(carried.includes(plain)).toBe(false);
    }
    expect(relay.hub.stats().bufferedBytes).toBe(0);
  });

  it("waits for a device that's offline, sends once it's back, and keeps waiting across a restart (ADR 0138)", async () => {
    const { a, b, relay } = await apart();
    await b.setReachable(false);
    const { root } = await sourceFolder();
    const parent = await tmp("dest");
    const outId = a.sendOverInternet((await a.prepare(root)).id, b.fingerprint, "relay");
    await until(() => stateOf(a, outId) === "interrupted");
    await expect(a.queue("not-a-transfer")).rejects.toThrow(/couldn't reach/);
    await a.queue(outId);
    const waiting = a.snapshot().transfers.find((t) => t.id === outId)!;
    expect(waiting.queuedUntil).not.toBeNull();
    expect(Date.parse(waiting.queuedUntil!) - Date.now()).toBeGreaterThan(23 * 60 * 60_000);
    expect(waiting.message).toMatch(/Waiting for Laptop\. Farbaek tries again every minute/);

    // A restart of the sending app finds it still waiting, packed again from disk.
    const again = await makeNode("Desk", () => relay.client("agent-desk"), undefined, dataDirs.get(a));
    expect(again.snapshot().transfers).toEqual([expect.objectContaining({ direction: "out", state: "interrupted", queuedUntil: expect.any(String), message: expect.stringMatching(/Waiting for Laptop/) })]);
    await again.close();

    // Still offline: it stays waiting.
    await a.retryQueued();
    await until(() => stateOf(a, outId) === "interrupted");
    expect(a.snapshot().transfers.find((t) => t.id === outId)!.message).toMatch(/Waiting for Laptop/);

    await b.setReachable(true);
    await a.retryQueued();
    await until(() => b.snapshot().transfers.some((t) => t.state === "offered"), 20_000);
    await b.accept(b.snapshot().transfers.find((t) => t.state === "offered")!.id, parent);
    await until(() => stateOf(a, outId) === "done", 30_000);
    await a.retryQueued();
    expect(a.snapshot().transfers.find((t) => t.id === outId)!.queuedUntil).toBeNull();
    expect(JSON.parse(await fs.readFile(path.join(dataDirs.get(a)!, "mesh-queue.json"), "utf8"))).toEqual({ v: 1, entries: [] });
  });

  it("doesn't answer a computer it never paired with, even one claiming to be a paired device", async () => {
    const { a, b, relay } = await apart();
    const stranger = relay.client("agent-stranger");
    // Claims to be Desk, which Laptop trusts, so Laptop joins; the handshake shows its real key.
    const session = await stranger.call(b.fingerprint, a.fingerprint);
    const channel = await initiate(stranger.open(session), generateKeyPair(), { v: 1, name: "Desk", purpose: "transfer" }, 10_000);
    const answer = await channel.receive(10_000).then((r) => r.message).catch(() => null);
    expect(answer).toMatchObject({ t: "error", code: "not_paired" });
    expect(b.snapshot().transfers).toEqual([]);
  });

  it("never pairs through the relay", async () => {
    const { a, b, relay } = await apart();
    const stranger = relay.client("agent-stranger");
    const session = await stranger.call(b.fingerprint, a.fingerprint);
    const channel = await initiate(stranger.open(session), generateKeyPair(), { v: 1, name: "Desk", purpose: "pair" }, 10_000);
    await expect(channel.receive(5_000)).rejects.toThrow();
    // Still the pairing with Desk from the same network; nothing new started.
    expect(b.snapshot().pairing).toMatchObject({ state: "paired", peer: { fingerprint: a.fingerprint } });
    expect(b.snapshot().devices.map((d) => d.name)).toEqual(["Desk"]);
  });

  it("says so when the other computer isn't reachable, and delivers once it is", async () => {
    const { a, b } = await apart();
    await b.setReachable(false);
    const { root } = await sourceFolder();
    const prepared = await a.prepare(root);
    const outId = a.sendOverInternet(prepared.id, b.fingerprint, "relay");
    await until(() => stateOf(a, outId) === "interrupted");
    expect(a.snapshot().transfers.find((t) => t.id === outId)!.message).toMatch(/isn't reachable through Farbaek now/);
    await b.setReachable(true);
    await a.resume(outId);
    await until(() => b.snapshot().transfers.some((t) => t.state === "offered"));
    const parent = await tmp("dest");
    await b.accept(b.snapshot().transfers[0]!.id, parent);
    await until(() => stateOf(a, outId) === "done", 30_000);
  });
});

describe("directly over the internet", { timeout: 60_000 }, () => {
  /** Paired on one network, then apart; both can open direct links unless told otherwise. */
  async function apart(options: { aDirect?: Direct; bDirect?: Direct | null } = {}) {
    const relay = fakeRelay();
    const shared = fakeDirect();
    const { a, b } = await paired({ a: () => relay.client("agent-desk"), b: () => relay.client("agent-laptop"), aDirect: options.aDirect ?? shared, bDirect: options.bDirect === null ? undefined : (options.bDirect ?? shared) });
    await b.setVisible(false);
    await b.setReachable(true);
    return { a, b, relay };
  }

  async function deliver(a: MeshNode, b: MeshNode, outId: string) {
    await until(() => b.snapshot().transfers.some((t) => t.state === "offered"), 20_000);
    const incoming = b.snapshot().transfers.find((t) => t.state === "offered")!;
    await b.accept(incoming.id, await tmp("dest"));
    await until(() => stateOf(a, outId) === "done" && stateOf(b, incoming.id) === "done", 30_000);
    return b.snapshot().transfers.find((t) => t.id === incoming.id)!;
  }

  it("sends straight between the two: the relay only carried the setup", async () => {
    const { a, b, relay } = await apart();
    expect(a.snapshot().relay).toMatchObject({ available: true, direct: true });
    const { root, big } = await sourceFolder();
    const prepared = await a.prepare(root);
    const outId = a.sendOverInternet(prepared.id, b.fingerprint);
    const received = await deliver(a, b, outId);
    expect(received.via).toBe("direct");
    expect(a.snapshot().transfers.find((t) => t.id === outId)!.via).toBe("direct");
    expect(Buffer.compare(await fs.readFile(path.join(received.destination!, "assets", "big.bin")), big)).toBe(0);
    // A few hundred bytes of offer and answer, and none of the files.
    expect(relay.carried().length).toBeLessThan(4_096);
    expect(relay.carried().includes(Buffer.from("README.md"))).toBe(false);
  });

  it("stops when the networks block a direct link, and goes through the relay only when the person chooses it", async () => {
    let blocked = true;
    const direct = fakeDirect({ blocked: () => blocked });
    const { a, b, relay } = await apart({ aDirect: direct, bDirect: direct });
    const { root, big } = await sourceFolder();
    const prepared = await a.prepare(root);
    const outId = a.sendOverInternet(prepared.id, b.fingerprint);
    await until(() => stateOf(a, outId) === "interrupted");
    const stopped = a.snapshot().transfers.find((t) => t.id === outId)!;
    expect(stopped).toMatchObject({ canUseRelay: true, via: "direct" });
    expect(stopped.message).toMatch(/Couldn't open a direct link to Laptop/);
    // Nothing went through the relay without the person choosing it.
    expect(relay.carried().length).toBeLessThan(4_096);
    expect(b.snapshot().transfers).toEqual([]);

    a.useRelay(outId);
    const received = await deliver(a, b, outId);
    expect(received.via).toBe("relay");
    expect(relay.carried().length).toBeGreaterThan(big.length);
    expect(() => a.useRelay(outId)).toThrow(/direct link was blocked/);
    blocked = false;
  });

  it("is declined by a computer that can't open direct links, so the sender is offered the relay", async () => {
    const { a, b } = await apart({ bDirect: null });
    const { root } = await sourceFolder();
    const prepared = await a.prepare(root);
    const outId = a.sendOverInternet(prepared.id, b.fingerprint);
    await until(() => stateOf(a, outId) === "interrupted");
    expect(a.snapshot().transfers.find((t) => t.id === outId)!.canUseRelay).toBe(true);
  });

  it("sends nothing when the link was swapped for someone else's, whatever the server said", async () => {
    let attacker: Duplex | null = null;
    const mitm = fakeDirect({ swap: (end) => (attacker = end) });
    const { a, b } = await apart({ aDirect: mitm, bDirect: mitm });
    const offers: unknown[] = [];
    const { root } = await sourceFolder();
    const prepared = await a.prepare(root);
    const outId = a.sendOverInternet(prepared.id, b.fingerprint);
    await until(() => attacker !== null);
    // The impostor answers the handshake with its own key, and reads whatever comes next.
    const theirs = await respond(attacker!, generateKeyPair(), { v: 1, name: "Laptop" });
    void theirs.receive(5_000).then((m) => offers.push(m.message)).catch(() => undefined);
    await until(() => stateOf(a, outId) === "failed");
    expect(a.snapshot().transfers.find((t) => t.id === outId)!.message).toMatch(/isn't the Laptop you paired with/);
    await new Promise((r) => setTimeout(r, 100));
    expect(offers).toEqual([]);
  });
});
