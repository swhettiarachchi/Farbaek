import { randomBytes } from "node:crypto";
import { EventEmitter } from "node:events";
import { promises as fs } from "node:fs";
import { connect as tcpConnect, createServer, type AddressInfo, type Server, type Socket } from "node:net";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { CHUNK_BYTES, ChunkHasher, blake3Hex, checkManifest, manifestDigest, type CapsuleManifest } from "@/core/mesh/capsule";
import { MAX_UNREVEALED_RUNS, PAIRING_REFUSED_THERE, PAIRING_STEPS_FAILED, PAIRING_TIMED_OUT, runPairingSteps, type PairingCrypto } from "@/core/mesh/pairing";
import { MESH_PROLOGUE, TRANSFER_LIMITS, type MeshMessage } from "@/core/mesh/protocol";
import { duplexPair, type Duplex } from "node:stream";
import { SecureChannel, initiate, respond } from "./channel";
import { fakeDirect } from "./direct-fake";
import { Discovery, MAX_FOUND, MAX_PER_ADDRESS, PER_ADDRESS_LIMIT, localAddresses } from "./discovery";
import { FrameError, FramedSocket } from "./framing";
import type { KeyVault } from "./identity";
import { XXHandshake, generateKeyPair, pairingCode, pairingCommit } from "./noise";
import { MeshNode, type RelayLink } from "./node";
import { fakeRelay } from "./relay-fake";
import { packFolder } from "./pack";
import type { IncomingView } from "./receive";

// Every temp folder made here is removed after this file's tests, so test runs don't fill the disk.
const made: string[] = [];
const tmp = async (name: string) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), `farbaek-mesh-${name}-`));
  made.push(dir);
  return dir;
};
afterAll(() => Promise.all(made.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true }))));
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
/** Listeners a test opened for its own side of a connection. */
const servers: Server[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(nodes.splice(0).map((n) => n.close()));
  for (const s of servers.splice(0)) s.close();
});

type Direct = (signal: Duplex, role: "offer" | "answer") => Promise<Duplex>;

/** Each node's data folder, so a test can start the same device again. */
const dataDirs = new Map<MeshNode, string>();

async function makeNode(name: string | (() => string), relay?: () => RelayLink | string, direct?: Direct, dataDir?: string): Promise<MeshNode> {
  const nameOf = typeof name === "string" ? () => name : name;
  const dir = dataDir ?? (await tmp(`data-${nameOf().replace(/\W/g, "")}`));
  const node = new MeshNode({ dataDir: dir, name: nameOf, vault: memoryVault(), discovery: false, listenHost: "127.0.0.1", relay, direct, onUpdate: () => undefined });
  await node.init();
  nodes.push(node);
  dataDirs.set(node, dir);
  return node;
}

/** The person answering the code on screen, as the window does: naming the pairing they see. */
const confirm = (node: MeshNode, ok: boolean) => node.confirmPairing(node.snapshot().pairing!.id, ok);
const dismiss = (node: MeshNode) => node.dismissPairing(node.snapshot().pairing!.id);

