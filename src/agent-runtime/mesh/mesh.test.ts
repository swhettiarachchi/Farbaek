import { randomBytes } from "node:crypto";
import { EventEmitter } from "node:events";
import { promises as fs } from "node:fs";
import type { Socket } from "node:net";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CHUNK_BYTES, ChunkHasher, blake3Hex, checkManifest, manifestDigest, type CapsuleManifest } from "@/core/mesh/capsule";
import { TRANSFER_LIMITS } from "@/core/mesh/protocol";
import { SecureChannel } from "./channel";
import { FrameError, FramedSocket } from "./framing";
import type { KeyVault } from "./identity";
import { MeshNode } from "./node";
import { packFolder } from "./pack";

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

async function makeNode(name: string): Promise<MeshNode> {
  const node = new MeshNode({ dataDir: await tmp(`data-${name}`), name: () => name, vault: memoryVault(), discovery: false, listenHost: "127.0.0.1", onUpdate: () => undefined });
  await node.init();
  nodes.push(node);
  return node;
}

async function paired(): Promise<{ a: MeshNode; b: MeshNode; port: number }> {
  const a = await makeNode("Desk");
  const b = await makeNode("Laptop");
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
