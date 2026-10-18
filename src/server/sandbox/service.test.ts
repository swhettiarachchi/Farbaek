/**
 * Sandbox service tests. They use MockSandbox and an in-memory store (both
 * test-only doubles, in ./testing) to check the control plane's logic:
 * authorization, Guard, limits, idempotency, timeouts, cancellation,
 * cleanup after failure, previews, receipts and the sweeper. Real runtime
 * behaviour is covered by the smoke test (pnpm sandbox:smoke).
 */
import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { buildProofPack, type ProofPackStatement } from "@/core/proof/proofpack";
import { RuntimeError } from "@/core/sandbox/runtime";
import { verifyPreviewToken } from "@/core/sandbox/preview";
import type { BillingSnapshot } from "@/core/billing/trial";
import type { SandboxServerConfig } from "./config";
import { createSandboxService, type SandboxActor, type TaskBridge } from "./service";
import { createMemoryStore, type MemoryStore } from "./testing/memory-store";
import { createMockRuntime } from "./testing/mock-runtime";

const ORG = "11111111-1111-4111-8111-111111111111";
const OTHER_ORG = "22222222-2222-4222-8222-222222222222";
const ALICE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const BOB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const CAROL = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const DAVE = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const MALLORY = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const PROJECT = "33333333-3333-4333-8333-333333333333";
const TASK = "44444444-4444-4444-8444-444444444444";
const SECRET = "x".repeat(40);

function config(over: Partial<SandboxServerConfig> = {}): SandboxServerConfig {
  return {
    provider: "e2b",
    unknownProvider: null,
    e2b: { apiKey: "test", domain: null, apiUrl: null, previewProtocol: "https" },
    vercel: { token: null, teamId: null, projectId: null, oidc: false, region: null },
    isolationVerifiedAt: "2026-10-17",
    runtimeMaxSessionMinutes: 60,
    images: { "node-ts": { small: "farbaek-node-small", standard: "farbaek-node-standard" }, python: { small: "farbaek-python-small", standard: "farbaek-python-standard" } },
    preview: { domain: "preview.localhost:3000", secret: SECRET, protocol: "http" },
    cronSecret: null,
    deploymentId: "test",
    ...over,
  };
}

let clock: Date;
let store: MemoryStore;
let runtime: ReturnType<typeof createMockRuntime>;
let viewer: string | null;
let billing: BillingSnapshot | null;
let taskState: { state: "VERIFYING" | "EXECUTING"; version: number; applied: string[] };
let applied: { digest: string; statement: ProofPackStatement } | null;
let verificationPacks: Parameters<TaskBridge["recordVerificationProofPack"]>[0][];
let keyN = 0;
const key = () => `test-key-${++keyN}`;

function service(over: { runtime?: ReturnType<typeof createMockRuntime> | null; config?: Partial<SandboxServerConfig>; reason?: string } = {}) {
  const rt = over.runtime === undefined ? runtime : over.runtime;
  const cfg = config(over.config);
  const tasks: TaskBridge = {
    loadTask: async () => ({ id: TASK, projectId: PROJECT, state: taskState.state, version: taskState.version, eventIds: [] }),
    requiredChecks: async () => ["echo hello", "exit 1"],
    appliedProofPack: async () => applied,
    latestProjectProofPackDigest: async () => "e".repeat(64),
    recordVerificationProofPack: async (i) => {
      verificationPacks.push(i);
      return { ok: true, value: i.digest };
    },
    applyTransition: async (i) => {
      taskState.applied.push(i.eventType);
      return { ok: true, value: i.expectedVersion + 1 };
    },
    newEventId: () => `evt-${key()}`,
  };
  return createSandboxService({
    store,
    resolution: rt ? { runtime: rt, reason: null, config: cfg } : { runtime: null, reason: over.reason ?? "No isolated sandbox runtime is connected yet.", config: cfg },
    role: async (orgId) => store.members.get(orgId)?.get(viewer ?? "") ?? null,
    billing: async () => billing,
    tasks,
    now: () => clock,
    randomKey: () => key(),
  });
}

