/**
 * Agent runs on this computer. A run copies the task's project into its own
 * folder, works on it with the agent loop and keeps a record on disk. The
 * finished change waits for the person to submit it; nothing is sent to
 * Farbaek on its own. A run that was working when the app closed comes back
 * as interrupted and never continues by itself: the person starts it again
 * (a new run on a fresh copy) or discards it.
 *
 * This module has no Electron imports, so it's unit-tested with Node alone.
 */
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { stateAfterRestart } from "@/core/agent/operations";
import type { AgentMode } from "@/core/agent/modes";
import { proposalHash, type ProposedChange } from "@/core/realityloop/change-proposal";
import { sha256Hex } from "@/core/trust/canonical-json";
import { checkPath } from "@/core/workspace/files";
import type { IntentContract } from "@/core/realityloop/contract";
import type { AgentProposalResult, AgentProposalStatus, AgentTaskDetail, ProposalSubmission, SnapshotFile } from "@/agent-runtime/farbaek-client";
import { ProjectFolder } from "@/agent-runtime/fs-guard";
import { runAgent, type ApprovalAnswer, type RunEvent, type RunLimits } from "@/agent-runtime/loop";
import { connectMcp, type McpClient } from "@/agent-runtime/mcp/client";
import { connectMcpServers, type ExternalTools, type McpServerConfig } from "@/agent-runtime/mcp/external";
import { spawnStdioTransport } from "@/agent-runtime/mcp/stdio";
import { createFarbaekToolModel, type GatewayClient } from "@/agent-runtime/models/farbaek";
import { createLocalToolModel } from "@/agent-runtime/models/local";
import type { ToolModel } from "@/agent-runtime/models/types";
import { createLocalRunner, type CommandRunner } from "@/agent-runtime/runners";
import { AgentWorkspace, materialize } from "@/agent-runtime/workspace";
import type { DisplayEvent, Effort, ProposalReview, RunDetail, RunSummary } from "../shared/api";

/** What a run needs from Farbaek, model steps included. FarbaekAgentClient fits. */
export interface RunApi extends GatewayClient {
  task(id: string): Promise<AgentTaskDetail>;
  snapshot(taskId: string): Promise<SnapshotFile[]>;
  submitProposal(taskId: string, proposal: ProposalSubmission): Promise<AgentProposalResult>;
}

/** What checking a proposal needs from Farbaek. FarbaekAgentClient fits. */
export interface ProposalStatusApi {
  proposal(id: string): Promise<AgentProposalStatus>;
}

/** What changed since the last check, in words for the run's log; null when nothing did. */
function reviewNote(before: ProposalReview | undefined, after: ProposalReview): string | null {
  if (after.matchesSent === false && before?.matchesSent !== false) return "Farbaek's record of this change doesn't match what this computer sent. Don't approve it: discard it in Farbaek.";
  if (after.status !== (before?.status ?? "pending")) {
    if (after.status === "applied") return "Approved and applied in Farbaek.";
    if (after.status === "discarded") return "Discarded in Farbaek.";
  }
  const pack = after.proofPack?.status;
  if (pack && pack !== before?.proofPack?.status) {
    if (pack === "verified") return "Verified in Farbaek: its checks passed.";
    if (pack === "failed") return "Its checks failed in Farbaek.";
    if (pack === "partially_verified") return "Partly verified in Farbaek: some checks passed.";
  }
  return null;
}

export interface RunDeps {
  dataDir: string;
  /** The model for a run. Defaults to Farbaek's model gateway; tests pass a scripted one. */
  makeModel?(input: { api: RunApi; taskId: string; effort: Effort; onUsage(info: { percent: number | null; model: string; note: string | null }): void }): ToolModel;
  emit(run: RunDetail): void;
  /** Commands for Controlled Development. Defaults to the local broker in the run's folder. */
  makeRunner?(root: string): CommandRunner;
  /** How a local model (ADR 0134) is reached. Defaults to fetch; tests pass a fake local server. */
  localFetch?: typeof fetch;
  /** How an MCP server the person added is started (ADR 0148). Defaults to a child process in its own folder; tests pass a fake. */
  connectMcp?(server: McpServerConfig): Promise<McpClient>;
  limits?: Partial<RunLimits>;
  now?(): Date;
}