async function paired(relays: { a?: () => RelayLink | string; b?: () => RelayLink | string; aDirect?: Direct; bDirect?: Direct; aName?: () => string } = {}): Promise<{ a: MeshNode; b: MeshNode; port: number }> {
  const a = await makeNode(relays.aName ?? "Desk", relays.a, relays.aDirect);
  const b = await makeNode("Laptop", relays.b, relays.bDirect);
  await b.setVisible(true);
  const port = b.snapshot().visible!.port;
  await a.pair("127.0.0.1", port);
  await until(() => b.snapshot().pairing?.state === "confirming");
  expect(a.snapshot().pairing!.code).toMatch(/^\d{6}$/);
  expect(a.snapshot().pairing!.code).toBe(b.snapshot().pairing!.code);
  await confirm(a, true);
  await confirm(b, true);
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

/** The agent's hashing for the pairing steps, as node.ts uses it. */
const AGENT_PAIRING: PairingCrypto = { random: () => randomBytes(32), commit: pairingCommit, code: pairingCode };
const hex = (bytes: Buffer) => bytes.toString("hex");

/** Two ends of a pairing connection in memory, right after the handshake. */
async function linked(): Promise<{ caller: SecureChannel; answerer: SecureChannel }> {
  const [x, y] = duplexPair();
  const [caller, answerer] = await Promise.all([initiate(x, generateKeyPair(), { v: 1, name: "Desk", purpose: "pair" }), respond(y, generateKeyPair(), { v: 1, name: "Laptop" })]);
  return { caller, answerer };
}

/** A device from before pairing version 2: the same handshake, but its hello says nothing about pairing. */
async function olderDevice(socket: Duplex, initiator: boolean, hello: Record<string, unknown>): Promise<SecureChannel> {
  const framed = new FramedSocket(socket);
  const hs = new XXHandshake({ initiator, prologue: MESH_PROLOGUE, staticKey: generateKeyPair() });
  const payload = Buffer.from(JSON.stringify(hello));
  let theirs: Buffer;
  if (initiator) {
    await framed.write(hs.writeMessage());
    theirs = hs.readMessage(await framed.read(10_000));
    await framed.write(hs.writeMessage(payload));
  } else {
    hs.readMessage(await framed.read(10_000));
    await framed.write(hs.writeMessage(payload));
    theirs = hs.readMessage(await framed.read(10_000));
  }
  return new SecureChannel(framed, hs.result(), { publicKey: hs.remoteStatic!, hello: JSON.parse(theirs.toString("utf8")) }, hs.handshakeHash);
}

const tcp = (port: number) =>
  new Promise<Socket>((resolve, reject) => {
    const socket = tcpConnect({ host: "127.0.0.1", port });
    socket.once("connect", () => resolve(socket));
    socket.once("error", reject);
  });

/** A listener for the test's own side of a connection; closed after the test. */
async function listen(onSocket: (socket: Socket) => void): Promise<number> {
  const server = createServer(onSocket);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  servers.push(server);
  return (server.address() as AddressInfo).port;
}

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
    dismiss(b);
    await c.pair("127.0.0.1", port);
    await until(() => b.snapshot().pairing?.state === "confirming");
    await confirm(b, false);
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

  it("offers nothing when a transfer is cancelled while it's still connecting", async () => {
    const { a, b, port } = await paired();
    const { root } = await sourceFolder();
    const prepared = await a.prepare(root);
    const outId = a.send(prepared.id, b.fingerprint, { address: "127.0.0.1", port });
    expect(stateOf(a, outId)).toBe("connecting");
    await a.cancel(outId);
    // Long enough for the connection to open and, before the fix, for the offer to arrive.
    await new Promise((r) => setTimeout(r, 750));
    expect(stateOf(a, outId)).toBe("cancelled");
    expect(b.snapshot().transfers).toEqual([]);
  });

  it("ends as cancelled, not resumable, when the receiver cancels while the offer waits", async () => {
    const { a, b, port } = await paired();
    const { root } = await sourceFolder();
    const { outId, inId } = await offerTo(a, b, port, root);
    await b.cancel(inId);
    await until(() => stateOf(a, outId) === "cancelled");
    expect(a.snapshot().transfers.find((t) => t.id === outId)!.message).toBe("Laptop cancelled the transfer. Nothing was sent.");
    await expect(a.resume(outId)).rejects.toThrow(/Only an interrupted transfer/);
  });

  it("ends as cancelled, never interrupted, when the receiver cancels while files are streaming", async () => {
    const { a, b, port } = await paired();
    const { root } = await sourceFolder();
    const { outId, inId } = await offerTo(a, b, port, root);
    let pieces = 0;
    const receive = SecureChannel.prototype.receive;
    vi.spyOn(SecureChannel.prototype, "receive").mockImplementation(async function (this: SecureChannel, timeoutMs?: number) {
      const got = await receive.call(this, timeoutMs);
      if (got.message.t === "data" && ++pieces === 20) void b.cancel(inId);
      return got;
    });
    await b.accept(inId, await tmp("dest"));
    await until(() => stateOf(a, outId) === "cancelled" || stateOf(a, outId) === "interrupted");
    await new Promise((r) => setTimeout(r, 1_500));
    expect(stateOf(a, outId)).toBe("cancelled");
    expect(a.snapshot().transfers.find((t) => t.id === outId)!.message).toBe("Laptop cancelled the transfer.");
  });

  it("names an incoming offer as the sender was named when paired, whatever its hello says now", async () => {
    let deskName = "Desk";
    const { a, b, port } = await paired({ aName: () => deskName });
    deskName = "Your bank";
    const { root } = await sourceFolder();
    const { inId } = await offerTo(a, b, port, root);
    expect(b.snapshot().transfers.find((t) => t.id === inId)!.peer.name).toBe("Desk");
  });

  it("remembers where nearby devices are only for paired ones, so made-up announcements can't fill it", async () => {
    const { a, b } = await paired();
    const inside = a as unknown as { discovery: unknown; addresses: Map<string, { address: string; port: number }>; nearbyChanged(): void };
    const strangers = Array.from({ length: 300 }, (_, i) => ({ name: "Stranger", fingerprint: randomBytes(8).toString("hex"), address: `10.0.${i >> 8}.${i & 255}`, port: 4000, seenAt: Date.now() }));
    const laptop = { name: "Laptop", fingerprint: b.fingerprint, address: "10.0.9.7", port: 5000, seenAt: Date.now() };
    inside.discovery = { running: true, devices: () => [...strangers, laptop], stop: () => undefined };
    inside.nearbyChanged();
    expect([...inside.addresses.keys()]).toEqual([b.fingerprint]);
    expect(inside.addresses.get(b.fingerprint)).toEqual({ address: "10.0.9.7", port: 5000 });
    inside.discovery = null;
    await a.forget(b.fingerprint);
    expect(inside.addresses.size).toBe(0);
  });
});