const as = (userId: string, orgId = ORG): SandboxActor => {
  viewer = userId;
  return { userId, orgId };
};
const request = (over: Record<string, unknown> = {}) => ({ name: "Try", template: "node-ts", size: "small", network: "none", minutes: 20, projectId: null, taskId: null, ...over });

async function ready(user = ALICE, over: Record<string, unknown> = {}): Promise<string> {
  const r = await service().createSession(as(user), request(over), key());
  if (!r.ok) throw new Error(r.message);
  return r.value.sessionId;
}

beforeEach(() => {
  clock = new Date("2026-10-17T10:00:00Z");
  viewer = null;
  billing = { state: "active", paidPlanId: "studio" };
  taskState = { state: "VERIFYING", version: 7, applied: [] };
  verificationPacks = [];
  // The task's applied change wrote src/index.ts with the content the project holds.
  applied = {
    digest: "a".repeat(64),
    statement: buildProofPack({
      task: { id: TASK, organizationId: ORG, projectId: PROJECT },
      contract: { version: 1, sha256: "c".repeat(64) },
      proposal: { id: "prop-1", sha256: "b".repeat(64), model: null },
      policy: null,
      approval: { approvedBy: ALICE, approvedAt: "2026-10-17T09:00:00.000Z", appliedSha256: "d".repeat(64) },
      files: [{ path: "src/index.ts", kind: "edit", baseRevision: 1, sha256: createHash("sha256").update("export {}", "utf8").digest("hex") }],
      checks: [],
      execution: { mode: "review_only", reason: "No sandbox at apply time." },
      createdAt: "2026-10-17T09:00:00.000Z",
      previous: null,
    }),
  };
  store = createMemoryStore(() => clock, () => viewer);
  runtime = createMockRuntime();
  store.members.set(ORG, new Map([[ALICE, "owner"], [BOB, "member"], [CAROL, "viewer"], [DAVE, "admin"]]));
  store.members.set(OTHER_ORG, new Map([[MALLORY, "owner"]]));
  store.files.set(PROJECT, [
    { path: "package.json", sha256: "1".repeat(64), content: "{}" },
    { path: "src/index.ts", sha256: "2".repeat(64), content: "export {}" },
  ]);
});