interface StoredRun extends RunDetail {
  contractVersion: number;
  contractSha256: string;
}

const MAX_EVENTS = 400;

export class RunError extends Error {}

export class RunManager {
  private readonly runs = new Map<string, StoredRun>();
  private readonly live = new Map<string, { controller: AbortController; approvals: Map<string, (answer: ApprovalAnswer) => void> }>();
  private readonly timers = new Map<string, NodeJS.Timeout>();
  private readonly writing = new Set<Promise<void>>();

  constructor(private readonly deps: RunDeps) {}

  private get runsDir() {
    return path.join(this.deps.dataDir, "runs");
  }

  private workspaceDir(id: string) {
    return path.join(this.deps.dataDir, "workspaces", id);
  }

  private now(): string {
    return (this.deps.now?.() ?? new Date()).toISOString();
  }

  /** Reads saved runs. Anything that was moving when the app stopped becomes interrupted. */
  async load(): Promise<void> {
    await fs.mkdir(this.runsDir, { recursive: true });
    for (const name of await fs.readdir(this.runsDir)) {
      if (!name.endsWith(".json") || name.endsWith(".changes.json")) continue;
      let run: StoredRun;
      try {
        run = JSON.parse(await fs.readFile(path.join(this.runsDir, name), "utf8")) as StoredRun;
        if (typeof run.id !== "string" || typeof run.state !== "string" || !Array.isArray(run.events)) continue;
        // Runs saved before the model gateway used the person's own key.
        run.effort ??= "balanced";
        run.usagePercent ??= null;
      } catch {
        continue;
      }
      const after = stateAfterRestart(run.state);
      if (after !== run.state) {
        run.state = after;
        run.pendingApproval = null;
        run.endedAt = run.endedAt ?? this.now();
        run.outcome = "The app closed while this run was working. It won't continue on its own: start it again or discard it.";
        run.events.push({ at: this.now(), kind: "note", text: "Interrupted when the app closed." });
        await this.save(run);
      }
      this.runs.set(run.id, run);
    }
  }

  list(): RunSummary[] {
    return [...this.runs.values()]
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
      .map(({ id, taskId, taskTitle, projectName, mode, effort, state, startedAt, endedAt, outcome, proposal, discarded }) => ({ id, taskId, taskTitle, projectName, mode, effort, state, startedAt, endedAt, outcome, proposal, discarded }));
  }

  get(id: string): RunDetail | null {
    const run = this.runs.get(id);
    return run ? this.detail(run) : null;
  }

  private detail(run: StoredRun): RunDetail {
    const detail: Partial<StoredRun> = structuredClone(run);
    delete detail.contractVersion;
    delete detail.contractSha256;
    return detail as RunDetail;
  }

  /** Writes the run to disk; `flush` waits for every write still under way. */
  private save(run: StoredRun): Promise<void> {
    const write = this.write(run);
    this.writing.add(write);
    void write.then(
      () => this.writing.delete(write),
      () => this.writing.delete(write),
    );
    return write;
  }

  private async write(run: StoredRun): Promise<void> {
    const file = path.join(this.runsDir, `${run.id}.json`);
    await fs.mkdir(this.runsDir, { recursive: true });
    await fs.writeFile(`${file}.tmp`, JSON.stringify(run), "utf8");
    await fs.rename(`${file}.tmp`, file);
  }

  /**
   * Writes every run that has a save waiting, and waits for writes already
   * under way. A run's last save can still be writing just after its state
   * changes, so call this before the data folder is closed or removed.
   */
  async flush(): Promise<void> {
    for (const [id, timer] of this.timers) {
      clearTimeout(timer);
      this.timers.delete(id);
      const run = this.runs.get(id);
      if (run) void this.save(run).catch(() => undefined);
    }
    while (this.writing.size > 0) await Promise.allSettled([...this.writing]);
  }

  /** Tells the window and saves soon (at once when `now`). */
  private touch(run: StoredRun, now = false): Promise<void> | void {
    this.deps.emit(this.detail(run));
    const pending = this.timers.get(run.id);
    if (pending) clearTimeout(pending);
    if (now) {
      this.timers.delete(run.id);
      return this.save(run);
    }
    this.timers.set(
      run.id,
      setTimeout(() => {
        this.timers.delete(run.id);
        void this.save(run).catch(() => undefined);
      }, 400),
    );
  }

