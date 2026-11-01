/**
 * Sensitive information disclosure, system prompt leakage and improper output
 * handling (LLM02, LLM05, LLM07). Secret-shaped values are built at run time
 * so no credential-looking string sits in the repository.
 */
import { promises as fsp } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { commandEnv } from "@/agent-runtime/broker";
import { initiate, respond } from "@/agent-runtime/mesh/channel";
import { XXHandshake, fingerprint, generateKeyPair, pairingCode } from "@/agent-runtime/mesh/noise";
import { MESH_PROLOGUE } from "@/core/mesh/protocol";
import { WebXXHandshake, generateWebKeyPair, webFingerprint, webPairingCode } from "@/core/mesh/web/noise";
import { WebMeshListener, type TrustedComputer } from "@/core/mesh/web/listen";
import { packPicked } from "@/core/mesh/web/pack";
import type { WebIncoming } from "@/core/mesh/web/receive";
import { WebRelay } from "@/core/mesh/web/relay-pipe";
import { memorySink } from "@/core/mesh/web/sinks";
import { initiateWeb } from "@/core/mesh/web/wire";
import { manifestDigest } from "@/core/mesh/capsule";
import { MeshNode } from "@/agent-runtime/mesh/node";
import { fakeDirect } from "@/agent-runtime/mesh/direct-fake";
import { fakeRelay } from "@/agent-runtime/mesh/relay-fake";
import { buildResponse, parseRequest } from "../../deploy/vps/stun/stun-server.mjs";
import { agentSystemPrompt, openingMessage } from "@/agent-runtime/loop";
import { decide } from "@/core/agent/permissions";
import { ContractDraftSchema, draftToForm } from "@/core/realityloop/contract-draft";
import { acceptSuggestion, type LensRequest } from "@/core/realityloop/lens-suggestion";
import { containsSecret, screenFile } from "@/core/workspace/files";
import { redact } from "@/server/observability/log";
import { CONTRACT, project, type Project } from "./support";

const fake = {
  anthropic: ["sk", "ant", "api03"].join("-") + "-" + "Q".repeat(40),
  aws: "AKIA" + "Z".repeat(16),
  github: "ghp" + "_" + "x".repeat(36),
  supabase: "sb" + "_secret_" + "y".repeat(24),
  stripe: "sk" + "_live_" + "w".repeat(24),
  pem: ["-----BEGIN", "RSA PRIVATE KEY-----"].join(" ") + "\nMIIE\n-----END RSA PRIVATE KEY-----",
};

let p: Project | null = null;
afterEach(async () => {
  await p?.cleanup();
  p = null;
});

describe("SE-014 Secrets written into the project", () => {
  it("refuses credential files and credential-shaped content on import", () => {
    for (const name of [".env", ".env.production", "id_rsa", "server.pem", "deploy.key", ".npmrc", "credentials.json"]) {
      expect(screenFile(name, "x", 1, 1_000_000), name).toMatchObject({ ok: false, reason: "secret_file" });
    }
    expect(screenFile(".env.example", "API_KEY=", 8, 1_000_000)).toMatchObject({ ok: true });
    for (const [kind, value] of Object.entries(fake)) {
      expect(containsSecret(`const key = "${value}";`), kind).toBe(true);
      expect(screenFile("src/config.ts", `export const key = "${value}";\n`, 80, 1_000_000), kind).toMatchObject({ ok: false, reason: "secret_content" });
    }
  });

  it("refuses the agent writing a credential into a file it may otherwise change", () => {
    const ctx = { mode: "controlled" as const, contract: CONTRACT, sandboxVerified: false, exists: (path: string) => path === "README.md" };
    expect(decide({ name: "write_file", input: { path: "docs/setup.md", content: `Use ${fake.anthropic}`, reason: "r" } }, ctx)).toMatchObject({ kind: "deny", reason: expect.stringMatching(/secret/) });
    expect(decide({ name: "edit_file", input: { path: "README.md", edits: [{ find: "tests", replace: fake.github }], reason: "r" } }, ctx)).toMatchObject({ kind: "deny" });
    expect(decide({ name: "write_file", input: { path: "docs/.env", content: "X=1", reason: "r" } }, ctx)).toMatchObject({ kind: "deny" });
  });
});

