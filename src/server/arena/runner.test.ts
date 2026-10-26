import { describe, expect, it } from "vitest";
import { INTENT_CONTRACT_SCHEMA, type IntentContract } from "@/core/realityloop/contract";
import type { ExecutionRecord } from "@/server/sandbox/types";
import { runArena, startArena, type ArenaDeps, type ArenaPerson, type ArenaSandbox } from "./runner";
import type { ArenaProposal, ArenaStore } from "./store";

const alice: ArenaPerson = { orgId: "o1", userId: "u-alice", role: "member", permissions: {} };
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
  requiredChecks: ["npm test", "npm run build"],
  recovery: "Restore the previous revision.",
};
const PROPOSAL: ArenaProposal = { id: "pr1", taskId: "t1", projectId: "p1", status: "pending", changes: [{ path: "src/cart.ts", kind: "edit", content: "export const total = 2;" }] };

const execution = (exitCode: number | null) => ({ exitCode, state: exitCode === 0 ? "succeeded" : "failed" }) as ExecutionRecord;
const ran = (name: string, exitCode: number | null) => ({ name, command: name, exitCode, durationMs: 900, failure: null, stdoutSha256: null, stderrSha256: null });
const recorded = (name: string, exitCode: number | null) => ({ name, exitCode, durationMs: 900, failure: null });

function fakes(over: { proposal?: Partial<ArenaProposal> | null; running?: boolean; checksList?: string[]; after?: (number | null)[]; setupExit?: number[]; writeFails?: string; createFails?: string; registries?: boolean } = {}) {
  const calls: string[] = [];
  const finished: Parameters<ArenaStore["finish"]>[0][] = [];
  let pass = 0;
  let setups = 0;
  const store: ArenaStore = {
    proposal: async () => (over.proposal === null ? null : { ...PROPOSAL, ...over.proposal }),
    start: async () => (calls.push("start"), over.running ? { ok: false, error: "ARENA_RUNNING" } : { ok: true, value: "a1" }),
    attach: async (i) => (calls.push(`attach:${i.sessionId}`), { ok: true, value: null }),
    finish: async (i) => (finished.push(i), { ok: true, value: null }),
  };
  const service: ArenaSandbox = {
    overview: async () => ({ limits: { limits: { networkProfiles: over.registries === false ? ["none"] : ["none", "package_registries"], sizes: ["small"], maxSessionMinutes: 30 } } }) as never,
    createSession: async (_a, input) => {
      const spec = input as { taskId: string | null; projectId: string };
      calls.push(`create:${spec.projectId}:${spec.taskId}`);
      return over.createFails ? { ok: false, code: "NOT_CONNECTED", message: over.createFails, category: "provider_rejected" } : { ok: true, value: { sessionId: "s1", created: true } };
    },
    runCommand: async (_a, _s, input) => (calls.push(`setup:${String(input.command)}`), { ok: true, value: execution(over.setupExit?.[setups++] ?? 0) }),
    trialChecks: async (_a, _s, list, key) => {
      calls.push(`checks:${key.split(":").pop()}`);
      const codes = pass++ === 0 ? list.map(() => 0) : (over.after ?? list.map(() => 0));
      return { ok: true, value: list.map((name, i) => ran(name, codes[i] ?? null)) };
    },
    stopSession: async () => (calls.push("stop"), { ok: true, value: { state: "stopping" } }),
    writeFile: async (_a, _s, path) => (calls.push(`write:${String(path)}`), over.writeFails ? { ok: false, code: "INVALID_REQUEST", message: over.writeFails, category: "invalid_request" } : { ok: true, value: { path: String(path), bytes: 1 } }),
  };
  const deps: ArenaDeps = {
    store,
    checks: {
      loadTask: async () => ({ id: "t1", title: "Fix the cart total", projectId: "p1", state: "APPROVAL_PENDING", version: 7 }),
      approvedContract: async () => ({ version: 1, sha256: "c".repeat(64), body: { ...contract, requiredChecks: over.checksList ?? contract.requiredChecks } }),
      projectFiles: async () => ["package.json", "package-lock.json", "src/cart.ts"].map((path) => ({ path, revision: 1, sha256: "e".repeat(64), sizeBytes: 10 })),
      fileContents: async () => new Map([["package.json", '{"scripts":{"test":"node test.js","build":"node build.js"}}']]),
    },
    sandbox: { service, actor: { orgId: "o1", userId: "u-alice" } },
    newKey: () => "k",
  };
  return { deps, calls, finished };
}