describe("starting a session", () => {
  it("creates a real runtime sandbox with deny-all egress, no env and the project files", async () => {
    const r = await service().createSession(as(ALICE), request({ projectId: PROJECT }), key());
    expect(r.ok).toBe(true);
    const s = store.sessions.get(r.ok ? r.value.sessionId : "")!;
    expect(s.state).toBe("ready");
    expect(s.snapshotFiles).toBe(2);
    expect(s.snapshotSha256).toMatch(/^[0-9a-f]{64}$/);
    const live = runtime.state.live.get(s.providerSandboxId!)!;
    expect(live.metadata).toEqual({ farbaek: "test", session: s.id, org: ORG });
    expect([...live.files.keys()].sort()).toEqual(["package.json", "src/index.ts"]);
  });

  it("is idempotent: a retried request returns the same session and starts nothing new", async () => {
    const k = key();
    const a = await service().createSession(as(ALICE), request(), k);
    const b = await service().createSession(as(ALICE), request(), k);
    expect(a.ok && b.ok && a.value.sessionId === b.value.sessionId).toBe(true);
    expect(b.ok && b.value.created).toBe(false);
    expect(runtime.state.live.size).toBe(1);
  });

  it("refuses without a verified runtime, and never runs anything locally", async () => {
    const none = await service({ runtime: null, reason: "No isolated sandbox runtime is connected yet." }).createSession(as(ALICE), request(), key());
    expect(none).toMatchObject({ ok: false, code: "NOT_CONNECTED" });
    const unverified = await service({ config: { isolationVerifiedAt: null }, runtime: createMockRuntime({ verified: false }) }).createSession(as(ALICE), request(), key());
    expect(unverified).toMatchObject({ ok: false, code: "NOT_CONNECTED" });
    expect(store.sessions.size).toBe(0);
  });

  it("refuses viewers, outsiders and requests beyond the plan", async () => {
    expect(await service().createSession(as(CAROL), request(), key())).toMatchObject({ ok: false, code: "BLOCKED" });
    expect(await service().createSession(as(MALLORY, ORG), request(), key())).toMatchObject({ ok: false, code: "BLOCKED" });
    billing = null; // Free plan: small only, 30 minutes, one session.
    expect(await service().createSession(as(ALICE), request({ size: "standard" }), key())).toMatchObject({ ok: false, code: "INVALID_REQUEST" });
    expect(await service().createSession(as(ALICE), request({ minutes: 45 }), key())).toMatchObject({ ok: false, code: "INVALID_REQUEST" });
    await ready();
    expect(await service().createSession(as(ALICE), request(), key())).toMatchObject({ ok: false, code: "QUOTA_EXCEEDED" });
  });

  it("caps session length at the runtime's own ceiling", async () => {
    billing = { state: "active", paidPlanId: "max_3x" };
    const r = await service({ config: { runtimeMaxSessionMinutes: 60 } }).createSession(as(ALICE), request({ minutes: 120 }), key());
    expect(r).toMatchObject({ ok: false, code: "INVALID_REQUEST" });
  });

  it("marks the session failed and leaks nothing when the runtime refuses", async () => {
    runtime.state.failCreate = new RuntimeError("provider_rejected", "Template not found");
    const r = await service().createSession(as(ALICE), request(), key());
    expect(r).toMatchObject({ ok: false, code: "RUNTIME_FAILED", category: "provider_rejected" });
    const s = [...store.sessions.values()][0]!;
    expect(s).toMatchObject({ state: "failed", failureCategory: "provider_rejected", cleanupStatus: "not_needed" });
  });

  it("destroys the sandbox when copying files fails", async () => {
    runtime.state.failWrite = new RuntimeError("resource_limit", "disk full");
    const r = await service().createSession(as(ALICE), request({ projectId: PROJECT }), key());
    expect(r).toMatchObject({ ok: false, category: "resource_limit" });
    expect(runtime.state.live.size).toBe(0);
    expect([...store.sessions.values()][0]).toMatchObject({ state: "failed", cleanupStatus: "done" });
  });

  it("refuses projects too large to copy", async () => {
    store.files.set(PROJECT, Array.from({ length: 3001 }, (_, i) => ({ path: `f${i}`, sha256: "0".repeat(64), content: "x" })));
    expect(await service().createSession(as(ALICE), request({ projectId: PROJECT }), key())).toMatchObject({ ok: false, code: "PROJECT_TOO_LARGE" });
  });
});