describe("nearby discovery limits", () => {
  const here = (fingerprint: string, port = 4000, name = "Device") => Buffer.from(JSON.stringify({ p: "farbaek-mesh/1", kind: "here", name, fingerprint, port }));
  const fp = () => randomBytes(8).toString("hex");
  /** A Discovery that hasn't opened a socket, fed datagrams directly, on a clock the test moves. */
  function listening(port = 0) {
    let clock = Date.now();
    vi.spyOn(Date, "now").mockImplementation(() => clock);
    const discovery = new Discovery({ self: () => ({ name: "Me", fingerprint: "0".repeat(16), port }), onChange: () => undefined });
    const hear = (data: Buffer, address: string) => (discovery as unknown as { onMessage(data: Buffer, address: string): void }).onMessage(data, address);
    return { discovery, hear, tick: (ms = 1) => void (clock += ms) };
  }

  it("lists at most four devices per address and 64 in all, a new one taking the place of the one heard from longest ago", () => {
    const { discovery, hear, tick } = listening();
    // One address making up fingerprints.
    for (let i = 0; i < 15; i++) hear(here(fp()), "192.168.1.66");
    expect(discovery.devices()).toHaveLength(MAX_PER_ADDRESS);
    // Many addresses: the list stops at 64.
    const first = discovery.devices().map((d) => d.fingerprint);
    for (let a = 0; a < 20; a++) {
      for (let i = 0; i < MAX_PER_ADDRESS; i++) {
        tick();
        hear(here(fp()), `10.0.0.${a}`);
      }
    }
    expect(discovery.devices()).toHaveLength(MAX_FOUND);
    // The earliest ones made way; a newcomer is listed.
    expect(discovery.devices().some((d) => first.includes(d.fingerprint))).toBe(false);
    tick();
    const newcomer = fp();
    hear(here(newcomer), "172.16.0.1");
    expect(discovery.devices()).toHaveLength(MAX_FOUND);
    expect(discovery.devices().some((d) => d.fingerprint === newcomer)).toBe(true);
  });

  it("counts only valid announcements against an address, and hears each address at most 20 times a window", () => {
    const { discovery, hear, tick } = listening();
    for (let i = 0; i < 200; i++) hear(Buffer.from(`not an announcement ${i}`), "192.168.1.66");
    const device = fp();
    hear(here(device, 4000), "192.168.1.66");
    expect(discovery.devices().map((d) => d.port)).toEqual([4000]);
    // Updates from that address stop once it has been heard 20 times this window.
    for (let i = 1; i <= 30; i++) hear(here(device, 4000 + i), "192.168.1.66");
    expect(discovery.devices()[0]!.port).toBe(4000 + PER_ADDRESS_LIMIT.count - 1);
    tick(PER_ADDRESS_LIMIT.windowMs);
    hear(here(device, 4999), "192.168.1.66");
    expect(discovery.devices()[0]!.port).toBe(4999);
  });

  it("answers \"who\" at most once a second, however many ask", () => {
    const { discovery, hear, tick } = listening(4000);
    const send = vi.fn();
    (discovery as unknown as { socket: unknown }).socket = { send, setMulticastInterface: () => undefined };
    const perAnswer = Math.max(1, localAddresses().length);
    const who = () => Buffer.from(JSON.stringify({ p: "farbaek-mesh/1", kind: "who", name: "Asker", fingerprint: fp(), port: 0 }));
    for (let i = 0; i < 50; i++) hear(who(), `10.0.1.${i}`);
    expect(send).toHaveBeenCalledTimes(perAnswer);
    tick(1_000);
    hear(who(), "10.0.2.1");
    expect(send).toHaveBeenCalledTimes(2 * perAnswer);
    (discovery as unknown as { socket: unknown }).socket = null;
  });
});