describe("SE-015 Secrets inherited by commands", () => {
  it("passes only allowlisted variable names to commands", () => {
    const env = commandEnv({
      PATH: "/usr/bin",
      HOME: "/home/dev",
      ANTHROPIC_API_KEY: fake.anthropic,
      SUPABASE_SECRET_KEY: fake.supabase,
      AWS_SECRET_ACCESS_KEY: "s".repeat(40),
      GITHUB_TOKEN: fake.github,
      DATABASE_URL: "postgres://user:pass@db/prod",
      NPM_TOKEN: "n".repeat(36),
      NODE_OPTIONS: "--require /tmp/evil.js",
    });
    expect(Object.keys(env).sort()).toEqual(["CI", "FORCE_COLOR", "HOME", "NO_COLOR", "NO_UPDATE_NOTIFIER", "PATH"]);
    expect(JSON.stringify(env)).not.toMatch(/pass@db|evil\.js/);
  });
});

describe("SE-016 Secrets in what the model reads", () => {
  it("keeps environment values out of the system prompt and the opening message, and redacts secrets in run events", async () => {
    const planted = `planted-${"v".repeat(24)}`;
    process.env.FARBAEK_EVAL_PLANTED = planted;
    try {
      p = await project({ "README.md": "# Demo\n" });
      const ws = await p.workspace("patch");
      const texts = [
        agentSystemPrompt("review_only", null),
        agentSystemPrompt("controlled", "local"),
        agentSystemPrompt("sandboxed_autopilot", "sandbox"),
        openingMessage({ task: { id: "t1", title: "Name the test command", contractVersion: 1, contract: CONTRACT }, mode: "controlled", workspace: ws }),
      ];
      for (const t of texts) {
        expect(t).not.toContain(planted);
        for (const value of Object.values(process.env)) if (value && value.length >= 12) expect(t.includes(value)).toBe(false);
      }
    } finally {
      delete process.env.FARBAEK_EVAL_PLANTED;
    }
    // Run events (shown to people and logged) have secrets taken out.
    expect(redact(`curl -H "Authorization: Bearer x" -d api_key=${fake.anthropic}`)).not.toContain(fake.anthropic);
    expect(redact(`token: ${"t".repeat(30)}`)).toBe("token: [redacted]");
    // A bare key (no "name:" before it) is replaced, and the rest of the text is kept as it was.
    expect(redact(`Claude said: invalid key ${fake.anthropic} on this request`)).toBe("Claude said: invalid key [redacted] on this request");
    expect(redact(`${fake.supabase} then ${fake.anthropic}`)).toBe("[redacted] then [redacted]");
  });
});

describe("SE-017 Model output trusted as fact", () => {
  it("keeps only AI suggestions for hunks that were sent and clauses that exist", () => {
    const request: LensRequest = {
      clauses: [{ id: "outcome", label: "Outcome", statement: "s" }, { id: "ac-1", label: "AC-1", statement: "s" }],
      hunks: [{ id: "f0h0", path: "README.md", range: "1", reason: "", flags: [], removed: [], added: [] }],
    };
    const accepted = acceptSuggestion(request, {
      mappings: [
        { hunk: "f9h9", clause: "ac-1", reason: "A hunk that was never sent." },
        { hunk: "f0h0", clause: "ac-99", reason: "A clause the contract doesn't have." },
        { hunk: "f0h0", clause: "AC-1", reason: "  The real\nmapping.  " },
        { hunk: "f0h0", clause: "outcome", reason: "A second answer for the same hunk." },
      ],
    });
    expect(accepted).toEqual([{ hunk: "f0h0", clause: "ac-1", reason: "The real mapping." }]);
  });

  it("refuses AI contract drafts that don't match the schema, and never lets one allow what it also forbids", () => {
    expect(ContractDraftSchema.safeParse({ outcome: "x" }).success).toBe(false);
    expect(ContractDraftSchema.safeParse({ outcome: 1, resources: "all" }).success).toBe(false);
    const draft = ContractDraftSchema.parse({
      outcome: "Ship it.\u0000\u001b[31m",
      resources: ["src"],
      allowedOperations: ["files.edit", "files.delete"],
      forbiddenOperations: ["files.delete"],
      protectedFields: [],
      protectedInvariants: [],
      acceptanceCriteria: [{ statement: "Works.", verification: "manual" }],
      requiredChecks: ["pnpm test"],
      assumptions: [],
      openQuestions: [],
      recovery: "Revert.",
      maxRecords: 1e12,
    });
    const form = draftToForm(draft);
    expect(form.allowed).toBe("files.edit");
    expect(form.forbidden).toBe("files.delete");
    expect(form.outcome).not.toMatch(/[\u0000-\u001f]/);
    expect(form.maxRecords).toBe("");
  });
});