  private record(run: StoredRun, event: RunEvent): void {
    const at = this.now();
    let shown: DisplayEvent | null = null;
    if (event.type === "model") {
      run.model = event.model;
      run.usage.inputTokens += event.usage.inputTokens;
      run.usage.outputTokens += event.usage.outputTokens;
      if (event.text.trim()) shown = { at, kind: "model", text: event.text.slice(0, 4_000), tokens: event.usage.inputTokens + event.usage.outputTokens };
    } else if (event.type === "tool") {
      shown = { at, kind: "tool", tool: event.tool, target: event.target.slice(0, 300), status: event.status, detail: event.detail.slice(0, 1_500) };
    } else if (event.type === "approval") {
      shown = { at, kind: "approval", display: event.request.display, risk: event.request.risk };
    }
    if (shown) {
      run.events.push(shown);
      if (run.events.length > MAX_EVENTS) run.events.splice(0, run.events.length - MAX_EVENTS, { at, kind: "note", text: "Earlier steps aren't shown." });
    }
    void this.touch(run);
  }

  async start(input: { api: RunApi; taskId: string; mode: AgentMode; effort: Effort; local?: { base: string; model: string } | null; mcp?: readonly McpServerConfig[] }): Promise<string> {
    if (input.mode === "sandboxed_autopilot") throw new RunError("Sandboxed Autopilot isn't available yet. Use Review Only or Controlled Development.");
    const task = await input.api.task(input.taskId);
    if (!task.task.readyForChange || !task.contract) throw new RunError("This task isn't waiting for a change: its plan isn't approved, or a change is already open.");
    const snapshot = await input.api.snapshot(input.taskId);

    const id = randomUUID();
    const dir = this.workspaceDir(id);
    await fs.mkdir(dir, { recursive: true });
    const folder = await ProjectFolder.open(dir);
    const { skipped } = await materialize(folder, snapshot);
    const workspace = await AgentWorkspace.open(
      folder,
      input.mode === "review_only" ? "patch" : "disk",
      task.files.map((f) => ({ path: f.path, revision: f.revision, sha256: f.sha256 })),
    );
    let noted = false;
    const onUsage = (info: { percent: number | null; model: string; note: string | null }) => {
      run.usagePercent = info.percent;
      if (info.note && !noted) {
        noted = true;
        run.events.push({ at: this.now(), kind: "note", text: info.note });
      }
    };
    // A local model (ADR 0134) runs on this computer and isn't metered; otherwise Farbaek's gateway.
    const makeModel = input.local
      ? () => createLocalToolModel({ base: input.local!.base, model: input.local!.model, fetch: this.deps.localFetch })
      : (this.deps.makeModel ?? ((i) => createFarbaekToolModel({ client: i.api, taskId: i.taskId, effort: i.effort, onUsage: i.onUsage })));
    const model = makeModel({ api: input.api, taskId: input.taskId, effort: input.effort, onUsage });
    const run: StoredRun = {
      id,
      taskId: task.task.id,
      taskTitle: task.task.title,
      projectName: task.project.name,
      mode: input.mode,
      effort: input.effort,
      model: model.model,
      state: "running",
      startedAt: this.now(),
      endedAt: null,
      outcome: null,
      events: [{ at: this.now(), kind: "note", text: `Copied ${snapshot.length} files to this computer.` }],
      pendingApproval: null,
      finish: null,
      changes: [],
      notProposed: skipped.map((s) => ({ path: s.path, reason: `Not copied to this computer: ${s.reason}` })),
      usage: { inputTokens: 0, outputTokens: 0 },
      usagePercent: null,
      proposal: null,
      discarded: false,
      contractVersion: task.contract.version,
      contractSha256: task.contract.sha256,
    };
    this.runs.set(id, run);
    await this.touch(run, true);
    const commands = input.mode === "controlled" ? (this.deps.makeRunner ?? createLocalRunner)(folder.root) : null;
    // MCP servers the person added (ADR 0148): only for Controlled Development, where every call waits for the person.
    const servers = input.mode === "controlled" ? (input.mcp ?? []) : [];
    const mcp = servers.length > 0 ? await connectMcpServers(servers, this.deps.connectMcp ?? ((s) => this.startMcpServer(s))) : null;
    if (mcp) {
      const count = mcp.tools.definitions.length;
      if (count > 0) {
        run.events.push({ at: this.now(), kind: "note", text: `Offered ${count} ${count === 1 ? "tool" : "tools"} from your MCP servers. Each call waits for your approval.${input.local ? "" : " The first time this agent offers a tool, Farbaek holds its AI steps until an owner or admin approves the tools on the Agents page."}` });
      }
      for (const problem of mcp.problems) run.events.push({ at: this.now(), kind: "note", text: `MCP server left out: ${problem}` });
    }
    void this.execute(run, workspace, model, commands, task.contract.body, mcp?.tools ?? null).finally(() => mcp?.close());
    return id;
  }