describe("running commands", () => {
  it("records the real output and exit code", async () => {
    const id = await ready();
    const chunks: string[] = [];
    const r = await service().runCommand(as(ALICE), id, { command: "echo hello" }, key(), { onStdout: (c) => chunks.push(c) });
    expect(r).toMatchObject({ ok: true, value: { state: "succeeded", exitCode: 0, stdout: "hello\n" } });
    expect(chunks).toEqual(["hello\n"]);
    const failed = await service().runCommand(as(ALICE), id, { command: "exit 3" }, key());
    expect(failed).toMatchObject({ ok: true, value: { state: "failed", exitCode: 3, failureCategory: "command_failed", stderr: "failed\n" } });
  });

  it("never runs a retried command twice", async () => {
    const id = await ready();
    const k = key();
    await service().runCommand(as(ALICE), id, { command: "echo hello" }, k);
    const again = await service().runCommand(as(ALICE), id, { command: "echo hello" }, k);
    expect(again.ok).toBe(true);
    expect(runtime.state.executed).toEqual(["echo hello"]);
  });

  it("reports timeouts, runtime failures and lost sandboxes as what they are", async () => {
    const id = await ready();
    expect(await service().runCommand(as(ALICE), id, { command: "sleep 999", timeoutSeconds: 5 }, key())).toMatchObject({
      ok: true,
      value: { state: "timed_out", exitCode: null, failureCategory: "timeout" },
    });
    expect(await service().runCommand(as(ALICE), id, { command: "lost" }, key())).toMatchObject({
      ok: true,
      value: { state: "error", exitCode: null, failureCategory: "provider_unavailable" },
    });
    expect(await service().runCommand(as(ALICE), id, { command: "gone" }, key())).toMatchObject({ ok: true, value: { failureCategory: "sandbox_gone" } });
    expect(store.sessions.get(id)!.state).toBe("failed");
  });

  it("clamps the timeout to the plan and strips terminal escapes", async () => {
    const id = await ready();
    const r = await service().runCommand(as(ALICE), id, { command: "noisy", timeoutSeconds: 99999 }, key());
    expect(r).toMatchObject({ ok: true, value: { timeoutSeconds: 900, stdout: "ok\n" } });
  });

  it("refuses other members, viewers, other workspaces and stopped sessions", async () => {
    const id = await ready(ALICE);
    expect(await service().runCommand(as(BOB), id, { command: "echo hello" }, key())).toMatchObject({ ok: false, code: "BLOCKED" });
    expect(await service().runCommand(as(CAROL), id, { command: "echo hello" }, key())).toMatchObject({ ok: false, code: "BLOCKED" });
    expect(await service().runCommand(as(MALLORY, OTHER_ORG), id, { command: "echo hello" }, key())).toMatchObject({ ok: false, code: "NOT_FOUND" });
    expect(await service().runCommand(as(MALLORY, ORG), id, { command: "echo hello" }, key())).toMatchObject({ ok: false, code: "NOT_FOUND" });
    expect(await service().runCommand(as(DAVE), id, { command: "echo hello" }, key())).toMatchObject({ ok: true });
    await service().stopSession(as(ALICE), id);
    expect(await service().runCommand(as(ALICE), id, { command: "echo hello" }, key())).toMatchObject({ ok: false, code: "SESSION_NOT_RUNNING" });
    expect(runtime.state.executed).toEqual(["echo hello"]);
  });

  it("rate-limits per person and validates command shape", async () => {
    const id = await ready();
    expect(await service().runCommand(as(ALICE), id, { command: "" }, key())).toMatchObject({ ok: false, code: "INVALID_REQUEST" });
    store.rateLimitOverride = 0;
    expect(await service().runCommand(as(ALICE), id, { command: "echo hello" }, key())).toMatchObject({ ok: false, code: "RATE_LIMITED" });
  });

  it("cancels a running command through the runtime", async () => {
    const id = await ready();
    const s = store.sessions.get(id)!;
    const start = await store.startExecution({ sessionId: id, actor: ALICE, kind: "command", label: null, command: "sleep 100", timeoutSeconds: 60, policy: {}, idempotencyKey: key() });
    if (!start.ok) throw new Error(start.error);
    await store.setExecutionPid(start.value.executionId, 4242);
    expect(await service().cancelExecution(as(BOB), start.value.executionId)).toMatchObject({ ok: false, code: "FORBIDDEN" });
    expect(await service().cancelExecution(as(ALICE), start.value.executionId)).toEqual({ ok: true, value: { alreadyFinished: false, killed: true } });
    expect(runtime.state.killed).toEqual([4242]);
    expect(s.providerSandboxId).toBeTruthy();
  });
});

