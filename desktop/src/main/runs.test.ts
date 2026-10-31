import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { INTENT_CONTRACT_SCHEMA, type IntentContract } from "@/core/realityloop/contract";
import { proposalHash } from "@/core/realityloop/change-proposal";
import { sha256Hex } from "@/core/trust/canonical-json";
import type { AgentProposalStatus, AgentTaskDetail, ProposalSubmission } from "@/agent-runtime/farbaek-client";
import type { ModelStep, ModelToolCall, ToolModel } from "@/agent-runtime/models/types";
import type { CommandRunner } from "@/agent-runtime/runners";
import type { RunDetail } from "../shared/api";
import type { McpClient } from "@/agent-runtime/mcp/client";
import type { McpServerConfig } from "@/agent-runtime/mcp/external";
import { RunManager, type RunApi } from "./runs";

const README = "# Demo\nRun the tests.\n";
const contract: IntentContract = {
  schema: INTENT_CONTRACT_SCHEMA,
  version: 1,
  outcome: "README names pnpm test.",
  scope: { organizationId: "o1", projectId: "p1", resources: ["README.md"] },
  allowedOperations: ["files.edit"],
  forbiddenOperations: [],
  protectedFields: [],
  protectedInvariants: [],
  assumptions: [],
  openQuestions: [],
  acceptanceCriteria: [{ id: "ac-1", statement: "README names pnpm test.", verification: "read_back" }],
  approvals: [],
  limits: {},
  requiredChecks: [],
  recovery: "Restore README.md.",
};

let dir: string;
let submitted: ProposalSubmission[];
let updates: RunDetail[];

async function api(): Promise<RunApi> {
  const detail: AgentTaskDetail = {
    task: { id: "t1", title: "Document the tests", state: "CONTRACT_APPROVED", version: 2, readyForChange: true },
    project: { id: "p1", name: "Demo", archived: false },
    contract: { version: 3, sha256: "c".repeat(64), body: contract },
    files: [{ path: "README.md", revision: 5, sha256: await sha256Hex(README), sizeBytes: README.length }],
  };
  return {
    task: async () => detail,
    snapshot: async () => [{ path: "README.md", revision: 5, sha256: detail.files[0]!.sha256, content: README }],
    // Runs in these tests use a scripted model, so the gateway is never called.
    modelStep: async () => {
      throw new Error("The model gateway isn't used in these tests.");
    },
    submitProposal: async (_taskId, proposal) => {
      submitted.push(proposal);
      return { proposalId: "proposal-1", status: "pending", violations: [], policy: { outcome: "REQUIRE_APPROVAL", findings: [] } };
    },
  };
}

function scripted(turns: ModelToolCall[][]): ToolModel {
  return {
    provider: "anthropic",
    model: "fake-model",
    begin() {
      let i = 0;
      return {
        async send(): Promise<ModelStep> {
          const calls = turns[i++] ?? [];
          return { text: i === 1 ? "Looking at the README." : "", toolCalls: calls, stop: calls.length ? "tool_use" : "end_turn", usage: { inputTokens: 100, outputTokens: 20 }, model: "fake-model" };
        },
      };
    },
  };
}

const edit = { id: "e", name: "edit_file", input: { path: "README.md", edits: [{ find: "Run the tests.", replace: "Run the tests with pnpm test." }], reason: "Name the command." } };
const finish = { id: "f", name: "finish", input: { summary: "README names pnpm test.", steps: ["Edited README.md"], risks: [], checks: ["pnpm test"] } };

let managers: RunManager[];

function manager(model: ToolModel, runner?: CommandRunner) {
  const m = new RunManager({ dataDir: dir, makeModel: () => model, emit: (r) => updates.push(r), makeRunner: runner ? () => runner : undefined });
  managers.push(m);
  return m;
}

// Waits by the clock, not by a count of polls: on a busy machine copying the project and saving the run take longer.
async function settle(m: RunManager, id: string, until: (r: RunDetail) => boolean) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const r = m.get(id);
    if (r && until(r)) return r;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`Run ${id} didn't reach the expected state: ${JSON.stringify(m.get(id)?.state)}`);
}

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "farbaek-runs-"));
  submitted = [];
  updates = [];
  managers = [];
});