  /** A server the person added, started in a folder of its own, never in the project's copy. */
  private async startMcpServer(server: McpServerConfig): Promise<McpClient> {
    const cwd = path.join(this.deps.dataDir, "mcp", server.name);
    await fs.mkdir(cwd, { recursive: true });
    return connectMcp(await spawnStdioTransport({ command: server.command, args: server.args, cwd }), { clientVersion: "desktop" });
  }

  private async execute(run: StoredRun, workspace: AgentWorkspace, model: ToolModel, commands: CommandRunner | null, contract: IntentContract, external: ExternalTools | null = null): Promise<void> {
    const controller = new AbortController();
    const approvals = new Map<string, (answer: ApprovalAnswer) => void>();
    this.live.set(run.id, { controller, approvals });
    try {
      const report = await runAgent({
        runId: run.id,
        task: { id: run.taskId, title: run.taskTitle, contractVersion: run.contractVersion, contract },
        mode: run.mode,
        sandboxVerified: false,
        model,
        workspace,
        commands,
        external: external ?? undefined,
        signal: controller.signal,
        limits: this.deps.limits,
        onEvent: (event) => this.record(run, event),
        approve: (request, signal) =>
          new Promise<ApprovalAnswer>((resolve) => {
            approvals.set(request.id, resolve);
            run.pendingApproval = request;
            void this.touch(run);
            signal?.addEventListener(
              "abort",
              () => {
                approvals.delete(request.id);
                resolve({ approved: false });
              },
              { once: true },
            );
          }),
      });
      const o = report.outcome;
      if (o.kind === "finished") {
        const { changes, notProposed } = await workspace.changes();
        await fs.writeFile(path.join(this.runsDir, `${run.id}.changes.json`), JSON.stringify(changes), "utf8");
        run.state = "completed";
        run.finish = o.finish;
        run.changes = changes.map((c) => ({ path: c.path, kind: c.kind, bytes: Buffer.byteLength(c.content, "utf8"), reason: c.reason }));
        run.notProposed.push(...notProposed);
        run.outcome = changes.length > 0 ? "Finished. Review the change, then submit it to Farbaek." : "Finished without changing any files.";
      } else if (o.kind === "cancelled") {
        run.state = "cancelled";
        run.outcome = "Cancelled. Nothing was submitted.";
      } else {
        run.state = "failed";
        run.outcome =
          o.kind === "limit" ? o.detail : o.kind === "refused" ? "The model declined this task." : o.kind === "no_finish" ? "The model stopped without finishing the task." : o.detail;
      }
    } catch (error) {
      run.state = "failed";
      run.outcome = `The run stopped: ${error instanceof Error ? error.message.slice(0, 300) : "unknown error"}.`;
    } finally {
      run.pendingApproval = null;
      run.endedAt = this.now();
      this.live.delete(run.id);
      // The window already has the final state. If this write fails, the next save writes it, and until then a restart shows the run as interrupted; it never becomes an unhandled rejection.
      await Promise.resolve(this.touch(run, true)).catch(() => undefined);
    }
  }

  /** A person's answer to the approval the run is waiting for. Only the exact pending request can be answered. */
  answer(runId: string, requestId: string, approved: boolean, bindingHash: string): void {
    const live = this.live.get(runId);
    const run = this.runs.get(runId);
    const resolve = live?.approvals.get(requestId);
    if (!live || !run || !resolve || run.pendingApproval?.id !== requestId) return;
    live.approvals.delete(requestId);
    run.pendingApproval = null;
    run.events.push({ at: this.now(), kind: "note", text: approved ? "You approved the command." : "You declined the command." });
    void this.touch(run);
    resolve(approved ? { approved: true, bindingHash } : { approved: false });
  }

