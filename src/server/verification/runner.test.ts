import { describe, expect, it } from "vitest";
import { INTENT_CONTRACT_SCHEMA, type IntentContract } from "@/core/realityloop/contract";
import type { TaskState } from "@/core/realityloop/task-machine";
import type { ExecutionRecord } from "@/server/sandbox/types";
import { runTaskVerification, startTaskVerification, verifyInRunSession, type VerificationDeps, type VerificationSandbox, type VerifyPerson } from "./runner";
import type { VerificationStore } from "./store";

const alice: VerifyPerson = { orgId: "o1", userId: "u-alice", role: "member" };
const contract: IntentContract = {
  schema: INTENT_CONTRACT_SCHEMA,
  version: 1,
  outcome: "The cart total is right.",
  scope: { organizationId: "o1", projectId: "p1", resources: ["src/cart.ts"] },
  allowedOperations: ["files.edit"],
  forbiddenOperations: [],
  protectedFields: [],
  protectedInvariants: [],
  assumptions: [],
  openQuestions: [],
  acceptanceCriteria: [],
  approvals: [],
  limits: {},
  requiredChecks: ["npm test"],
  recovery: "Restore the previous revision.",
};

const execution = (exitCode: number | null, state: ExecutionRecord["state"] = exitCode === 0 ? "succeeded" : "failed") => ({ exitCode, state }) as ExecutionRecord;

function fakes(over: { files?: string[]; registries?: boolean; createFails?: string; setupExit?: number | null; setupState?: ExecutionRecord["state"]; checks?: string; checksFail?: string; state?: TaskState; checksList?: string[]; running?: boolean; writeFails?: string } = {}) {
  const calls: string[] = [];
  const finished: Parameters<VerificationStore["finish"]>[0][] = [];
  const store: VerificationStore = {
    start: async (i) => (calls.push(`start:${i.trigger}`), over.running ? { ok: false, error: "VERIFICATION_RUNNING" } : { ok: true, value: "v1" }),
    attach: async (i) => (calls.push(`attach:${i.sessionId}`), { ok: true, value: null }),
    finish: async (i) => (finished.push(i), { ok: true, value: null }),
  };
  const service: VerificationSandbox = {
    overview: async () => ({ limits: { limits: { networkProfiles: over.registries === false ? ["none"] : ["none", "package_registries"], sizes: ["small"], maxSessionMinutes: 30 } } }) as never,
    createSession: async (_a, input) => {
      calls.push(`create:${(input as { network: string }).network}`);
      return over.createFails ? { ok: false, code: "NOT_CONNECTED", message: over.createFails, category: "provider_rejected" } : { ok: true, value: { sessionId: "s1", created: true } };
    },
    runCommand: async (_a, _s, input) => (calls.push(`setup:${String(input.command)}`), { ok: true, value: execution(over.setupExit === undefined ? 0 : over.setupExit, over.setupState) }),
    runChecks: async () => (calls.push("checks"), over.checksFail ? { ok: false, code: "SESSION_NOT_RUNNING", message: over.checksFail, category: "provider_rejected" } : { ok: true, value: { digest: "r".repeat(64), status: over.checks ?? "verified", taskEvent: "mark_verified", applied: true } }),
    stopSession: async () => (calls.push("stop"), { ok: true, value: { state: "stopping" } }),
    writeFile: async (_a, _s, path, content) => (calls.push(`write:${String(path)}=${String(content)}`), over.writeFails ? { ok: false, code: "INVALID_REQUEST", message: over.writeFails, category: "invalid_request" } : { ok: true, value: { path: String(path), bytes: String(content).length } }),
  };
  const files = over.files ?? ["package.json", "package-lock.json", "src/cart.ts"];
  const deps: VerificationDeps = {
    store,
    checks: {
      loadTask: async () => ({ id: "t1", title: "Fix the cart total", projectId: "p1", state: over.state ?? "VERIFYING", version: 7 }),
      approvedContract: async () => ({ version: 1, sha256: "c".repeat(64), body: { ...contract, requiredChecks: over.checksList ?? contract.requiredChecks } }),
      projectFiles: async () => files.map((path) => ({ path, revision: 1, sha256: "e".repeat(64), sizeBytes: 10 })),
      fileContents: async () => new Map([["package.json", '{"scripts":{"test":"node test.js"}}']]),
    },
    sandbox: { service, actor: { orgId: "o1", userId: "u-alice" } },
    newKey: () => "k",
  };
  return { deps, calls, finished, service };
}

const task = { id: "t1", title: "Fix the cart total", projectId: "p1" };

