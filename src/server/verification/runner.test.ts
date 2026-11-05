import { describe, expect, it } from "vitest";
import { INTENT_CONTRACT_SCHEMA, type IntentContract } from "@/core/realityloop/contract";
import type { TaskState } from "@/core/realityloop/task-machine";
import type { ExecutionRecord } from "@/server/sandbox/types";
import { runTaskVerification, startTaskVerification, verifyAppliedChange, type VerificationDeps, type VerificationSandbox, type VerifyPerson } from "./runner";
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

function fakes(over: { files?: string[]; registries?: boolean; createFails?: string; setupExit?: number | null; setupState?: ExecutionRecord["state"]; checks?: string; checksFail?: string; state?: TaskState; checksList?: string[]; running?: boolean; manifest?: string } = {}) {
  const calls: string[] = [];
  const flags: string[] = [];
  const finished: Parameters<VerificationStore["finish"]>[0][] = [];
  const store: VerificationStore = {
    start: async (i) => (calls.push(`start:${i.trigger}`), over.running ? { ok: false, error: "VERIFICATION_RUNNING" } : { ok: true, value: "v1" }),
    attach: async (i) => (calls.push(`attach:${i.sessionId}`), { ok: true, value: null }),
    finish: async (i) => (finished.push(i), { ok: true, value: null }),
  };
  const service: VerificationSandbox = {
    overview: async () => ({ limits: { limits: { networkProfiles: over.registries === false ? ["none"] : ["none", "package_registries"], sizes: ["small"], maxSessionMinutes: 30 } } }) as never,
    createSession: async (_a, input, _key, options) => {
      calls.push(`create:${(input as { network: string }).network}`);
      if (options?.verification) flags.push("session");
      return over.createFails ? { ok: false, code: "NOT_CONNECTED", message: over.createFails, category: "provider_rejected" } : { ok: true, value: { sessionId: "s1", created: true } };
    },
    runCommand: async (_a, _s, input, _k, _sink, options) => (options?.verification && flags.push("setup"), calls.push(`setup:${String(input.command)}`), { ok: true, value: execution(over.setupExit === undefined ? 0 : over.setupExit, over.setupState) }),
    runChecks: async (_a, _s, _k, options) => (options?.verification && flags.push("checks"), calls.push("checks"), over.checksFail ? { ok: false, code: "SESSION_NOT_RUNNING", message: over.checksFail, category: "provider_rejected" } : { ok: true, value: { digest: "r".repeat(64), status: over.checks ?? "verified", taskEvent: "mark_verified", applied: true, passed: 1, total: 1 } }),
    stopSession: async () => (calls.push("stop"), { ok: true, value: { state: "stopping" } }),
  };
  const files = over.files ?? ["package.json", "package-lock.json", "src/cart.ts"];
  const deps: VerificationDeps = {
    store,
    checks: {
      loadTask: async () => ({ id: "t1", title: "Fix the cart total", projectId: "p1", state: over.state ?? "VERIFYING", version: 7 }),
      approvedContract: async () => ({ version: 1, sha256: "c".repeat(64), body: { ...contract, requiredChecks: over.checksList ?? contract.requiredChecks } }),
      projectFiles: async () => files.map((path) => ({ path, revision: 1, sha256: "e".repeat(64), sizeBytes: 10 })),
      fileContents: async () => new Map([["package.json", over.manifest ?? '{"scripts":{"test":"node test.js"}}']]),
    },
    sandbox: { service, actor: { orgId: "o1", userId: "u-alice" } },
    newKey: () => "k",
  };
  return { deps, calls, flags, finished, service };
}

const task = { id: "t1", title: "Fix the cart total", projectId: "p1" };

