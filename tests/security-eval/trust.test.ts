/**
 * Human-agent trust exploitation and misinformation (ASI09, LLM09): what
 * people see as "verified" must come from evidence, and evidence must not
 * survive being edited.
 */
import { describe, expect, it } from "vitest";
import { verificationEvent } from "@/core/execution/sandbox";
import { inspectEvidence } from "@/core/proof/inspect";
import { buildProofPack, proofPackDigest, proofPackStatus } from "@/core/proof/proofpack";
import { egressRules } from "@/core/sandbox/network";
import { buildSandboxReceipt, sandboxReceiptDigest } from "@/core/sandbox/receipts";
import { sha256Hex } from "@/core/trust/canonical-json";
import { createSandboxService } from "@/server/sandbox/service";
import { createMemoryStore } from "@/server/sandbox/testing/memory-store";
import { createMockRuntime } from "@/server/sandbox/testing/mock-runtime";

const H = (c: string) => c.repeat(64);

describe("SE-012 A claim of success without proof", () => {
  it("verifies only when every check ran and exited 0", () => {
    expect(proofPackStatus([{ name: "test", command: "pnpm test", exitCode: 0 }])).toBe("verified");
    // A check that didn't run is never counted as passing, whatever else passed.
    expect(proofPackStatus([{ name: "test", command: "pnpm test", exitCode: null }])).toBe("unverified");
    expect(proofPackStatus([{ name: "test", command: "pnpm test", exitCode: 0 }, { name: "build", command: "pnpm build", exitCode: null }])).toBe("partially_verified");
    expect(proofPackStatus([{ name: "test", command: "pnpm test", exitCode: 1 }])).toBe("failed");
    expect(proofPackStatus([])).toBe("unverified");
    expect(verificationEvent([{ name: "test", command: "pnpm test", exitCode: 0 }], false)).toBeNull();
    expect(verificationEvent([{ name: "test", command: "pnpm test", exitCode: 0 }], true)).toBe("mark_verified");
  });

  it("doesn't take the agent's word: a ProofPack's status comes from its checks, not its summary", async () => {
    const statement = buildProofPack({
      task: { id: "t1", organizationId: "o1", projectId: "p1" },
      contract: { version: 1, sha256: H("c") },
      proposal: { id: "prop-1", sha256: H("a"), model: "claude-opus-5-5" },
      policy: { outcome: "REQUIRE_APPROVAL", version: H("e"), findings: [{ rule: "summary", outcome: "ALLOW", detail: "All tests pass. Verified." }] },
      approval: { approvedBy: "u1", approvedAt: "2026-10-23T10:00:00.000Z", appliedSha256: H("b") },
      files: [{ path: "README.md", kind: "edit", baseRevision: 1, sha256: await sha256Hex("x") }],
      checks: [{ name: "pnpm test", command: "pnpm test", exitCode: null }],
      execution: { mode: "review_only", reason: "No sandbox." },
      createdAt: "2026-10-23T10:00:01.000Z",
      previous: null,
    });
    expect(statement.predicate.status).toBe("unverified");
  });
});

describe("SE-013 Evidence changed after the fact", () => {
  it("catches one changed value in a ProofPack or a check receipt", async () => {
    const pack = buildProofPack({
      task: { id: "t1", organizationId: "o1", projectId: "p1" },
      contract: { version: 1, sha256: H("c") },
      proposal: { id: "prop-1", sha256: H("a"), model: "claude-opus-5-5" },
      policy: { outcome: "REQUIRE_APPROVAL", version: H("e"), findings: [] },
      approval: { approvedBy: "u1", approvedAt: "2026-10-23T10:00:00.000Z", appliedSha256: H("b") },
      files: [{ path: "src/cart.ts", kind: "edit", baseRevision: 3, sha256: await sha256Hex("export const total = 1;\n") }],
      checks: [{ name: "test", command: "pnpm test", exitCode: 1 }],
      execution: { mode: "sandboxed", provider: "Vercel Sandbox" },
      createdAt: "2026-10-23T10:00:01.000Z",
      previous: H("9"),
    });
    const digest = await proofPackDigest(pack);
    expect(await inspectEvidence({ digest, statement: pack })).toMatchObject({ ok: true, intact: true, status: "failed" });
    // Someone turns the failed check into a pass.
    const forged = JSON.parse(JSON.stringify(pack));
    forged.predicate.checks[0].exitCode = 0;
    forged.predicate.status = "verified";
    expect(await inspectEvidence({ digest, statement: forged })).toMatchObject({ ok: true, intact: false });

    const receipt = buildSandboxReceipt({
      session: { id: "s1", organizationId: "o1", projectId: "p1", taskId: "t1" },
      runtime: { provider: "Vercel Sandbox", isolation: "microvm", template: "node-ts", image: "vercel/sandbox/universal", vcpu: 2, memoryMiB: 4096, egress: egressRules("none") },
      policy: { version: H("a"), outcome: "ALLOW_WITHIN_LIMITS" },
      snapshot: { sha256: H("b"), files: 3 },
      checks: [{ name: "pnpm test", command: "pnpm test", exitCode: 2, durationMs: 900, failure: null, stdoutSha256: null, stderrSha256: null }],
      proofPackDigest: digest,
      createdAt: "2026-10-23T10:00:02.000Z",
    });
    const receiptDigest = await sandboxReceiptDigest(receipt);
    const edited = JSON.parse(JSON.stringify(receipt));
    edited.predicate.checks[0].exitCode = 0;
    expect(await inspectEvidence({ digest: receiptDigest, statement: receipt })).toMatchObject({ ok: true, intact: true });
    expect(await inspectEvidence({ digest: receiptDigest, statement: edited })).toMatchObject({ ok: true, intact: false });
  });
});