describe("pairing version 2 (ADR 0194)", { timeout: 30_000 }, () => {
  it("runs commit, nonce and reveal on both sides to the same code; every hello says pairing 2", async () => {
    const { caller, answerer } = await linked();
    expect(caller.peer.hello.pairing).toBe(2);
    expect(answerer.peer.hello.pairing).toBe(2);
    const [mine, theirs] = await Promise.all([runPairingSteps("caller", caller, caller.handshakeHash, AGENT_PAIRING), runPairingSteps("answerer", answerer, answerer.handshakeHash, AGENT_PAIRING)]);
    expect(mine).toMatch(/^\d{6}$/);
    expect(mine).toBe(theirs);
  });

  it("pairs two computers with the same code, made only after the commit, nonce and reveal, then both confirm", async () => {
    const sent: string[] = [];
    const real = SecureChannel.prototype.send;
    vi.spyOn(SecureChannel.prototype, "send").mockImplementation(function (this: SecureChannel, message, body) {
      sent.push(message.t);
      return real.call(this, message, body);
    });
    const { a, b } = await paired();
    expect(sent).toEqual(["pair-commit", "pair-nonce", "pair-reveal", "pair-confirm", "pair-confirm"]);
    expect(a.snapshot().devices.map((d) => d.name)).toEqual(["Laptop"]);
    expect(b.snapshot().devices.map((d) => d.name)).toEqual(["Desk"]);
  });

  it("makes the answerer's code only once the reveal has been checked", async () => {
    const { caller, answerer } = await linked();
    const code = runPairingSteps("answerer", answerer, answerer.handshakeHash, AGENT_PAIRING);
    const callerValue = randomBytes(32);
    await caller.send({ t: "pair-commit", commit: pairingCommit(callerValue) });
    const nonce = (await caller.receive(5_000)).message;
    if (nonce.t !== "pair-nonce") throw new Error(`Expected a nonce, got ${nonce.t}`);
    expect(await Promise.race([code.then(() => "a code"), new Promise((r) => setTimeout(() => r("no code yet"), 200))])).toBe("no code yet");
    await caller.send({ t: "pair-reveal", nonce: hex(callerValue) });
    expect(await code).toBe(pairingCode(caller.handshakeHash, callerValue, Buffer.from(nonce.nonce, "hex")));
  });

  it("an answerer never sends its value before the caller's commit, and a caller never reveals before the answerer's value", async () => {
    // The attack needed one side to choose its value knowing the other's. Neither ever goes first out of turn.
    const one = await linked();
    const answering = runPairingSteps("answerer", one.answerer, one.answerer.handshakeHash, AGENT_PAIRING).catch(() => null);
    await expect(one.caller.receive(300)).rejects.toThrow(FrameError);
    await one.caller.send({ t: "pair-commit", commit: pairingCommit(randomBytes(32)) });
    expect((await one.caller.receive(5_000)).message.t).toBe("pair-nonce");
    one.caller.close();
    one.answerer.close();
    expect(await answering).toBeNull();

    const two = await linked();
    const calling = runPairingSteps("caller", two.caller, two.caller.handshakeHash, AGENT_PAIRING);
    const commit = (await two.answerer.receive(5_000)).message;
    if (commit.t !== "pair-commit") throw new Error(`Expected a commit, got ${commit.t}`);
    await expect(two.answerer.receive(300)).rejects.toThrow(FrameError);
    const answererValue = randomBytes(32);
    await two.answerer.send({ t: "pair-nonce", nonce: hex(answererValue) });
    const reveal = (await two.answerer.receive(5_000)).message;
    if (reveal.t !== "pair-reveal") throw new Error(`Expected a reveal, got ${reveal.t}`);
    const callerValue = Buffer.from(reveal.nonce, "hex");
    expect(pairingCommit(callerValue)).toBe(commit.commit);
    expect(await calling).toBe(pairingCode(two.answerer.handshakeHash, callerValue, answererValue));
    two.caller.close();
    two.answerer.close();
  });

  const someValue = () => hex(randomBytes(32));
  // The last column: whether the answerer had sent its nonce, so the run counts against the caller.
  const cases: [string, "caller" | "answerer", () => MeshMessage[], boolean][] = [
    ["a reveal that doesn't match the commit", "answerer", () => [{ t: "pair-commit", commit: pairingCommit(randomBytes(32)) }, { t: "pair-reveal", nonce: someValue() }], true],
    ["a nonce before a commit", "answerer", () => [{ t: "pair-nonce", nonce: someValue() }], false],
    ["a reveal before a commit", "answerer", () => [{ t: "pair-reveal", nonce: someValue() }], false],
    ["a repeated commit", "answerer", () => [{ t: "pair-commit", commit: pairingCommit(randomBytes(32)) }, { t: "pair-commit", commit: pairingCommit(randomBytes(32)) }], true],
    ["a confirmation before any code", "answerer", () => [{ t: "pair-confirm", ok: true }], false],
    ["a commit in capital letters", "answerer", () => [{ t: "pair-commit", commit: pairingCommit(randomBytes(32)).toUpperCase() }], false],
    ["a commit one character short", "answerer", () => [{ t: "pair-commit", commit: pairingCommit(randomBytes(32)).slice(1) }], false],
    ["a reveal where the nonce belongs", "caller", () => [{ t: "pair-reveal", nonce: someValue() }], false],
    ["a second commit where the nonce belongs", "caller", () => [{ t: "pair-commit", commit: pairingCommit(randomBytes(32)) }], false],
    ["a nonce of 31 bytes", "caller", () => [{ t: "pair-nonce", nonce: hex(randomBytes(31)) }], false],
  ];
  it.each(cases)("fails closed on %s", async (_, role, messages, afterNonce) => {
    const { caller, answerer } = await linked();
    const [mine, other] = role === "answerer" ? [answerer, caller] : [caller, answerer];
    const steps = runPairingSteps(role, mine, mine.handshakeHash, AGENT_PAIRING);
    for (const message of messages()) await other.send(message).catch(() => undefined);
    await expect(steps).rejects.toMatchObject({ name: "PairingError", message: PAIRING_STEPS_FAILED, afterNonce });
    mine.close();
    other.close();
  });

  it("counts an answerer's run against the caller when the caller goes quiet or quits after the nonce", async () => {
    const quiet = await linked();
    const waiting = runPairingSteps("answerer", quiet.answerer, quiet.answerer.handshakeHash, AGENT_PAIRING, 300);
    await quiet.caller.send({ t: "pair-commit", commit: pairingCommit(randomBytes(32)) });
    await expect(waiting).rejects.toMatchObject({ message: PAIRING_TIMED_OUT, afterNonce: true });
    // Over TCP, so the caller closing reaches the answerer as it would on a network.
    const answering: Promise<SecureChannel>[] = [];
    const port = await listen((socket) => void answering.push(respond(socket, generateKeyPair(), { v: 1, name: "Laptop" })));
    const goneCaller = await initiate(await tcp(port), generateKeyPair(), { v: 1, name: "Desk", purpose: "pair" });
    await until(() => answering.length === 1);
    const gone = { caller: goneCaller, answerer: await answering[0]! };
    const left = runPairingSteps("answerer", gone.answerer, gone.answerer.handshakeHash, AGENT_PAIRING);
    await gone.caller.send({ t: "pair-commit", commit: pairingCommit(randomBytes(32)) });
    await gone.caller.receive(5_000);
    gone.caller.close();
    await expect(left).rejects.toMatchObject({ message: PAIRING_STEPS_FAILED, afterNonce: true });
    for (const c of [quiet.caller, quiet.answerer, gone.answerer]) c.close();
  });

  it("fails closed, saying it took too long, when the steps don't finish in time", async () => {
    const { caller, answerer } = await linked();
    await expect(runPairingSteps("answerer", answerer, answerer.handshakeHash, AGENT_PAIRING, 200)).rejects.toMatchObject({ name: "PairingError", message: PAIRING_TIMED_OUT, afterNonce: false });
    caller.close();
    answerer.close();
  });

  it("shows nothing while the steps run, and no code at all when the reveal doesn't match the commit", async () => {
    const b = await makeNode("Laptop");
    await b.setVisible(true);
    const channel = await initiate(await tcp(b.snapshot().visible!.port), generateKeyPair(), { v: 1, name: "Mallory", purpose: "pair" });
    await channel.send({ t: "pair-commit", commit: pairingCommit(randomBytes(32)) });
    expect((await channel.receive(5_000)).message.t).toBe("pair-nonce");
    expect(b.snapshot().pairing).toBeNull();
    // A value other than the committed one, as someone steering the code after seeing the nonce would send.
    await channel.send({ t: "pair-reveal", nonce: someValue() });
    await until(() => b.snapshot().pairing?.state === "failed");
    expect(b.snapshot().pairing).toMatchObject({ code: null, message: PAIRING_STEPS_FAILED, peer: { name: "Mallory" } });
    await confirm(b, true);
    expect(b.snapshot().devices).toEqual([]);
  });

  it("fails a pairing that gets a repeated step after the code is shown", async () => {
    const b = await makeNode("Laptop");
    await b.setVisible(true);
    const channel = await initiate(await tcp(b.snapshot().visible!.port), generateKeyPair(), { v: 1, name: "Desk", purpose: "pair" });
    const callerValue = randomBytes(32);
    await channel.send({ t: "pair-commit", commit: pairingCommit(callerValue) });
    await channel.receive(5_000);
    await channel.send({ t: "pair-reveal", nonce: hex(callerValue) });
    await until(() => b.snapshot().pairing?.state === "confirming");
    await channel.send({ t: "pair-reveal", nonce: hex(callerValue) });
    await until(() => b.snapshot().pairing?.state === "failed");
    expect(b.snapshot().pairing!.message).toBe(PAIRING_STEPS_FAILED);
    await confirm(b, true);
    expect(b.snapshot().devices).toEqual([]);
  });

  it("refuses an older computer that calls to pair, before any code exists, and tells it why", async () => {
    const b = await makeNode("Laptop");
    await b.setVisible(true);
    const old = await olderDevice(await tcp(b.snapshot().visible!.port), true, { v: 1, name: "Old desk", purpose: "pair" });
    expect(old.peer.hello.pairing).toBe(2);
    // Its first and only message is the refusal: no nonce, no code.
    expect((await old.receive(5_000)).message).toEqual({ t: "error", code: "protocol", message: PAIRING_REFUSED_THERE });
    await until(() => b.snapshot().pairing?.state === "failed");
    expect(b.snapshot().pairing).toMatchObject({ code: null, message: "Update Farbaek on Old desk to pair: pairing changed to keep it safe." });
    expect(b.snapshot().devices).toEqual([]);
  });

  it("refuses to pair with an older computer it calls, before any code exists", async () => {
    const a = await makeNode("Desk");
    const heard: MeshMessage[] = [];
    const port = await listen((socket) => {
      void olderDevice(socket, false, { v: 1, name: "Old laptop" })
        .then((old) => old.receive(5_000))
        .then((r) => heard.push(r.message))
        .catch(() => undefined);
    });
    await a.pair("127.0.0.1", port);
    expect(a.snapshot().pairing).toMatchObject({ state: "failed", code: null, message: "Update Farbaek on Old laptop to pair: pairing changed to keep it safe." });
    await until(() => heard.length === 1);
    expect(heard[0]).toEqual({ t: "error", code: "protocol", message: PAIRING_REFUSED_THERE });
    expect(a.snapshot().devices).toEqual([]);
  });

  it("stops answering after a middle device twice quits before revealing, for it and the real phone alike, until visibility is turned off and on", async () => {
    // The review's attack: the caller knows the answerer's code before it reveals, so a device in
    // the middle passes the phone's commit and the desk's nonce through, works out both codes, and
    // quits before revealing to the desk whenever they differ, hoping to get many tries unseen.
    const desk = await makeNode("Desk");
    const phone = await makeNode("Phone");
    await desk.setVisible(true);
    const deskPort = desk.snapshot().visible!.port;
    const mallory = generateKeyPair();
    /** What the desk answered each of the middle's commits with. */
    const deskAnswers: string[] = [];
    const middlePort = await listen((socket) => {
      void (async () => {
        const fromPhone = await respond(socket, mallory, { v: 1, name: "Desk" });
        const toDesk = await initiate(await tcp(deskPort), mallory, { v: 1, name: "Phone", purpose: "pair" });
        await toDesk.send((await fromPhone.receive(5_000)).message);
        const answer = (await toDesk.receive(5_000)).message;
        deskAnswers.push(answer.t);
        if (answer.t === "pair-nonce") {
          await fromPhone.send(answer);
          // The phone's reveal: the middle now knows both codes, and the desk's doesn't suit it.
          await fromPhone.receive(5_000);
        }
        toDesk.close();
        fromPhone.close();
      })().catch(() => undefined);
    });
    const settled = (node: MeshNode) => !["confirming", "waiting"].includes(node.snapshot().pairing?.state ?? "");

    for (let attempt = 1; attempt <= MAX_UNREVEALED_RUNS + 1; attempt++) {
      await phone.pair("127.0.0.1", middlePort);
      await until(() => deskAnswers.length === attempt && settled(phone));
      if (attempt > MAX_UNREVEALED_RUNS) break;
      // Each try shows on the desk, with no code, until the person dismisses it.
      await until(() => desk.snapshot().pairing?.state === "failed");
      if (attempt === MAX_UNREVEALED_RUNS) await until(() => desk.snapshot().pairing!.message!.endsWith("Pairing is paused on this device: turn visibility off and on to pair again."));
      expect(desk.snapshot().pairing).toMatchObject({ code: null, message: expect.stringContaining(PAIRING_STEPS_FAILED) });
      dismiss(desk);
    }
    // Two tries saw a nonce, so the middle had two one-in-a-million chances this window; the third was refused.
    expect(deskAnswers).toEqual(["pair-nonce", "pair-nonce", "error"]);
    expect(deskAnswers.filter((t) => t === "pair-nonce")).toHaveLength(MAX_UNREVEALED_RUNS);
    expect(desk.snapshot().pairing).toBeNull();

    // The real phone is refused too, before any code.
    await phone.pair("127.0.0.1", deskPort);
    expect(phone.snapshot().pairing).toMatchObject({ state: "failed", code: null, message: expect.stringMatching(/^Desk can't pair right now/) });
    expect(desk.snapshot().pairing).toBeNull();

    // Visibility off and on: pairing works again.
    await desk.setVisible(false);
    await desk.setVisible(true);
    await phone.pair("127.0.0.1", desk.snapshot().visible!.port);
    await until(() => desk.snapshot().pairing?.state === "confirming");
    expect(phone.snapshot().pairing!.code).toBe(desk.snapshot().pairing!.code);
    await confirm(phone, true);
    await confirm(desk, true);
    await until(() => desk.snapshot().pairing?.state === "paired");
    expect(desk.snapshot().devices.map((d) => d.name)).toEqual(["Phone"]);
  });

  it("keeps a pairing on screen until it's dismissed, and an answer meant for it never confirms a newer one", async () => {
    const desk = await makeNode("Desk");
    const phone = await makeNode("Phone");
    await desk.setVisible(true);
    const port = desk.snapshot().visible!.port;
    await phone.pair("127.0.0.1", port);
    await until(() => desk.snapshot().pairing?.state === "confirming");
    const first = desk.snapshot().pairing!.id;
    // The call drops before anyone confirms, as when a middle device closes it.
    dismiss(phone);
    await until(() => desk.snapshot().pairing?.state === "failed");
    // A new call while it's on screen is turned away, and doesn't replace it.
    await phone.pair("127.0.0.1", port);
    expect(phone.snapshot().pairing).toMatchObject({ state: "failed", message: expect.stringMatching(/^Desk can't pair right now/) });
    expect(desk.snapshot().pairing!.id).toBe(first);

    // The person dismisses it; a new pairing arrives; a click meant for the first lands late.
    dismiss(desk);
    await phone.pair("127.0.0.1", port);
    await until(() => desk.snapshot().pairing?.state === "confirming");
    const second = desk.snapshot().pairing!.id;
    expect(second).not.toBe(first);
    await expect(desk.confirmPairing(first, true)).rejects.toThrow(/has ended, so nothing was confirmed/);
    expect(() => desk.dismissPairing(first)).toThrow(/no longer on screen/);
    await confirm(phone, true);
    await new Promise((r) => setTimeout(r, 300));
    expect(desk.snapshot().pairing).toMatchObject({ id: second, state: "confirming" });
    expect(desk.snapshot().devices).toEqual([]);
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
