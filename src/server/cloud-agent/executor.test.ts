import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ModelStep, ModelToolCall, ToolModel } from "@/agent-runtime/models/types";
import type { CommandRunner } from "@/agent-runtime/runners";
import { INTENT_CONTRACT_SCHEMA, type IntentContract } from "@/core/realityloop/contract";
import type { TaskState } from "@/core/realityloop/task-machine";
import { sha256Hex } from "@/core/trust/canonical-json";
import type { GatewayDeps, GatewayModel } from "@/server/agent/gateway";
import type { ProposalInput } from "@/server/agent/service";
import { answerRunApproval, cancelCloudRun, sendRunMessage, startCloudRun, type ExecutorDeps, type RunPerson } from "./executor";
import type { RunPatch, RunStore } from "./store";

const README = "# Demo\nRun the tests.\n";
const contract: IntentContract = {
  schema: INTENT_CONTRACT_SCHEMA,
  version: 1,
  outcome: "README names the test command.",
  scope: { organizationId: "o1", projectId: "p1", resources: ["README.md"] },
  allowedOperations: ["files.edit"],
  forbiddenOperations: [],
  protectedFields: [],
  protectedInvariants: [],
  assumptions: [],
  openQuestions: [],
  acceptanceCriteria: [{ id: "ac-1", statement: "README says pnpm test.", verification: "read_back" }],
  approvals: [],
  limits: {},
  requiredChecks: [],
  recovery: "Restore the previous revision.",
};
const alice: RunPerson = { orgId: "o1", userId: "u-alice", role: "member" };

let root: string;
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "farbaek-executor-"));
});
afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

/** A labelled stand-in for the model: it plays a fixed script of tool calls. */
function scripted(turns: ModelToolCall[][]): ToolModel {
  return {
    provider: "farbaek",
    model: "auto",
    begin() {
      let i = 0;
      return {
        async send(): Promise<ModelStep> {
          const calls = turns[i++] ?? [];
          return { text: i === 1 ? "Reading the README." : "", toolCalls: calls, stop: calls.length ? "tool_use" : "end_turn", usage: { inputTokens: 100, outputTokens: 20 }, model: "claude-sonnet-5-5" };
        },
      };
    },
  };
}

const edit = { id: "e", name: "edit_file", input: { path: "README.md", edits: [{ find: "Run the tests.", replace: "Run the tests with pnpm test." }], reason: "Name the command." } };
const finish = { id: "f", name: "finish", input: { summary: "README names pnpm test.", steps: ["Edited README.md"], risks: [], checks: ["pnpm test"] } };