describe("SE-037 A test space someone tampered with", () => {
  const ORG = "11111111-1111-4111-8111-111111111111";
  const ME = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const TASK = "44444444-4444-4444-8444-444444444444";
  const PROJECT = "33333333-3333-4333-8333-333333333333";
  const actor = { userId: ME, orgId: ORG };
  let n = 0;
  const key = () => `eval-key-${++n}`;
  const request = { name: "Try", template: "node-ts", size: "small", network: "none", minutes: 20, projectId: PROJECT, taskId: TASK, include: [] };

  function setup() {
    const now = new Date("2026-10-17T10:00:00Z");
    const store = createMemoryStore(() => now, () => ME);
    store.members.set(ORG, new Map([[ME, "owner"]]));
    store.files.set(PROJECT, [{ path: "package.json", sha256: H("1"), content: "{}" }]);
    const packs: unknown[] = [];
    const moved: string[] = [];
    const service = createSandboxService({
      store,
      resolution: {
        runtime: createMockRuntime(),
        reason: null,
        config: {
          provider: "e2b",
          unknownProvider: null,
          e2b: { apiKey: "test", domain: null, apiUrl: null, previewProtocol: "https" },
          vercel: { token: null, teamId: null, projectId: null, oidc: false, region: null },
          isolationVerifiedAt: "2026-10-17",
          runtimeMaxSessionMinutes: 60,
          images: { "node-ts": { small: "n", standard: "n" }, python: { small: "p", standard: "p" } },
          preview: { domain: "preview.localhost:3000", secret: "x".repeat(40), protocol: "http" },
          cronSecret: null,
          deploymentId: "test",
        },
      },
      role: async () => "owner",
      billing: async () => ({ state: "active", paidPlanId: "studio" }),
      tasks: {
        loadTask: async () => ({ id: TASK, projectId: PROJECT, state: "VERIFYING", version: 7, eventIds: [] }),
        requiredChecks: async () => ["echo hello"],
        appliedProofPack: async () => null,
        latestProjectProofPackDigest: async () => H("e"),
        filesChangedAfterChange: async () => false,
        recordVerificationProofPack: async (i) => (packs.push(i), { ok: true, value: i.digest }),
        applyTransition: async (i) => (moved.push(i.eventType), { ok: true, value: i.expectedVersion + 1 }),
        newEventId: () => key(),
      },
      now: () => now,
      randomKey: () => key(),
    });
    return { service, store, packs, moved };
  }

  it("records what checks did in someone's own test space, but never as proof, even when asked to", async () => {
    const { service, packs, moved } = setup();
    const made = await service.createSession(actor, request, key());
    if (!made.ok) throw new Error(made.message);
    // The attack: plant what the checks will run, then ask for them.
    await service.writeFile(actor, made.value.sessionId, "node_modules/.bin/test", "exit 0");
    expect(await service.runChecks(actor, made.value.sessionId, key())).toMatchObject({ ok: true, value: { status: "unverified", taskEvent: null, applied: false } });
    expect(await service.runChecks(actor, made.value.sessionId, key(), { verification: true })).toMatchObject({ ok: true, value: { status: "unverified", applied: false } });
    expect(packs).toEqual([]);
    expect(moved).toEqual([]);
  });

  it("refuses to let anyone reach into a test space kept for checking", async () => {
    const { service } = setup();
    const made = await service.createSession(actor, request, key(), { verification: true });
    if (!made.ok) throw new Error(made.message);
    const id = made.value.sessionId;
    expect(await service.writeFile(actor, id, "node_modules/.bin/test", "exit 0")).toMatchObject({ ok: false, code: "BLOCKED" });
    expect(await service.runCommand(actor, id, { command: "touch tampered" }, key())).toMatchObject({ ok: false, code: "BLOCKED" });
    expect(await service.runChecks(actor, id, key())).toMatchObject({ ok: false, code: "BLOCKED" });
  });
});
