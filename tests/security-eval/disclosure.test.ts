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
import { fingerprint, generateKeyPair } from "@/agent-runtime/mesh/noise";
import { MeshNode } from "@/agent-runtime/mesh/node";
import { fakeRelay } from "@/agent-runtime/mesh/relay-fake";
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