async function deps(over: { model: ToolModel; state?: TaskState; sandbox?: CommandRunner | null; runError?: string; extraFiles?: { path: string; content: string }[] }) {
  const patches: RunPatch[] = [];
  const proposals: ProposalInput[] = [];
  const synced: string[][] = [];
  const runs: RunStore = {
    start: async () => (over.runError ? { ok: false, error: over.runError } : { ok: true, value: "run-1" }),
    update: async (_id, p) => (patches.push(structuredClone(p)), { ok: true, value: null }),
    createRunProposal: async (_id, input) => (proposals.push(input), { ok: true, value: "proposal-1" }),
    interruptStale: async () => 0,
  };
  const sha = await sha256Hex(README);
  let n = 0;
  const d: ExecutorDeps = {
    runs,
    checks: {
      loadTask: async () => ({ id: "t1", title: "Name the test command", projectId: "p1", state: over.state ?? "CONTRACT_APPROVED", version: 4 }),
      approvedContract: async () => ({ version: 1, sha256: "c".repeat(64), body: contract }),
      project: async () => ({ id: "p1", name: "Storefront", archived: false }),
      projectFiles: async () => [{ path: "README.md", revision: 5, sha256: sha, sizeBytes: README.length }, ...(over.extraFiles ?? []).map((f) => ({ path: f.path, revision: 1, sha256: "e".repeat(64), sizeBytes: f.content.length }))],
      fileContents: async () => new Map([["README.md", README], ...(over.extraFiles ?? []).map((f) => [f.path, f.content] as [string, string])]),
      billing: async () => ({ state: "active", paidPlanId: "pro" }),
      countEvaluations: async () => 0,
      newEventId: () => `ev-${++n}`,
      now: () => new Date("2026-10-18T12:00:00Z"),
    },
    gateway: { deps: {} as GatewayDeps, model: {} as GatewayModel },
    sandboxAvailable: () => over.sandbox !== undefined && over.sandbox !== null,
    async sandbox(input) {
      if (!over.sandbox) return null;
      const runner = over.sandbox;
      return {
        sessionId: "s1",
        stop: async () => undefined,
        runner: {
          where: "sandbox",
          async run(program, args, signal) {
            synced.push((await input.pending()).map((f) => f.path));
            return runner.run(program, args, signal);
          },
        },
      };
    },
    makeModel: () => over.model,
    workRoot: root,
  };
  const ended = async () => {
    for (let i = 0; i < 200; i += 1) {
      const end = patches.find((p) => p.status && ["finished", "failed", "cancelled"].includes(p.status));
      if (end) return end;
      await new Promise((r) => setTimeout(r, 20));
    }
    throw new Error("The run didn't end.");
  };
  const waiting = async () => {
    for (let i = 0; i < 200; i += 1) {
      const e = patches.flatMap((p) => p.events ?? []).find((x) => x.kind === "approval");
      if (e) return e.payload as { requestId: string; bindingHash: string; display: string; risk: string };
      await new Promise((r) => setTimeout(r, 20));
    }
    throw new Error("No approval was asked for.");
  };
  return { d, patches, proposals, synced, ended, waiting };
}

const ok = { exitCode: 0, stdout: "ok", stderr: "", truncated: false, timedOut: false, cancelled: false, leftRunning: false, durationMs: 5 };