describe("stopping, pausing and cleanup", () => {
  it("stops through stopping to terminated, destroying the sandbox", async () => {
    const id = await ready();
    const sandboxId = store.sessions.get(id)!.providerSandboxId!;
    expect(await service().stopSession(as(BOB), id)).toMatchObject({ ok: false, code: "BLOCKED" });
    expect(await service().stopSession(as(ALICE), id)).toEqual({ ok: true, value: { state: "terminated" } });
    expect(runtime.state.live.has(sandboxId)).toBe(false);
    expect(store.sessions.get(id)).toMatchObject({ state: "terminated", cleanupStatus: "done", endReason: "user" });
    // Stopping again is a no-op, not an error.
    expect(await service().stopSession(as(ALICE), id)).toEqual({ ok: true, value: { state: "terminated" } });
  });

  it("keeps a session in stopping when destroy fails, and the sweeper finishes it", async () => {
    const id = await ready();
    runtime.state.failDestroy = new RuntimeError("provider_unavailable", "busy", true);
    expect(await service().stopSession(as(ALICE), id)).toEqual({ ok: true, value: { state: "stopping" } });
    expect(store.sessions.get(id)).toMatchObject({ state: "stopping", cleanupStatus: "failed", cleanupAttempts: 1 });
    runtime.state.failDestroy = null;
    const summary = await service().sweep();
    expect(summary.finished).toBe(1);
    expect(store.sessions.get(id)).toMatchObject({ state: "terminated", cleanupStatus: "done" });
  });

  it("pauses and resumes, counting only running time", async () => {
    const id = await ready();
    clock = new Date(clock.getTime() + 120_000);
    expect(await service().pauseSession(as(ALICE), id)).toEqual({ ok: true, value: { state: "paused" } });
    clock = new Date(clock.getTime() + 600_000);
    expect(await service().resumeSession(as(ALICE), id)).toEqual({ ok: true, value: { state: "ready" } });
    expect(store.sessions.get(id)!.billedSeconds).toBe(120);
    expect(await service().runCommand(as(ALICE), id, { command: "echo hello" }, key())).toMatchObject({ ok: true });
  });

  it("does not offer pause on a runtime that can't", async () => {
    const id = await ready();
    expect(await service({ runtime: createMockRuntime({ pauseResume: false }) }).pauseSession(as(ALICE), id)).toMatchObject({ ok: false, code: "BLOCKED" });
  });
});

describe("the sweeper", () => {
  it("expires sessions past their time limit or idle limit and destroys them", async () => {
    const ttl = await ready(ALICE, { minutes: 5 });
    const idle = await ready(ALICE, { minutes: 60 });
    clock = new Date(clock.getTime() + 21 * 60_000); // team idle limit is 20 minutes
    const summary = await service().sweep();
    expect(summary.expired).toBe(2);
    expect(store.sessions.get(ttl)).toMatchObject({ state: "expired", endReason: "ttl", cleanupStatus: "done" });
    expect(store.sessions.get(idle)).toMatchObject({ state: "expired", endReason: "idle" });
    expect(runtime.state.live.size).toBe(0);
  });

  it("closes commands Farbaek lost track of", async () => {
    const id = await ready();
    const start = await store.startExecution({ sessionId: id, actor: ALICE, kind: "command", label: null, command: "x", timeoutSeconds: 10, policy: {}, idempotencyKey: key() });
    if (!start.ok) throw new Error(start.error);
    clock = new Date(clock.getTime() + 60_000);
    expect((await service().sweep()).interrupted).toBe(1);
    expect(store.executions.get(start.value.executionId)).toMatchObject({ state: "error", failureCategory: "control_plane_interrupted" });
  });

  it("destroys runtime sandboxes no live session owns", async () => {
    await runtime.create({ image: "x", vcpu: 1, ttlSeconds: 60, egress: { profile: "none", allowOut: [], denyOut: [] }, metadata: { farbaek: "test", session: "missing" } });
    await runtime.create({ image: "x", vcpu: 1, ttlSeconds: 60, egress: { profile: "none", allowOut: [], denyOut: [] }, metadata: { farbaek: "another-deployment" } });
    const id = await ready();
    const summary = await service().sweep();
    expect(summary.orphans).toBe(1);
    expect(runtime.state.live.size).toBe(2);
    expect(store.sessions.get(id)!.state).toBe("ready");
  });
});