afterEach(async () => {
  // A run's last save can still be writing when its state changes, so let every save finish before removing the folder.
  await Promise.all(managers.map((m) => m.flush()));
  // Windows can hold a just-written file for a moment (antivirus, the indexer).
  await fs.rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

// Longer than settle's 10 s, so a slow run fails with its state rather than vitest's default 5 s.
describe("desktop runs", { timeout: 20_000 }, () => {
  it("works on a copy, waits for the person, then submits exactly the finished change", async () => {
    const m = manager(scripted([[edit], [finish]]));
    const id = await m.start({ api: await api(), taskId: "t1", mode: "review_only", effort: "balanced" });
    const run = await settle(m, id, (r) => r.state !== "running");
    expect(run).toMatchObject({ state: "completed", model: "fake-model", usage: { inputTokens: 200, outputTokens: 40 }, outcome: expect.stringMatching(/submit it to Farbaek/) });
    expect(run.changes).toEqual([{ path: "README.md", kind: "edit", bytes: 37, reason: "Name the command." }]);
    expect(JSON.stringify(run)).not.toContain("sk-ant-test");
    expect(submitted).toEqual([]);
    expect(updates.length).toBeGreaterThan(2);

    const after = await m.submit(id, await api());
    expect(after.proposal).toMatchObject({ id: "proposal-1", status: "pending", policy: "REQUIRE_APPROVAL" });
    expect(submitted[0]).toMatchObject({
      contractVersion: 3,
      contractSha256: "c".repeat(64),
      mode: "review_only",
      changes: [{ path: "README.md", kind: "edit", baseRevision: 5, content: "# Demo\nRun the tests with pnpm test.\n", reason: "Name the command." }],
      usage: { model: "fake-model", inputTokens: 200, outputTokens: 40 },
    });
    await expect(m.submit(id, await api())).rejects.toThrow(/already submitted/);
  });

  it("runs on a local model without the model gateway, and records which model wrote the change", async () => {
    // A labelled fake of a local OpenAI-compatible server: two steps, then the run is done.
    const steps = [edit, finish].map((call) => ({ model: "qwen3-coder:30b", choices: [{ message: { role: "assistant", content: "", tool_calls: [{ id: call.id, type: "function", function: { name: call.name, arguments: JSON.stringify(call.input) } }] }, finish_reason: "tool_calls" }], usage: { prompt_tokens: 300, completion_tokens: 30 } }));
    const asked: string[] = [];
    const localFetch = (async (url: string) => {
      asked.push(url);
      return new Response(JSON.stringify(steps.shift()), { status: 200 });
    }) as unknown as typeof fetch;
    const m = new RunManager({ dataDir: dir, emit: (r) => updates.push(r), localFetch });
    managers.push(m);
    const id = await m.start({ api: await api(), taskId: "t1", mode: "review_only", effort: "balanced", local: { base: "http://127.0.0.1:11434/v1", model: "qwen3-coder:30b" } });
    const run = await settle(m, id, (r) => r.state !== "running");
    expect(run).toMatchObject({ state: "completed", model: "local:qwen3-coder:30b", usage: { inputTokens: 600, outputTokens: 60 } });
    expect(asked).toEqual(["http://127.0.0.1:11434/v1/chat/completions", "http://127.0.0.1:11434/v1/chat/completions"]);
    await m.submit(id, await api());
    expect(submitted[0]).toMatchObject({ usage: { model: "local:qwen3-coder:30b" }, changes: [{ path: "README.md", content: "# Demo\nRun the tests with pnpm test.\n" }] });
  });

  it("checks the proposal in Farbaek against the hash worked out from what was sent", async () => {
    const m = manager(scripted([[edit], [finish]]));
    const id = await m.start({ api: await api(), taskId: "t1", mode: "review_only", effort: "balanced" });
    await settle(m, id, (r) => r.state !== "running");
    const sent = await m.submit(id, await api());
    // Farbaek's hash of the same change, the way the server works it out.
    const content = "# Demo\nRun the tests with pnpm test.\n";
    const serverSha = await proposalHash({ taskId: "t1", contractVersion: 3, contractSha256: "c".repeat(64), changes: [{ path: "README.md", kind: "edit", baseRevision: 5, content, sha256: await sha256Hex(content), reason: "" }] });
    expect(sent.proposal?.sentSha256).toBe(serverSha);

    const status = (over: Partial<AgentProposalStatus> = {}): { proposal: () => Promise<AgentProposalStatus> } => ({
      proposal: async () => ({ id: "proposal-1", taskId: "t1", status: "pending", sha256: serverSha, createdAt: "2026-10-18T10:00:00Z", expiresAt: "2026-10-21T10:00:00Z", decidedAt: null, appliedSha256: null, proofPack: null, ...over }),
    });
    const waiting = await m.refreshProposal(id, status());
    expect(waiting.proposal?.review).toMatchObject({ status: "pending", expiresAt: "2026-10-21T10:00:00Z", matchesSent: true });
    const notes = () => m.get(id)!.events.filter((e) => e.kind === "note").map((e) => (e as { text: string }).text);
    const before = notes().length;

    await m.refreshProposal(id, status({ status: "applied", decidedAt: "2026-10-18T11:00:00Z", appliedSha256: "a".repeat(64), proofPack: { digest: "9".repeat(64), status: "unverified" } }));
    await m.refreshProposal(id, status({ status: "applied", appliedSha256: "a".repeat(64), proofPack: { digest: "8".repeat(64), status: "verified" } }));
    await m.refreshProposal(id, status({ status: "applied", appliedSha256: "a".repeat(64), proofPack: { digest: "8".repeat(64), status: "verified" } }));
    expect(notes().slice(before)).toEqual(["Approved and applied in Farbaek.", "Verified in Farbaek: its checks passed."]);
    // The record survives a restart.
    const saved = JSON.parse(await fs.readFile(path.join(dir, "runs", `${id}.json`), "utf8")) as RunDetail;
    expect(saved.proposal?.review).toMatchObject({ status: "applied", proofPack: { status: "verified" }, matchesSent: true });

    const odd = await m.refreshProposal(id, status({ sha256: "0".repeat(64) }));
    expect(odd.proposal?.review?.matchesSent).toBe(false);
    expect(notes().at(-1)).toMatch(/doesn't match what this computer sent/);
  });

  it("holds a command for approval and runs it only once approved", async () => {
    const ran: string[] = [];
    const runner: CommandRunner = {
      where: "local",
      async run(program, args) {
        ran.push([program, ...args].join(" "));
        return { exitCode: 0, stdout: "ok", stderr: "", truncated: false, timedOut: false, cancelled: false, leftRunning: false, durationMs: 5 };
      },
    };
    const m = manager(scripted([[{ id: "c", name: "run_command", input: { program: "pnpm", args: ["test"], reason: "Check it." } }], [finish]]), runner);
    const id = await m.start({ api: await api(), taskId: "t1", mode: "controlled", effort: "balanced" });
    const waiting = await settle(m, id, (r) => r.pendingApproval !== null);
    expect(waiting.pendingApproval).toMatchObject({ display: "pnpm test", risk: "test_build", where: "local" });
    expect(ran).toEqual([]);
    m.answer(id, "someone-else", true, waiting.pendingApproval!.bindingHash);
    expect(ran).toEqual([]);
    m.answer(id, waiting.pendingApproval!.id, true, waiting.pendingApproval!.bindingHash);
    const done = await settle(m, id, (r) => r.state !== "running");
    expect(done.state).toBe("completed");
    expect(ran).toEqual(["pnpm test"]);
  });

  it("offers MCP tools only in Controlled Development, starts the servers outside the copy, and closes them when the run ends (ADR 0148)", async () => {
    const started: string[] = [];
    const called: string[] = [];
    let closed = 0;
    const connect = async (server: McpServerConfig): Promise<McpClient> => {
      started.push(server.name);
      return {
        server: { name: "notes", version: "1" },
        listTools: async () => ({ tools: [{ name: "search", description: "Search notes.", inputSchema: { type: "object" } }], skipped: 0 }),
        callTool: async (name, args) => (called.push(`${name} ${JSON.stringify(args)}`), { text: "2 notes", isError: false }),
        close: () => void (closed += 1),
      };
    };
    const mcpManager = (model: ToolModel) => {
      const m = new RunManager({ dataDir: dir, makeModel: () => model, emit: (r) => updates.push(r), connectMcp: connect, makeRunner: () => ({ where: "local", run: async () => ({ exitCode: 0, stdout: "", stderr: "", truncated: false, timedOut: false, cancelled: false, leftRunning: false, durationMs: 1 }) }) });
      managers.push(m);
      return m;
    };
    const servers = [{ name: "notes", command: "npx", args: ["-y", "notes-mcp"] }];

    // Review Only: no server starts.
    const quiet = mcpManager(scripted([[finish]]));
    const q = await quiet.start({ api: await api(), taskId: "t1", mode: "review_only", effort: "balanced", mcp: servers });
    await settle(quiet, q, (r) => r.state !== "running");
    expect(started).toEqual([]);

    const m = mcpManager(scripted([[{ id: "n", name: "mcp__notes__search", input: { q: "launch" } }], [finish]]));
    const id = await m.start({ api: await api(), taskId: "t1", mode: "controlled", effort: "balanced", mcp: servers });
    const waiting = await settle(m, id, (r) => r.pendingApproval !== null);
    expect(started).toEqual(["notes"]);
    expect(waiting.events.some((e) => e.kind === "note" && e.text.startsWith("Offered 1 tool from your MCP servers. Each call waits for your approval."))).toBe(true);
    expect(waiting.pendingApproval).toMatchObject({ program: "mcp:notes", args: ["search", '{"q":"launch"}'], where: "local" });
    expect(called).toEqual([]);
    m.answer(id, waiting.pendingApproval!.id, true, waiting.pendingApproval!.bindingHash);
    const done = await settle(m, id, (r) => r.state !== "running");
    expect(done.state).toBe("completed");
    expect(called).toEqual(['search {"q":"launch"}']);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(closed).toBe(1);
  });

  it("cancels a run that's waiting, and discards its copy", async () => {
    const m = manager(scripted([[{ id: "c", name: "run_command", input: { program: "pnpm", args: ["build"], reason: "Build." } }]]), {
      where: "local",
      run: async () => {
        throw new Error("must not run");
      },
    });
    const id = await m.start({ api: await api(), taskId: "t1", mode: "controlled", effort: "balanced" });
    await settle(m, id, (r) => r.pendingApproval !== null);
    m.cancel(id);
    const run = await settle(m, id, (r) => r.state !== "running");
    expect(run.state).toBe("cancelled");
    await m.discard(id);
    expect(m.get(id)?.discarded).toBe(true);
    await expect(fs.access(path.join(dir, "workspaces", id))).rejects.toThrow();
  });

  it("shows a run that was working when the app closed as interrupted, and never resumes it", async () => {
    await fs.mkdir(path.join(dir, "runs"), { recursive: true });
    const saved = { id: "r1", taskId: "t1", taskTitle: "T", projectName: "P", mode: "review_only", provider: "anthropic", model: "m", state: "running", startedAt: "2026-10-18T10:00:00.000Z", endedAt: null, outcome: null, events: [], pendingApproval: null, finish: null, changes: [], notProposed: [], usage: { inputTokens: 0, outputTokens: 0 }, proposal: null, discarded: false, contractVersion: 1, contractSha256: "c".repeat(64) };
    await fs.writeFile(path.join(dir, "runs", "r1.json"), JSON.stringify(saved));
    const m = manager(scripted([]));
    await m.load();
    expect(m.get("r1")).toMatchObject({ state: "interrupted", outcome: expect.stringMatching(/won't continue on its own/) });
    expect(JSON.parse(await fs.readFile(path.join(dir, "runs", "r1.json"), "utf8")).state).toBe("interrupted");
    await expect(m.submit("r1", await api())).rejects.toThrow(/Only a finished run/);
  });

  it("refuses Sandboxed Autopilot until it's built", async () => {
    await expect(manager(scripted([])).start({ api: await api(), taskId: "t1", mode: "sandboxed_autopilot", effort: "balanced" })).rejects.toThrow(/isn't available yet/);
  });
});