describe("cloud runs", () => {
  it("works on a server copy and turns the finished change into a proposal tagged with the run", async () => {
    const t = await deps({ model: scripted([[edit], [finish]]) });
    expect(await startCloudRun(t.d, { person: alice, taskId: "t1", effort: "balanced" })).toEqual({ ok: true, value: { runId: "run-1", mode: "review_only" } });
    expect(await t.ended()).toMatchObject({ status: "finished", outcome: expect.stringMatching(/waiting for your review/) });

    expect(t.proposals[0]).toMatchObject({
      taskId: "t1",
      actor: "u-alice",
      contractVersion: 1,
      changes: [{ path: "README.md", kind: "edit", baseRevision: 5, content: "# Demo\nRun the tests with pnpm test.\n" }],
      steps: [{ actor_kind: "agent", actor_id: "run:run-1" }, { actor_kind: "system" }, { actor_kind: "system" }],
    });
    const events = t.patches.flatMap((p) => p.events ?? []);
    expect(events.map((e) => e.kind)).toEqual(expect.arrayContaining(["note", "model", "tool"]));
    expect(t.patches.reduce((n, p) => n + (p.addSteps ?? 0), 0)).toBe(2);
    // The working folder goes as the run's last step, just after its final status is written.
    await expect.poll(() => fs.readdir(root), { timeout: 4000 }).toEqual([]);
  });

  it("runs tests in the sandbox on its own, with the agent's changes copied in first, and asks before installs", async () => {
    const ran: string[] = [];
    const sandbox: CommandRunner = { where: "sandbox", run: async (p, a) => (ran.push([p, ...a].join(" ")), ok) };
    const install = { id: "i", name: "run_command", input: { program: "npm", args: ["install", "left-pad"], reason: "Needs a helper." } };
    const test = { id: "c", name: "run_command", input: { program: "pnpm", args: ["test"], reason: "Check it." } };
    const t = await deps({ model: scripted([[edit], [test], [install], [finish]]), sandbox });
    expect(await startCloudRun(t.d, { person: alice, taskId: "t1", effort: "deep" })).toMatchObject({ ok: true, value: { mode: "sandboxed" } });

    const asked = await t.waiting();
    expect(asked).toMatchObject({ display: "npm install left-pad --ignore-scripts", risk: "install" });
    expect(ran).toEqual(["pnpm test"]);
    expect(t.synced[0]).toEqual(["README.md"]);

    // Only the person who started it (or an owner or admin) can answer, and only for the exact command shown.
    expect(answerRunApproval({ ...alice, userId: "u-bob" }, { runId: "run-1", requestId: asked.requestId, approved: true, bindingHash: asked.bindingHash })).toMatchObject({ ok: false, code: "FORBIDDEN" });
    expect(answerRunApproval(alice, { runId: "run-1", requestId: asked.requestId, approved: true, bindingHash: "0".repeat(64) })).toMatchObject({ ok: false, code: "VERSION_CONFLICT" });
    expect(answerRunApproval(alice, { runId: "run-1", requestId: asked.requestId, approved: true, bindingHash: asked.bindingHash })).toEqual({ ok: true, value: null });

    expect(await t.ended()).toMatchObject({ status: "finished" });
    expect(ran).toEqual(["pnpm test", "npm install left-pad --ignore-scripts"]);
    expect(t.patches.some((p) => p.status === "waiting")).toBe(true);
    expect(t.patches.find((p) => p.sandboxSessionId)).toMatchObject({ sandboxSessionId: "s1" });
  });

  it("stops when cancelled, and proposes nothing", async () => {
    const sandbox: CommandRunner = { where: "sandbox", run: async () => ok };
    const install = { id: "i", name: "run_command", input: { program: "npm", args: ["install"], reason: "Install." } };
    const t = await deps({ model: scripted([[install]]), sandbox });
    await startCloudRun(t.d, { person: alice, taskId: "t1", effort: "balanced" });
    await t.waiting();
    expect(cancelCloudRun({ ...alice, userId: "u-bob" }, "run-1")).toMatchObject({ ok: false, code: "FORBIDDEN" });
    expect(cancelCloudRun({ ...alice, userId: "u-owner", role: "owner" }, "run-1")).toEqual({ ok: true, value: null });
    expect(await t.ended()).toMatchObject({ status: "cancelled" });
    expect(t.proposals).toEqual([]);
  });

  it("takes messages from the person while it works, records them, and passes them to the agent at its next step", async () => {
    const received: (string | undefined)[] = [];
    const install = { id: "i", name: "run_command", input: { program: "npm", args: ["install", "left-pad"], reason: "Needs a helper." } };
    const turns: ModelToolCall[][] = [[install], [finish]];
    const listening: ToolModel = {
      provider: "farbaek",
      model: "auto",
      begin() {
        let i = 0;
        return {
          async send(input): Promise<ModelStep> {
            received.push(input.text);
            const calls = turns[i++] ?? [];
            return { text: "", toolCalls: calls, stop: calls.length ? "tool_use" : "end_turn", usage: { inputTokens: 100, outputTokens: 20 }, model: "claude-sonnet-5-5" };
          },
        };
      },
    };
    const t = await deps({ model: listening, sandbox: { where: "sandbox", run: async () => ok } });
    await startCloudRun(t.d, { person: alice, taskId: "t1", effort: "balanced" });
    const asked = await t.waiting();

    expect(sendRunMessage({ ...alice, userId: "u-bob" }, { runId: "run-1", text: "Hello" })).toMatchObject({ ok: false, code: "FORBIDDEN" });
    expect(sendRunMessage(alice, { runId: "run-1", text: "   " })).toMatchObject({ ok: false });
    expect(sendRunMessage(alice, { runId: "run-1", text: "x".repeat(1_001) })).toMatchObject({ ok: false });
    expect(sendRunMessage(alice, { runId: "run-1", text: "  Use   a warmer colour  " })).toEqual({ ok: true, value: null });

    answerRunApproval(alice, { runId: "run-1", requestId: asked.requestId, approved: true, bindingHash: asked.bindingHash });
    expect(await t.ended()).toMatchObject({ status: "finished" });
    expect(received[1]).toContain("- Use a warmer colour");
    const notes = t.patches.flatMap((p) => p.events ?? []).filter((e) => e.kind === "note");
    expect(notes).toContainEqual({ kind: "note", payload: { text: "Use a warmer colour", from: "person" } });
    // Once the run has ended there's no one to read it.
    expect(sendRunMessage(alice, { runId: "run-1", text: "Too late?" })).toMatchObject({ ok: false, code: "NOT_FOUND" });
  });

  it("says so when the run ends before the agent reads a message", async () => {
    const install = { id: "i", name: "run_command", input: { program: "npm", args: ["install"], reason: "Install." } };
    const t = await deps({ model: scripted([[install]]), sandbox: { where: "sandbox", run: async () => ok } });
    await startCloudRun(t.d, { person: alice, taskId: "t1", effort: "balanced" });
    await t.waiting();
    expect(sendRunMessage(alice, { runId: "run-1", text: "Use a warmer colour" })).toEqual({ ok: true, value: null });
    cancelCloudRun(alice, "run-1");
    expect(await t.ended()).toMatchObject({ status: "cancelled" });
    const notes = t.patches.flatMap((p) => p.events ?? []).filter((e) => e.kind === "note").map((e) => (e.payload as { text: string }).text);
    expect(notes.at(-1)).toMatch(/ended before the agent read your last message/);
  });

  it("refuses viewers, tasks that aren't approved, and a second live run", async () => {
    const t = await deps({ model: scripted([]) });
    expect(await startCloudRun(t.d, { person: { ...alice, role: "viewer" }, taskId: "t1", effort: "balanced" })).toMatchObject({ ok: false, code: "FORBIDDEN" });
    const draft = await deps({ model: scripted([]), state: "CONTRACT_DRAFTED" });
    expect(await startCloudRun(draft.d, { person: alice, taskId: "t1", effort: "balanced" })).toMatchObject({ ok: false, code: "INVALID_TRANSITION" });
    const busy = await deps({ model: scripted([]), runError: "RUN_ACTIVE" });
    expect(await startCloudRun(busy.d, { person: alice, taskId: "t1", effort: "balanced" })).toMatchObject({ ok: false, message: expect.stringMatching(/already working/) });
  });
});