const input = (checks = contract.requiredChecks) => ({ id: "a1", proposal: PROPOSAL, checks, title: "Fix the cart total" });

describe("startArena", () => {
  it("refuses viewers, a missing sandbox, a change not waiting for review, nothing to check, and a second trial", async () => {
    expect(await startArena(fakes().deps, { ...alice, role: "viewer" }, "pr1")).toMatchObject({ ok: false, code: "FORBIDDEN" });
    expect(await startArena(fakes().deps, { ...alice, permissions: { run_agents: false } }, "pr1")).toMatchObject({ ok: false, code: "PERMISSION_WITHHELD" });
    expect(await startArena({ ...fakes().deps, sandbox: { unavailable: "No verified sandbox is connected." } }, alice, "pr1")).toMatchObject({ ok: false, message: "No verified sandbox is connected." });
    expect(await startArena(fakes({ proposal: null }).deps, alice, "pr1")).toMatchObject({ ok: false, code: "NOT_FOUND" });
    expect(await startArena(fakes({ proposal: { status: "applied" } }).deps, alice, "pr1")).toMatchObject({ ok: false, message: expect.stringMatching(/waiting for review/) });
    expect(await startArena(fakes({ running: true }).deps, alice, "pr1")).toMatchObject({ ok: false, message: "A trial of this change is already running." });
  });

  it("records the trial and runs it in the background", async () => {
    const f = fakes();
    expect(await startArena(f.deps, alice, "pr1")).toEqual({ ok: true, value: { trialId: "a1" } });
    for (let i = 0; i < 50 && !f.calls.includes("stop"); i += 1) await new Promise((r) => setTimeout(r, 5));
    expect(f.calls[0]).toBe("start");
    expect(f.finished[0]).toMatchObject({ status: "done" });
  });
});

describe("runArena", () => {
  it("installs once, checks the current files, writes the change in, checks again, and stops", async () => {
    const f = fakes({ after: [0, 1] });
    const r = await runArena(f.deps, alice, input());
    expect(f.calls).toEqual(["create:p1:null", "attach:s1", "setup:npm ci --ignore-scripts", "checks:before", "write:src/cart.ts", "checks:after", "stop"]);
    expect(r).toMatchObject({ ok: true });
    expect(f.finished).toEqual([
      {
        id: "a1",
        actor: "u-alice",
        status: "done",
        baseline: [recorded("npm test", 0), recorded("npm run build", 0)],
        candidate: [recorded("npm test", 0), recorded("npm run build", 1)],
      },
    ]);
  });

  it("installs again when the change touches a dependency manifest", async () => {
    const f = fakes();
    await runArena(f.deps, alice, { ...input(), proposal: { ...PROPOSAL, changes: [{ path: "package.json", kind: "edit", content: '{"scripts":{"test":"node t.js"}}' }] } });
    expect(f.calls.filter((c) => c.startsWith("setup:"))).toHaveLength(2);
  });

  it("keeps the baseline and says why when the change can't be tried", async () => {
    const f = fakes({ writeFails: "Files are limited to 512 KB here." });
    expect(await runArena(f.deps, alice, input())).toMatchObject({ ok: false, reason: expect.stringMatching(/couldn't be written into the sandbox/) });
    expect(f.finished[0]).toMatchObject({ status: "failed", baseline: [{ name: "npm test", exitCode: 0 }, { name: "npm run build", exitCode: 0 }] });
    expect(f.calls).toContain("stop");
  });

  it("says when the change's own dependencies don't install", async () => {
    const f = fakes({ setupExit: [0, 1] });
    const r = await runArena(f.deps, alice, { ...input(), proposal: { ...PROPOSAL, changes: [{ path: "package.json", kind: "edit", content: '{"dependencies":{"x":"1"}}' }] } });
    expect(r).toMatchObject({ ok: false, reason: expect.stringMatching(/^With this change, .* failed \(exit 1\)\. Its checks didn't run/) });
    expect(f.calls).not.toContain("checks:after");
  });

  it("stops before anything runs when the sandbox can't start or can't reach the registries", async () => {
    const down = fakes({ createFails: "The runtime is down." });
    expect(await runArena(down.deps, alice, input())).toMatchObject({ ok: false, reason: "The sandbox didn't start: The runtime is down." });
    const closed = fakes({ registries: false });
    expect(await runArena(closed.deps, alice, input())).toMatchObject({ ok: false, reason: expect.stringMatching(/package registries/) });
    expect(closed.calls).toEqual([]);
  });
});