describe("SE-031 A relay that could read or redirect a transfer", () => {
  it("carries only ciphertext between two agents of one workspace, never pairs, refuses keys it didn't pair, and keeps nothing", async () => {
    const relay = fakeRelay();
    const desk = relay.client("agent-desk");
    const laptop = relay.client("agent-laptop");
    const deskKey = generateKeyPair();
    const laptopKey = generateKeyPair();
    await laptop.setReachable(fingerprint(laptopKey.publicKey), true);

    // A whole Noise channel through the relay: the secret never crosses it in the clear.
    const secret = "project-secret-" + "s".repeat(24);
    const session = await desk.call(fingerprint(laptopKey.publicKey), fingerprint(deskKey.publicKey));
    const [call] = await laptop.waitForCalls(1);
    await laptop.join(call!.session);
    const [caller, callee] = await Promise.all([
      initiate(desk.open(session), deskKey, { v: 1, name: "Desk", purpose: "transfer" }, 10_000),
      respond(laptop.open(session), laptopKey, { v: 1, name: "Laptop" }),
    ]);
    expect(Buffer.compare(callee.peer.publicKey, deskKey.publicKey)).toBe(0);
    await caller.send({ t: "error", code: "internal", message: secret });
    expect((await callee.receive(5_000)).message).toMatchObject({ message: secret });
    expect(relay.carried().includes(Buffer.from(secret))).toBe(false);
    caller.close();
    callee.close();

    // No call reaches another workspace's agent, even by its fingerprint.
    const stranger = relay.client("agent-elsewhere", "org-2");
    await expect(stranger.call(fingerprint(laptopKey.publicKey), fingerprint(deskKey.publicKey))).rejects.toThrow(/isn't reachable/);

    // A real agent that trusts one device: a caller claiming that device is answered, but gets no pairing and no transfer.
    const dataDir = await fsp.mkdtemp(path.join(os.tmpdir(), "farbaek-se031-"));
    const trusted = generateKeyPair();
    await fsp.writeFile(path.join(dataDir, "mesh-devices.json"), JSON.stringify([{ fingerprint: fingerprint(trusted.publicKey), name: "Desk", publicKey: trusted.publicKey.toString("hex"), pairedAt: new Date().toISOString() }]));
    let value: string | null = null;
    const node = new MeshNode({ dataDir, name: () => "Office", vault: { get: async () => value, set: async (v) => void (value = v) }, discovery: false, relay: () => relay.client("agent-office"), onUpdate: () => undefined });
    await node.init();
    try {
      await node.setReachable(true);
      const impostor = relay.client("agent-impostor");
      for (const purpose of ["pair", "transfer"] as const) {
        const s2 = await impostor.call(node.fingerprint, fingerprint(trusted.publicKey));
        const channel = await initiate(impostor.open(s2), generateKeyPair(), { v: 1, name: "Desk", purpose }, 10_000);
        const answer = await channel.receive(5_000).then((r) => r.message).catch(() => null);
        expect(answer === null || (answer.t === "error" && answer.code === "not_paired")).toBe(true);
        channel.close();
      }
      expect(node.snapshot().pairing).toBeNull();
      expect(node.snapshot().devices.map((d) => d.name)).toEqual(["Desk"]);
      expect(node.snapshot().transfers).toEqual([]);
    } finally {
      await node.close();
    }
    await new Promise((r) => setTimeout(r, 50));
    expect(relay.hub.stats().bufferedBytes).toBe(0);
  }, 30_000);
});

describe("SE-032 A direct link set up by an untrusted server", () => {
  it("carries nothing to a link the server swapped, keeps file bytes off the server, and runs no amplifying STUN", async () => {
    // The setup messages pass through the server, which hands the caller a link to an impostor instead.
    const relay = fakeRelay();
    let impostor: import("node:stream").Duplex | null = null;
    const direct = fakeDirect({ swap: (end) => (impostor = end) });
    const caller = relay.client("agent-desk");
    const callee = relay.client("agent-laptop");
    const deskKey = generateKeyPair();
    const laptopKey = generateKeyPair();
    await callee.setReachable(fingerprint(laptopKey.publicKey), true);
    const session = await caller.call(fingerprint(laptopKey.publicKey), fingerprint(deskKey.publicKey), "direct");
    const [call] = await callee.waitForCalls(1);
    expect(call!.mode).toBe("direct");
    await callee.join(call!.session);
    const [deskLink] = await Promise.all([direct(caller.open(session), "offer"), direct(callee.open(session), "answer")]);
    const fake = respond(impostor!, generateKeyPair(), { v: 1, name: "Laptop" });
    const channel = await initiate(deskLink, deskKey, { v: 1, name: "Desk", purpose: "transfer" }, 5_000);
    await fake;
    // The Noise handshake shows the impostor's key, not the paired one: an agent stops before offering anything.
    expect(Buffer.compare(channel.peer.publicKey, laptopKey.publicKey)).not.toBe(0);
    channel.close();
    // Only the offer and answer crossed the server.
    expect(relay.carried().length).toBeLessThan(1_024);

    // STUN: junk gets no answer, and an answer is never much larger than what was asked.
    expect(parseRequest(Buffer.from("x".repeat(40)))).toBeNull();
    const request = Buffer.alloc(20);
    request.writeUInt16BE(1, 0);
    request.writeUInt32BE(0x2112a442, 4);
    const txid = parseRequest(request)!;
    expect(buildResponse(txid, "2001:db8::1", 40_000).length).toBeLessThanOrEqual(request.length * 3);
  }, 30_000);
});

describe("SE-033 A phone paired by someone in the middle", () => {
  it("pairs only in the computer's window, shows different codes when relayed through someone, and stays in its workspace", async () => {
    // Someone in the middle runs one handshake with the phone and another with the computer.
    const phone = new WebXXHandshake({ initiator: true, prologue: MESH_PROLOGUE, staticKey: await generateWebKeyPair() });
    const middleToPhone = new XXHandshake({ initiator: false, prologue: MESH_PROLOGUE, staticKey: generateKeyPair() });
    middleToPhone.readMessage(Buffer.from(await phone.writeMessage()));
    await phone.readMessage(middleToPhone.writeMessage());
    middleToPhone.readMessage(Buffer.from(await phone.writeMessage()));
    const middleToComputer = new XXHandshake({ initiator: true, prologue: MESH_PROLOGUE, staticKey: generateKeyPair() });
    const computer = new XXHandshake({ initiator: false, prologue: MESH_PROLOGUE, staticKey: generateKeyPair() });
    computer.readMessage(middleToComputer.writeMessage());
    middleToComputer.readMessage(computer.writeMessage());
    computer.readMessage(middleToComputer.writeMessage());
    // The two people see different codes, so they don't confirm.
    expect(await webPairingCode(phone.handshakeHash)).not.toBe(pairingCode(computer.handshakeHash));

    // A computer with no pairing window open doesn't answer a pairing call.
    const relay = fakeRelay();
    let value: string | null = null;
    const dataDir = await fsp.mkdtemp(path.join(os.tmpdir(), "farbaek-se033-"));
    const node = new MeshNode({ dataDir, name: () => "Studio PC", vault: { get: async () => value, set: async (v) => void (value = v) }, discovery: false, relay: () => relay.client("agent-studio"), onUpdate: () => undefined });
    await node.init();
    try {
      await node.setReachable(true);
      const phoneLink = relay.client("browser-phone");
      const session = await phoneLink.call(node.fingerprint, "0123456789abcdef", "pair");
      await expect(initiate(phoneLink.open(session), generateKeyPair(), { v: 1, name: "Phone", purpose: "pair" }, 3_000)).rejects.toThrow();
      expect(node.snapshot().pairing).toBeNull();
      // A browser of another workspace can't call it at all.
      await expect(relay.client("browser-elsewhere", "org-2").call(node.fingerprint, "0123456789abcdef", "pair")).rejects.toThrow(/isn't reachable/);
    } finally {
      await node.close();
    }
  }, 30_000);
});

async function until(check: () => boolean, ms = 15_000): Promise<void> {
  const end = Date.now() + ms;
  while (!check()) {
    if (Date.now() > end) throw new Error("Timed out waiting");
    await new Promise((r) => setTimeout(r, 10));
  }
}

describe("SE-034 A phone receiving from someone it didn't pair with", () => {
  it("ignores unpaired computers, refuses another key and a climbing path, and keeps nothing that doesn't match", async () => {
    const relay = fakeRelay();
    relay.client("browser-phone");
    const web = new WebRelay({ base: "http://localhost:3000/api/v1/agent/relay", headers: { Authorization: "Bearer token-browser-phone" }, fetcher: relay.fetcher });
    const key = await generateWebKeyPair();
    const me = await webFingerprint(key.publicKey);
    const paired = generateKeyPair();
    const trusted: TrustedComputer[] = [{ name: "Studio PC", fingerprint: fingerprint(paired.publicKey), publicKey: new Uint8Array(paired.publicKey) }];
    const offers: WebIncoming[] = [];
    const listener = new WebMeshListener({ relay: web, key, fingerprint: me, name: () => "Phone", trusted: async () => trusted, iceServers: [], onIncoming: (i) => offers.push(i), onUpdate: () => undefined });
    await listener.setReachable(true);
    try {
      // A computer the phone never paired with: its call is closed without being joined.
      const stranger = generateKeyPair();
      const strangerLink = relay.client("agent-stranger");
      const unjoined = await strangerLink.call(me, fingerprint(stranger.publicKey), "relay");
      await expect(initiate(strangerLink.open(unjoined), stranger, { v: 1, name: "Studio PC", purpose: "transfer" }, 3_000)).rejects.toThrow();

      // One that claims the paired computer's fingerprint but holds another key: refused after the handshake.
      relay.client("browser-other");
      const other = new WebRelay({ base: "http://localhost:3000/api/v1/agent/relay", headers: { Authorization: "Bearer token-browser-other" }, fetcher: relay.fetcher });
      const claimed = await initiateWeb(other.open(await other.call(me, trusted[0]!.fingerprint, "relay")), await generateWebKeyPair(), { v: 1, name: "Studio PC", purpose: "transfer" }, 10_000);
      expect((await claimed.receive(10_000)).message).toMatchObject({ t: "error", code: "not_paired" });

      // The paired computer, lying: a path outside the folder is refused before anyone is asked.
      const link = relay.client("agent-studio");
      const call = async () => initiate(link.open(await link.call(me, trusted[0]!.fingerprint, "relay")), paired, { v: 1, name: "Studio PC", purpose: "transfer" }, 10_000);
      const bytes = Buffer.alloc(5 * 1024 * 1024, 7);
      const packed = await packPicked([new File([bytes], "startup.cmd.txt")], "Folder");
      const climbing = { ...packed.manifest, files: packed.manifest.files.map((f) => ({ ...f, path: "../Startup/run.txt" })) };
      const first = await call();
      const climbingBody = Buffer.from(JSON.stringify(climbing));
      await first.sendBlob({ t: "offer", session: crypto.randomUUID(), digest: manifestDigest(climbing), size: climbingBody.length }, climbingBody);
      expect((await first.receive(10_000)).message).toMatchObject({ t: "error", code: "bad_offer" });
      expect(offers).toEqual([]);

      // A chunk that doesn't match: the phone stops and keeps nothing.
      const second = await call();
      const body = Buffer.from(JSON.stringify(packed.manifest));
      await second.sendBlob({ t: "offer", session: crypto.randomUUID(), digest: packed.digest, size: body.length }, body);
      await until(() => offers.length === 1);
      const sink = memorySink();
      const accepted = offers[0]!.accept(sink);
      const accept = (await second.receive(10_000)).message;
      if (accept.t !== "accept") throw new Error("Expected accept");
      await second.receiveBlob(accept.size, 10_000);
      await second.send({ t: "file", f: 0, from: 0 });
      const changed = Buffer.from(bytes);
      changed[4_000_000] = 8;
      try {
        for (let at = 0; at < changed.length; at += 60 * 1024) await second.send({ t: "data" }, changed.subarray(at, at + 60 * 1024));
      } catch {
        // The phone stopped listening.
      }
      await accepted;
      expect(offers[0]!.state).toBe("failed");
      expect(await sink.files()).toEqual([]);
      expect((await second.receive(10_000)).message).toMatchObject({ t: "error", code: "chunk_mismatch" });
    } finally {
      await listener.setReachable(false);
    }
  }, 60_000);
});
