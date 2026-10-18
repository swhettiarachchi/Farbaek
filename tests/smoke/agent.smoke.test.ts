/**
 * End-to-end check of the Farbaek Agent's platform path through a running
 * Farbaek server: pairing, the task and its contract, the project snapshot,
 * the local runtime (folder guard, workspace patch, the loop) and proposal
 * submission. Skipped unless run with `pnpm agent:smoke` and these are set:
 *
 *   FARBAEK_SMOKE_BASE_URL       e.g. http://localhost:3000
 *   FARBAEK_AGENT_PAIRING_CODE   a fresh code from the Agents page
 *   FARBAEK_AGENT_TASK           optional task id; otherwise the first ready task
 *   FARBAEK_AGENT_KEEP=1         optional: keep the agent paired afterwards
 *
 * No model is called: a scripted stand-in, labelled "farbaek-smoke-script",
 * makes one small edit inside the contract's scope. The proposal it submits
 * is an ordinary pending proposal; discard it in the web app afterwards.
 * The agent token stays in memory and is revoked at the end unless KEEP is set.
 */
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { pathScope } from "@/core/realityloop/change-proposal";
import { FarbaekAgentClient, pairWithFarbaek, type AgentTaskDetail } from "@/agent-runtime/farbaek-client";
import { ProjectFolder } from "@/agent-runtime/fs-guard";
import { runAgent } from "@/agent-runtime/loop";
import type { ModelStep, ToolModel } from "@/agent-runtime/models/types";
import { AgentWorkspace, materialize } from "@/agent-runtime/workspace";

const base = process.env.FARBAEK_SMOKE_BASE_URL;
const code = process.env.FARBAEK_AGENT_PAIRING_CODE;
const enabled = import.meta.env.MODE === "smoke" && Boolean(base && code);
const MARK = "<!-- Checked by the Farbaek Agent smoke test. Discard this proposal. -->";

let client: FarbaekAgentClient | null = null;
let dir: string | null = null;

/** Stands in for a model: read the target, append one line, finish. */
function scriptedModel(target: string, exists: boolean): ToolModel {
  const usage = { inputTokens: 0, outputTokens: 0 };
  return {
    provider: "anthropic",
    model: "farbaek-smoke-script",
    begin() {
      let turn = 0;
      let content = "";
      return {
        async send(input): Promise<ModelStep> {
          turn += 1;
          const step = (calls: ModelStep["toolCalls"]): ModelStep => ({ text: "", toolCalls: calls, stop: "tool_use", usage, model: "farbaek-smoke-script" });
          if (turn === 1) return exists ? step([{ id: "t1", name: "read_file", input: { path: target } }]) : step([{ id: "t1", name: "list_files", input: { dir: "" } }]);
          if (turn === 2) {
            const read = input.toolResults?.[0]?.content ?? "";
            content = exists ? (read.match(/<file>\n([\s\S]*)\n<\/file>/)?.[1] ?? "") : "";
            return step([{ id: "t2", name: "write_file", input: { path: target, content: `${content.replace(/\n*$/, "\n")}${exists ? "\n" : ""}${MARK}\n`, reason: "Smoke test of the agent pipeline." } }]);
          }
          return step([{ id: "t3", name: "finish", input: { summary: "Smoke test: one marked line added. Discard this proposal.", steps: [`Edited ${target}`], risks: ["Test change only."], checks: [] } }]);
        },
      };
    },
  };
}

function pickTarget(detail: AgentTaskDetail): { path: string; exists: boolean } {
  const scope = detail.contract ? pathScope(detail.contract.body) : [];
  const files = new Set(detail.files.map((f) => f.path));
  const ops = detail.contract?.body.allowedOperations ?? [];
  const file = scope.find((s) => files.has(s) && /\.(md|txt)$/i.test(s));
  if (file && ops.includes("files.edit")) return { path: file, exists: true };
  const newFile = scope.find((s) => !files.has(s) && /\.(md|txt)$/i.test(s));
  if (newFile && ops.includes("files.create")) return { path: newFile, exists: false };
  const folder = scope.find((s) => !files.has(s) && !/\.[a-z0-9]+$/i.test(s));
  if (folder && ops.includes("files.create")) return { path: `${folder}/farbaek-agent-smoke.md`, exists: false };
  throw new Error("The task's contract has no Markdown file or folder in scope that the smoke test can change.");
}

describe.skipIf(!enabled)("Farbaek Agent smoke test", () => {
  afterAll(async () => {
    if (client && process.env.FARBAEK_AGENT_KEEP !== "1") await client.unpair().catch(() => undefined);
    if (dir) await fs.rm(dir, { recursive: true, force: true });
  });

  it("pairs, downloads a task, works on a copy and submits a proposal", async () => {
    const paired = await pairWithFarbaek(base!, { code: code!, name: "Smoke test agent", platform: process.platform === "win32" ? "windows" : process.platform === "darwin" ? "macos" : "linux", appVersion: "0.1.0" });
    client = new FarbaekAgentClient(base!, paired.token);

    const me = await client.me();
    expect(me.agent.id).toBe(paired.agentId);
    expect(me.canPropose).toBe(true);

    const tasks = await client.tasks();
    const taskId = process.env.FARBAEK_AGENT_TASK ?? tasks[0]?.id;
    expect(taskId, "No task is waiting for a change. Approve a contract first.").toBeTruthy();
    const detail = await client.task(taskId!);
    expect(detail.task.readyForChange).toBe(true);

    const snapshot = await client.snapshot(taskId!);
    expect(snapshot.length).toBe(detail.files.length);
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "farbaek-agent-smoke-"));
    const folder = await ProjectFolder.open(dir);
    await materialize(folder, snapshot);
    const workspace = await AgentWorkspace.open(folder, "patch", detail.files);

    const target = pickTarget(detail);
    const report = await runAgent({
      runId: `smoke-${Date.now()}`,
      task: { id: detail.task.id, title: detail.task.title, contractVersion: detail.contract!.version, contract: detail.contract!.body },
      mode: "review_only",
      sandboxVerified: false,
      model: scriptedModel(target.path, target.exists),
      workspace,
      commands: null,
      approve: async () => ({ approved: false }),
    });
    expect(report.outcome.kind).toBe("finished");
    if (report.outcome.kind !== "finished") return;

    const { changes, notProposed } = await workspace.changes();
    expect(changes.map((c) => c.path)).toEqual([target.path]);
    const result = await client.submitProposal(taskId!, {
      contractVersion: detail.contract!.version,
      contractSha256: detail.contract!.sha256,
      plan: { summary: report.outcome.finish.summary, steps: report.outcome.finish.steps, risks: report.outcome.finish.risks, checks: report.outcome.finish.checks },
      changes: changes.map((c) => ({ path: c.path, kind: c.kind, baseRevision: c.baseRevision, content: c.content, reason: c.reason })),
      notProposed,
      usage: { model: report.model, inputTokens: report.usage.inputTokens, outputTokens: report.usage.outputTokens },
      mode: "review_only",
    });
    expect(result.status).toBe("pending");
    console.log(`Proposal ${result.proposalId} on task ${taskId}: ${result.policy.outcome}`);
  }, 120_000);
});