describe("startTaskVerification", () => {
  it("refuses viewers, a missing sandbox, a task not waiting for its checks, no checks, and a second run", async () => {
    expect(await startTaskVerification(fakes().deps, { ...alice, role: "viewer" }, "t1", "person")).toMatchObject({ ok: false, code: "FORBIDDEN" });
    expect(await startTaskVerification({ ...fakes().deps, sandbox: { unavailable: "No verified sandbox is connected." } }, alice, "t1", "person")).toMatchObject({ ok: false, message: "No verified sandbox is connected." });
    expect(await startTaskVerification(fakes({ state: "APPROVAL_PENDING" }).deps, alice, "t1", "person")).toMatchObject({ ok: false, message: expect.stringMatching(/waiting for its checks/) });
    expect(await startTaskVerification(fakes({ checksList: [], files: ["notes.txt"] }).deps, alice, "t1", "person")).toMatchObject({ ok: false, message: expect.stringMatching(/no checks/) });
    expect(await startTaskVerification(fakes({ running: true }).deps, alice, "t1", "person")).toMatchObject({ ok: false, message: "The checks are already running for this change." });
  });

  it("verifies a plan with no checks: the site check for a static site, the app's own for an app (ADR 0054, ADR 0058)", async () => {
    const f = fakes({ checksList: [], files: ["index.html", "styles.css"] });
    expect(await startTaskVerification(f.deps, alice, "t1", "person")).toEqual({ ok: true, value: { verificationId: "v1" } });
    // An app with a build or real tests runs them.
    expect(await startTaskVerification(fakes({ checksList: [], manifest: '{"scripts":{"build":"next build"}}' }).deps, alice, "t1", "person")).toEqual({ ok: true, value: { verificationId: "v1" } });
    // An app with neither still has nothing to run.
    expect(await startTaskVerification(fakes({ checksList: [], files: ["index.html", "package.json"], manifest: '{"scripts":{"start":"node server.js"}}' }).deps, alice, "t1", "person")).toMatchObject({ ok: false, message: expect.stringMatching(/no checks/) });
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

  it("emails the person how the checks ended, passed or not (ADR 0060)", async () => {
    const sent: unknown[] = [];
    const notify = { checksFinished: async (n: unknown) => void sent.push(n) };
    const f = fakes({ checks: "verified" });
    await runTaskVerification({ ...f.deps, notify }, alice, { id: "v1", task });
    const g = fakes({ createFails: "No sandbox minutes left." });
    await runTaskVerification({ ...g.deps, notify }, alice, { id: "v1", task });
    expect(sent).toEqual([
      { userId: "u-alice", taskId: "t1", taskTitle: "Fix the cart total", result: "verified" },
      { userId: "u-alice", taskId: "t1", taskTitle: "Fix the cart total", result: null, reason: "The test space didn't start: No sandbox minutes left." },
    ]);
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
    expect(await runTaskVerification(noStart.deps, alice, { id: "v1", task })).toEqual({ ok: false, reason: "The test space didn't start: No runtime is connected." });
    expect(noStart.calls).not.toContain("stop");

    const lost = fakes({ checksFail: "The session isn't running." });
    expect(await runTaskVerification(lost.deps, alice, { id: "v1", task })).toEqual({ ok: false, reason: "The checks didn't run: The session isn't running." });
    expect(lost.calls.at(-1)).toBe("stop");
  });
});

describe("verifyAppliedChange", () => {
  it("checks what a run applied in a fresh test space, never the one the agent worked in", async () => {
    const f = fakes();
    const r = await verifyAppliedChange(f.deps, alice, "t1");
    expect(r).toEqual({ ok: true, result: "verified", receiptDigest: "r".repeat(64) });
    expect(f.calls[0]).toBe("start:autonomy");
    expect(f.calls.some((c) => c.startsWith("create:"))).toBe(true);
    expect(f.calls.at(-1)).toBe("stop");
  });

  it("asks for a test space kept for checking at every step, so the checks can count as proof", async () => {
    const f = fakes();
    await verifyAppliedChange(f.deps, alice, "t1");
    expect(f.flags).toEqual(["session", "setup", "checks"]);
  });

  it("says why when the change can't be checked", async () => {
    expect(await verifyAppliedChange(fakes({ state: "APPROVAL_PENDING" }).deps, alice, "t1")).toMatchObject({ ok: false, reason: expect.stringContaining("waiting for its checks") });
    expect(await verifyAppliedChange(fakes({ running: true }).deps, alice, "t1")).toMatchObject({ ok: false, reason: expect.stringContaining("already running") });
  });
});