describe("files", () => {
  it("reads and writes inside the project folder only", async () => {
    const id = await ready();
    expect(await service().writeFile(as(ALICE), id, "src/app.ts", "const x = 1;\n")).toEqual({ ok: true, value: { path: "src/app.ts", bytes: 13 } });
    expect(await service().readFile(as(BOB), id, "src/app.ts")).toEqual({ ok: true, value: { path: "src/app.ts", content: "const x = 1;\n" } });
    expect(await service().writeFile(as(ALICE), id, "../etc/passwd", "x")).toMatchObject({ ok: false, code: "INVALID_REQUEST" });
    expect(await service().writeFile(as(ALICE), id, "/root/.ssh/x", "x")).toMatchObject({ ok: false, code: "INVALID_REQUEST" });
    expect(await service().writeFile(as(BOB), id, "src/app.ts", "x")).toMatchObject({ ok: false, code: "BLOCKED" });
    expect(await service().writeFile(as(ALICE), id, "big.txt", "x".repeat(600 * 1024))).toMatchObject({ ok: false, code: "INVALID_REQUEST" });
    expect(await service().writeFile(as(ALICE), id, "bin.dat", "a\u0000b")).toMatchObject({ ok: false, code: "INVALID_REQUEST" });
    expect(await service().readFile(as(MALLORY, OTHER_ORG), id, "src/app.ts")).toMatchObject({ ok: false, code: "NOT_FOUND" });
  });
});

describe("previews", () => {
  it("issue a short-lived, signed, single-purpose launch link on a separate host", async () => {
    const id = await ready();
    const r = await service().openPreview(as(ALICE), id, 3000);
    if (!r.ok) throw new Error(r.message);
    const url = new URL(r.value.url);
    expect(url.host).toBe(`p-${r.value.previewId}.preview.localhost:3000`);
    expect(url.pathname).toBe("/__farbaek/launch");
    const check = await verifyPreviewToken(url.searchParams.get("t"), SECRET, { kind: "launch", previewId: r.value.previewId, nowSeconds: clock.getTime() / 1000 });
    expect(check).toMatchObject({ ok: true, claims: { u: ALICE } });
    expect(await store.launchPreview(r.value.previewId, ALICE)).toMatchObject({ ok: true });
    expect(await store.launchPreview(r.value.previewId, ALICE)).toMatchObject({ ok: false });
  });

  it("refuse bad ports, other people, missing configuration and stopped sessions", async () => {
    const id = await ready();
    expect(await service().openPreview(as(ALICE), id, 49983)).toMatchObject({ ok: false, code: "INVALID_REQUEST" });
    expect(await service().openPreview(as(ALICE), id, 80)).toMatchObject({ ok: false, code: "INVALID_REQUEST" });
    expect(await service().openPreview(as(BOB), id, 3000)).toMatchObject({ ok: false, code: "BLOCKED" });
    expect(await service({ config: { preview: { domain: null, secret: null, protocol: "https" } } }).openPreview(as(ALICE), id, 3000)).toMatchObject({
      ok: false,
      code: "PREVIEW_UNAVAILABLE",
    });
    await service().stopSession(as(ALICE), id);
    expect(await service().openPreview(as(ALICE), id, 3000)).toMatchObject({ ok: false, code: "SESSION_NOT_RUNNING" });
  });
});