describe("skills in a cloud run", () => {
  it("passes the chosen built-in skills and the project's own to the agent, and says which", async () => {
    let system = "";
    const capturing: ToolModel = {
      provider: "farbaek",
      model: "auto",
      begin(input) {
        system = input.system;
        return { async send(): Promise<ModelStep> { return { text: "", toolCalls: [finish], stop: "tool_use", usage: { inputTokens: 10, outputTokens: 5 }, model: "claude-sonnet-5-5" }; } };
      },
    };
    const skillFile = { path: ".farbaek/skills/house-style/SKILL.md", content: "---\nname: house-style\ndescription: Ours\n---\nUse our green." };
    const t = await deps({ model: capturing, extraFiles: [skillFile] });
    await startCloudRun(t.d, { person: alice, taskId: "t1", effort: "balanced", skills: ["3d-and-depth", "not-a-skill"] });
    expect(await t.ended()).toMatchObject({ status: "finished" });
    expect(system).toContain("The Farbaek Studio standard");
    expect(system).toContain("3d-and-depth");
    expect(system).toContain("house-style (from this project's files)");
    expect(system).not.toContain("not-a-skill");
    const notes = t.patches.flatMap((p) => p.events ?? []).filter((e) => e.kind === "note").map((e) => (e.payload as { text: string }).text);
    expect(notes).toContainEqual(expect.stringContaining("with these skills: 3D and depth, house-style (this project's)"));
  });
});