describe("startTaskVerification", () => {
  it("refuses viewers, a missing sandbox, a task not waiting for its checks, no checks, and a second run", async () => {
    expect(await startTaskVerification(fakes().deps, { ...alice, role: "viewer" }, "t1", "person")).toMatchObject({ ok: false, code: "FORBIDDEN" });
    expect(await startTaskVerification({ ...fakes().deps, sandbox: { unavailable: "No verified sandbox is connected." } }, alice, "t1", "person")).toMatchObject({ ok: false, message: "No verified sandbox is connected." });
    expect(await startTaskVerification(fakes({ state: "APPROVAL_PENDING" }).deps, alice, "t1", "person")).toMatchObject({ ok: false, message: expect.stringMatching(/waiting for its checks/) });
    expect(await startTaskVerification(fakes({ checksList: [] }).deps, alice, "t1", "person")).toMatchObject({ ok: false, message: expect.stringMatching(/no checks/) });
    expect(await startTaskVerification(fakes({ running: true }).deps, alice, "t1", "person")).toMatchObject({ ok: false, message: "The checks are already running for this change." });
  });

  it("records the attempt and runs it in the background", async () => {
    const f = fakes();
    expect(await startTaskVerification(f.deps, alice, "t1", "autonomy")).toEqual({ ok: true, value: { verificationId: "v1" } });
    for (let i = 0; i < 50 && !f.calls.includes("stop"); i += 1) await new Promise((r) => setTimeout(r, 5));
    expect(f.calls[0]).toBe("start:autonomy");
    expect(f.calls).toContain("checks");
  });
});

describe("runTaskVerification", () => {
  it("starts a sandbox with registry access, installs without scripts, runs the checks, records the receipt and stops", async () => {
    const f = fakes({ checks: "partially_verified" });
    expect(await runTaskVerification(f.deps, alice, { id: "v1", task })).toEqual({ ok: true, result: "partially_verified", receiptDigest: "r".repeat(64) });
    expect(f.calls).toEqual(["create:package_registries", "attach:s1", "setup:npm ci --ignore-scripts", "checks", "stop"]);
    expect(f.finished).toEqual([{ id: "v1", actor: "u-alice", status: "done", receiptDigest: "r".repeat(64) }]);
  });

  it("needs no network or install for a project with nothing to install", async () => {
    const f = fakes({ files: ["index.html", "check.mjs"] });
    await runTaskVerification(f.deps, alice, { id: "v1", task });
    expect(f.calls).toEqual(["create:none", "attach:s1", "checks", "stop"]);
  });

  it("records why it couldn't run, runs no checks after a failed install, and always stops the sandbox", async () => {
    const install = fakes({ setupExit: 1 });
    expect(await runTaskVerification(install.deps, alice, { id: "v1", task })).toEqual({ ok: false, reason: "Install packages with npm failed (exit 1), so the checks didn't run." });
    expect(install.calls).not.toContain("checks");
    expect(install.calls.at(-1)).toBe("stop");
    expect(install.finished[0]).toMatchObject({ status: "failed", failure: "Install packages with npm failed (exit 1), so the checks didn't run." });

    const slow = fakes({ setupExit: null, setupState: "timed_out" });
    expect(await runTaskVerification(slow.deps, alice, { id: "v1", task })).toMatchObject({ reason: expect.stringMatching(/\(it timed out\)/) });

    const blocked = fakes({ registries: false });
    expect(await runTaskVerification(blocked.deps, alice, { id: "v1", task })).toMatchObject({ ok: false, reason: expect.stringMatching(/can't reach the package registries/) });
    expect(blocked.calls).toEqual([]);

    const noStart = fakes({ createFails: "No runtime is connected." });
    expect(await runTaskVerification(noStart.deps, alice, { id: "v1", task })).toEqual({ ok: false, reason: "The sandbox didn't start: No runtime is connected." });
    expect(noStart.calls).not.toContain("stop");

    const lost = fakes({ checksFail: "The session isn't running." });
    expect(await runTaskVerification(lost.deps, alice, { id: "v1", task })).toEqual({ ok: false, reason: "The checks didn't run: The session isn't running." });
    expect(lost.calls.at(-1)).toBe("stop");
  });
});

describe("verifyInRunSession", () => {
  it("writes exactly the applied files into the run's sandbox, then runs the checks there", async () => {
    const f = fakes();
    const r = await verifyInRunSession({ store: f.deps.store, service: f.service, actor: { orgId: "o1", userId: "u-alice" } }, alice, { taskId: "t1", sessionId: "run-s1", files: [{ path: "src/cart.ts", content: "export const total = 2;" }] });
    expect(r).toEqual({ ok: true, result: "verified", receiptDigest: "r".repeat(64) });
    expect(f.calls).toEqual(["start:autonomy", "attach:run-s1", "write:src/cart.ts=export const total = 2;", "checks"]);
  });

  it("records a file it couldn't copy in, and runs no checks", async () => {
    const f = fakes({ writeFails: "Files are limited to 512 KB here." });
    const r = await verifyInRunSession({ store: f.deps.store, service: f.service, actor: { orgId: "o1", userId: "u-alice" } }, alice, { taskId: "t1", sessionId: "run-s1", files: [{ path: "src/cart.ts", content: "x" }] });
    expect(r).toEqual({ ok: false, reason: "src/cart.ts couldn't be copied into the sandbox: Files are limited to 512 KB here." });
    expect(f.calls).not.toContain("checks");
    expect(f.finished[0]).toMatchObject({ status: "failed" });
  });
});
