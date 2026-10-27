/**
 * A browser and a Farbaek Agent through Farbaek's relay (ADR 0096), end to
 * end: the browser's own code (Web Crypto Noise, wire, relay pipe, pairing,
 * sender) against a real MeshNode, with the real relay hub in between.
 */
import { randomBytes } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { MeshNode } from "@/agent-runtime/mesh/node";
import { fakeRelay } from "@/agent-runtime/mesh/relay-fake";
import { generateWebKeyPair, webFingerprint, type WebKeyPair } from "./noise";
import { packPicked } from "./pack";
import { WebPairing, type PairedComputer } from "./pair";
import { WebRelay } from "./relay-pipe";
import { WebOutgoing } from "./send";
import { initiateWeb } from "./wire";

const tmp = (name: string) => fs.mkdtemp(path.join(os.tmpdir(), `farbaek-web-${name}-`));
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

async function pairPhone(computer: MeshNode, web: WebRelay, key: WebKeyPair, me: string): Promise<{ pairing: WebPairing; trusted: PairedComputer[] }> {
  computer.openRelayPairing();
  const session = await web.call(computer.fingerprint, me, "pair");
  const channel = await initiateWeb(web.open(session), key, { v: 1, name: "Suvin's phone", purpose: "pair" }, 10_000);
  const trusted: PairedComputer[] = [];
  const pairing = await WebPairing.start(channel, () => undefined, async (c) => void trusted.push(c));
  await until(() => computer.snapshot().pairing?.state === "confirming");
  expect(computer.snapshot().pairing!.code).toBe(pairing.code);
  await computer.confirmPairing(true);
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

  it("leaves out credentials files and secret-looking text, and refuses when nothing is left", async () => {
    const secret = ["sk", "live", "x".repeat(24)].join("_");
    const packed = await packPicked([new File(["fine"], "fine.txt"), new File([`KEY=${secret}`], "config.txt"), new File(["TOKEN=x"], ".env")], "Files");
    expect(packed.manifest.files.map((f) => f.path)).toEqual(["fine.txt"]);
    expect(packed.excluded.map((e) => e.reason).sort()).toEqual(["secret_content", "secret_file"]);
    await expect(packPicked([new File(["TOKEN=x"], ".env")], "Files")).rejects.toThrow(/None of these files can be sent/);
  });
});