  /** Stops every working run, for example when the app quits. Commands they started are killed. */
  abortAll(): void {
    for (const id of this.live.keys()) this.cancel(id);
  }

  cancel(runId: string): void {
    const live = this.live.get(runId);
    if (!live) return;
    live.controller.abort();
    for (const resolve of live.approvals.values()) resolve({ approved: false });
    live.approvals.clear();
  }

  /** Sends a finished run's change to Farbaek, which checks it again and creates a proposal for review. */
  async submit(runId: string, api: RunApi): Promise<RunDetail> {
    const run = this.runs.get(runId);
    if (!run) throw new RunError("That run doesn't exist.");
    if (run.state !== "completed" || run.discarded) throw new RunError("Only a finished run can be submitted.");
    if (run.proposal) throw new RunError("This run was already submitted.");
    if (!run.finish || run.changes.length === 0) throw new RunError("This run didn't change any files, so there's nothing to submit.");
    const changes = JSON.parse(await fs.readFile(path.join(this.runsDir, `${run.id}.changes.json`), "utf8")) as ProposedChange[];
    const result = await api.submitProposal(run.taskId, {
      contractVersion: run.contractVersion,
      contractSha256: run.contractSha256,
      plan: { summary: run.finish.summary, steps: run.finish.steps, risks: run.finish.risks, checks: run.finish.checks },
      changes: changes.map((c) => ({ path: c.path, kind: c.kind, baseRevision: c.baseRevision, content: c.content, reason: c.reason })),
      notProposed: run.notProposed.slice(0, 100),
      usage: { model: run.model, inputTokens: run.usage.inputTokens, outputTokens: run.usage.outputTokens },
      mode: run.mode,
    });
    // Worked out here the way Farbaek does, so a later check can confirm Farbaek holds exactly what was sent.
    const sentSha256 = await proposalHash({
      taskId: run.taskId,
      contractVersion: run.contractVersion,
      contractSha256: run.contractSha256,
      changes: await Promise.all(
        changes.map(async (c) => {
          const checked = checkPath(c.path);
          return { ...c, path: checked.ok ? checked.path : c.path, sha256: await sha256Hex(c.content) };
        }),
      ),
    });
    run.proposal = { id: result.proposalId, status: result.status, policy: result.policy.outcome, violations: result.violations.map((v) => v.detail), submittedAt: this.now(), sentSha256 };
    run.events.push({ at: this.now(), kind: "note", text: result.status === "pending" ? "Submitted. It's waiting for review in Farbaek." : "Submitted, and Farbaek blocked it: it breaks the contract." });
    await this.touch(run, true);
    return this.detail(run);
  }

  /** Asks Farbaek where the run's proposal stands (waiting, applied, verified, discarded) and keeps the answer. */
  async refreshProposal(runId: string, api: ProposalStatusApi): Promise<RunDetail> {
    const run = this.runs.get(runId);
    if (!run) throw new RunError("That run doesn't exist.");
    if (!run.proposal) throw new RunError("This run hasn't been sent to Farbaek yet.");
    const s = await api.proposal(run.proposal.id);
    const review: ProposalReview = {
      status: s.status,
      expiresAt: s.expiresAt,
      decidedAt: s.decidedAt,
      appliedSha256: s.appliedSha256,
      proofPack: s.proofPack,
      matchesSent: run.proposal.sentSha256 ? s.sha256 === run.proposal.sentSha256 : null,
      checkedAt: this.now(),
    };
    const note = reviewNote(run.proposal.review, review);
    run.proposal.review = review;
    if (note) run.events.push({ at: this.now(), kind: "note", text: note });
    await this.touch(run, true);
    return this.detail(run);
  }

  /** Stops a run if it's working, deletes its copy of the project and its change, and keeps the record. */
  async discard(runId: string): Promise<void> {
    const run = this.runs.get(runId);
    if (!run) return;
    this.cancel(runId);
    await fs.rm(this.workspaceDir(runId), { recursive: true, force: true });
    await fs.rm(path.join(this.runsDir, `${runId}.changes.json`), { force: true });
    run.discarded = true;
    run.events.push({ at: this.now(), kind: "note", text: "Discarded. The copy of the project on this computer was deleted." });
    await this.touch(run, true);
  }
}