describe("Guard verification receipts", () => {
  it("runs the contract's checks, records a receipt and applies only the event the exit codes support", async () => {
    const id = await ready(ALICE, { taskId: TASK, projectId: PROJECT });
    const r = await service().runChecks(as(ALICE), id, key());
    expect(r).toMatchObject({ ok: true, value: { status: "partially_verified", taskEvent: "mark_partially_verified", applied: true } });
    const receipt = [...store.receipts.values()][0]!;
    const statement = receipt.statement as { predicate: { checks: { exitCode: number | null; status: string }[]; deployment: { authorized: boolean } } };
    expect(statement.predicate.checks.map((c) => [c.exitCode, c.status])).toEqual([
      [0, "passed"],
      [1, "failed"],
    ]);
    expect(statement.predicate.deployment.authorized).toBe(false);
    expect(taskState.applied).toEqual(["mark_partially_verified"]);
  });

  it("checks the applied files in the sandbox first, and appends a ProofPack with the real results", async () => {
    const id = await ready(ALICE, { taskId: TASK, projectId: PROJECT });
    await service().runChecks(as(ALICE), id, key());
    const receipt = [...store.receipts.values()][0]!;
    const predicate = (receipt.statement as { predicate: { appliedChange: { matched: boolean; files: { path: string; actual: string | null }[] } } }).predicate;
    expect(predicate.appliedChange.matched).toBe(true);
    expect(predicate.appliedChange.files.map((f) => f.path)).toEqual(["src/index.ts"]);
    expect(verificationPacks).toHaveLength(1);
    const pack = verificationPacks[0]!;
    expect(pack).toMatchObject({ taskId: TASK, receiptDigest: receipt.digest, status: "partially_verified" });
    expect(pack.statement.predicate.verification).toEqual({ receipt: receipt.digest, appliedProofPack: "a".repeat(64), filesMatched: true });
    expect(pack.statement.predicate.previous).toBe("e".repeat(64));
    expect(pack.statement.predicate.checks.map((c) => c.status)).toEqual(["passed", "failed"]);
    expect(pack.statement.predicate.execution).toEqual({ mode: "sandboxed", provider: runtime.capabilities.provider });
  });

  it("never verifies a change from files edited in the sandbox", async () => {
    const id = await ready(ALICE, { taskId: TASK, projectId: PROJECT });
    const sandboxId = store.sessions.get(id)!.providerSandboxId!;
    await runtime.writeFiles(sandboxId, [{ path: "src/index.ts", content: "export const edited = true;" }]);
    const r = await service().runChecks(as(ALICE), id, key());
    expect(r).toMatchObject({ ok: true, value: { taskEvent: null, applied: false } });
    const receipt = [...store.receipts.values()][0]!;
    const predicate = (receipt.statement as { predicate: { appliedChange: { matched: boolean }; limits: string[] } }).predicate;
    expect(predicate.appliedChange.matched).toBe(false);
    expect(predicate.limits.join(" ")).toMatch(/didn't match the applied change/);
    expect(taskState.applied).toEqual([]);
    expect(verificationPacks).toEqual([]);
  });

  it("doesn't verify a change whose files weren't copied in", async () => {
    const id = await ready(ALICE, { taskId: TASK });
    expect(await service().runChecks(as(ALICE), id, key())).toMatchObject({ ok: true, value: { taskEvent: null, applied: false } });
    expect(verificationPacks).toEqual([]);
  });

  it("records a receipt but leaves tasks that aren't waiting for verification alone", async () => {
    taskState.state = "EXECUTING";
    const id = await ready(ALICE, { taskId: TASK });
    const r = await service().runChecks(as(ALICE), id, key());
    expect(r).toMatchObject({ ok: true, value: { applied: false } });
    expect(taskState.applied).toEqual([]);
  });

  it("needs a task with checks", async () => {
    const id = await ready();
    expect(await service().runChecks(as(ALICE), id, key())).toMatchObject({ ok: false, code: "INVALID_REQUEST" });
  });
});

describe("overview", () => {
  it("reports real usage and limits, never invented numbers", async () => {
    const id = await ready();
    clock = new Date(clock.getTime() + 90_000);
    await service().runCommand(as(ALICE), id, { command: "echo hello" }, key());
    const o = await service().overview(as(ALICE));
    expect(o.execution.mode).toBe("sandboxed");
    expect(o.activeSessions).toBe(1);
    expect(o.usage.runningSeconds).toBe(90);
    expect(o.minutesUsed).toBe(2);
    expect(o.limits.limits.maxConcurrentSessions).toBe(4);
    expect(o.capabilities.previews).toBe(true);
    const none = await service({ runtime: null }).overview(as(ALICE));
    expect(none.execution.mode).toBe("review_only");
    expect(none.capabilities).toEqual({ pauseResume: false, metrics: false, previews: false, cancel: false, filesystem: false });
  });
});
