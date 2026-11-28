/**
 * Runs the Farbaek Agent on Farbaek's servers (ADR 0022).
 *
 * A contributor starts a run on a task whose contract is approved. The server
 * copies the project into a private working folder and runs the same agent
 * loop as the desktop app: every tool call passes the registry and the
 * permission engine, model steps go through the model gateway (metered from
 * the wallet), and commands run in the run's sandbox session when a verified
 * sandbox is connected (Sandboxed Autopilot: tests and builds run, installs
 * and anything else wait for the person). Without one, the run prepares the
 * change without running anything.
 *
 * Runs live in this server process and report to the database as they go.
 * They survive the page closing, not a restart: a run that stops reporting
 * is marked interrupted and never resumed silently. The finished change
 * becomes an ordinary proposal, checked again like any other.
 */
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { FarbaekApiError, type ModelStepReply, type ModelStepRequest } from "@/agent-runtime/farbaek-client";
import { ProjectFolder } from "@/agent-runtime/fs-guard";
import { runAgent, type ApprovalAnswer, type RunEvent } from "@/agent-runtime/loop";
import { createFarbaekToolModel } from "@/agent-runtime/models/farbaek";
import type { ToolModel } from "@/agent-runtime/models/types";
import type { CommandRunner } from "@/agent-runtime/runners";
import { AgentWorkspace, materialize } from "@/agent-runtime/workspace";
import { CLOUD_RUN_MAX_MINUTES, RUN_HEARTBEAT_MS, boundEvent, type CloudRunMode, type RunEventPayload } from "@/core/agent/cloud-run";
import type { Effort } from "@/core/agent/routing";
import { heldSkillsNote, splitByPins, type SkillPin } from "@/core/agent/skill-pins";
import { projectSkills, type Skill } from "@/core/agent/skills";
import { getBuiltInSkill } from "@/content/skills";
import type { IntentContract } from "@/core/realityloop/contract";
import { passportBrief, type ContextPassport } from "@/core/realityloop/context-passport";
import { callModel, stepUnits, type GatewayDeps, type GatewayModel } from "@/server/agent/gateway";
import { prepareAgentProposal, type AgentStore, type ProposalChecks } from "@/server/agent/service";
import { log } from "@/server/observability/log";
import { codeFromDatabaseError, fail, MESSAGES, requirePermission, type WriteResult } from "@/server/workspace/use-cases";
import type { WithheldPermissions } from "@/core/workspace/permissions";
import { CONTRIBUTOR_ROLES, MANAGER_ROLES, type OrgRole } from "@/server/workspace/types";
import type { RunPatch, RunStore } from "./store";
import type { AutonomyLimits } from "@/core/trust/policy";
import type { KitTier, SiteTheme } from "@/core/media/studio-kit";
import { autoVerifiedOutcome, VERIFICATION_RESULT_WORDS } from "@/core/realityloop/verification";
import type { VerificationOutcome } from "@/server/verification/runner";
import type { Notifier } from "@/server/email/notify";

export interface RunPerson {
  orgId: string;
  userId: string;
  role: OrgRole;
  /** What an owner or admin turned off for them (ADR 0087). */
  permissions: WithheldPermissions;
}

export interface ExecutorDeps {
  runs: RunStore;
  /** Task, contract, files and the checks a proposal goes through. */
  checks: ProposalChecks & Pick<AgentStore, "fileContents">;
  gateway: { deps: GatewayDeps; model: GatewayModel };
  /** Starts the run's sandbox session and returns a runner for it, or null when no verified sandbox is connected. */
  sandbox(input: { runId: string; taskTitle: string; projectId: string; taskId: string; paths: string[]; pending(): Promise<{ path: string; content: string }[]>; onCommand(info: { command: string; exitCode: number | null; output: string }): void }): Promise<
    | {
        runner: CommandRunner;
        sessionId: string;
        /** Runs the contract's checks in this sandbox against exactly these applied files (ADR 0047). */
        verify?(): Promise<VerificationOutcome>;
        stop(): Promise<void>;
      }
    | { error: string }
    | null
  >;
  /** Whether a verified sandbox is connected, decided before the run starts. */
  sandboxAvailable(): boolean;
  /** The approved version of each of the project's own skills, by path (ADR 0043). */
  skillPins(orgId: string, projectId: string): Promise<Map<string, SkillPin>>;
  /** The workspace's autonomy at level 2, or null when changes wait for a person (ADR 0046). */
  autonomy(orgId: string): Promise<AutonomyLimits | null>;
  /** The task's Context Passport, read before the run (ADR 0116); absent or null when it can't be read. */
  context?(orgId: string, taskId: string): Promise<ContextPassport | null>;
  /** Applies a just-made proposal the workspace's autonomy allowed, exactly as proposed. */
  applyWithinLimits(input: { orgId: string; userId: string; proposalId: string }): Promise<{ ok: true } | { ok: false; message: string }>;
  /** Emails the person who started the run once it ends (ADR 0060); null or absent when email is off. */
  notify?: Pick<Notifier, "buildFinished"> | null;
  /** After the run ends, so a governed workflow can record its step and carry on (ADR 0092). */
  afterRun?: (taskId: string) => Promise<void>;
  /** Overrides the model, for tests. */
  makeModel?(input: { taskId: string; effort: Effort; step: (r: ModelStepRequest, signal?: AbortSignal) => Promise<ModelStepReply> }): ToolModel;
  workRoot?: string;
  now?(): Date;
}

/**
 * A stop that comes from outside the run and isn't the person's own choice (stage 291, ADR 0299): the server stopping
 * under it, AI work being paused, or its workspace being suspended.
 */
type OutsideStop = "restart" | "pause" | "suspended";
/** Said in the run's history the moment it is stopped. */
const STOP_NOTE: Record<OutsideStop, string> = {
  restart: "Farbaek's server is restarting, so this run is stopping. What it changed so far is being saved as a change for you to review.",
  pause: "AI work was paused, so this run stopped. Nothing it was working on was suggested.",
  suspended: "This workspace was suspended, so this run stopped. Nothing it was working on was suggested.",
};
/** Why a run stopped by a restart ended, as its outcome says it. A reboot and a deploy read the same from here. */
const RESTART_WHY = "Farbaek's server restarted while this run was working.";
/**
 * How a run stopped by a pause or a suspension ends. While either lasts, the database takes no change from an agent
 * (ADR 0083, ADR 0032), so its work is not kept, and the run says so.
 */
const STOPPED_OUTCOME: Record<Exclude<OutsideStop, "restart">, string> = {
  pause: "Stopped, because AI work was paused. Nothing was suggested.",
  suspended: "Stopped, because this workspace was suspended. Nothing was suggested.",
};

interface LiveRun {
  orgId: string;
  startedBy: string;
  controller: AbortController;
  approvals: Map<string, { resolve: (a: ApprovalAnswer) => void; bindingHash: string }>;
  /** Messages from the person, waiting for the agent's next step (ADR 0027). */
  messages: string[];
  /** Records an event in the run's history, once the run has started writing them. */
  record?: (e: RunEventPayload) => void;
  /**
   * Why the run is being stopped from outside, when it is. Stopped by a restart, its work so far is kept as a partial
   * change. A person's own cancel sets none of this, and neither does a stop that arrives after they cancelled.
   */
  stop?: OutsideStop;
}

// One registry per server process, kept across hot reloads in development.
const registry: Map<string, LiveRun> = ((globalThis as { __farbaekCloudRuns?: Map<string, LiveRun> }).__farbaekCloudRuns ??= new Map());
/**
 * Every run from its start to the last thing it writes. A run leaves the registry just before it writes its end, so the
 * registry alone would call a server idle while a run's final status was still on its way to the database.
 */
const endings: Set<Promise<void>> = ((globalThis as { __farbaekCloudRunEndings?: Set<Promise<void>> }).__farbaekCloudRunEndings ??= new Set());

export function isRunLiveHere(runId: string): boolean {
  return registry.has(runId);
}

/** Runs a stopping server has to wait for: those that are live, and those still writing how they ended. */
export function runsToDrainHere(): number {
  return endings.size;
}

/** Runs this server process is working on right now, for Office Space's health page. */
export function liveRunsHere(): number {
  return registry.size;
}

export interface StartRunInput {
  person: RunPerson;
  taskId: string;
  effort: Effort;
  /** Built-in skills the person chose for this build (ADR 0030); unknown ids are ignored. */
  skills?: readonly string[];
  /** The run's own usage cap in units (ADR 0040), worked out on the server; null for none. */
  capUnits?: number | null;
  /** Which Studio kit the build may use, from the workspace plan (ADR 0157); core when not given. */
  kitTier?: KitTier;
  /** A site's first build or a design upgrade: Free writes it with the standard model (ADR 0158). */
  designPass?: boolean;
  /** The colour theme the person chose on the plan card; light when not given (ADR 0158). */
  theme?: SiteTheme;
}

/** Checks and records the run, then starts it in the background. Returns as soon as it's recorded. */
export async function startCloudRun(deps: ExecutorDeps, input: StartRunInput): Promise<WriteResult<{ runId: string; mode: CloudRunMode }>> {
  const { person } = input;
  if (!CONTRIBUTOR_ROLES.includes(person.role)) return fail("FORBIDDEN");
  const allowed = requirePermission(person.role, person.permissions, "run_agents");
  if (!allowed.ok) return allowed;
  const task = await deps.checks.loadTask(person.orgId, input.taskId);
  if (!task) return fail("NOT_FOUND");
  if (task.state !== "CONTRACT_APPROVED") return fail("INVALID_TRANSITION", "The agent works on a task once its plan is approved and no other change is open.");
  const contract = await deps.checks.approvedContract(person.orgId, task.id);
  if (!contract) return fail("INVALID_TRANSITION", "Approve the plan first.");
  const project = await deps.checks.project(person.orgId, task.projectId);
  if (!project) return fail("NOT_FOUND");
  if (project.archived) return fail("PROJECT_ARCHIVED");

  const mode: CloudRunMode = deps.sandboxAvailable() ? "sandboxed" : "review_only";
  const capUnits = input.capUnits && input.capUnits > 0 ? Math.ceil(input.capUnits) : null;
  const started = await deps.runs.start({ orgId: person.orgId, actor: person.userId, taskId: task.id, effort: input.effort, mode, contractVersion: contract.version, contractSha256: contract.sha256, capUnits });
  if (!started.ok) {
    if (started.error.includes("RUN_ACTIVE")) return fail("INVALID_TRANSITION", "An agent run is already working on this task. Open it from Build.");
    return fail(codeFromDatabaseError(started.error));
  }
  const runId = started.value;
  const live: LiveRun = { orgId: person.orgId, startedBy: person.userId, controller: new AbortController(), approvals: new Map(), messages: [] };
  registry.set(runId, live);
  const chosen = [...new Set(input.skills ?? [])].flatMap((id) => getBuiltInSkill(id) ?? []);
  const done = execute(deps, { runId, person, task: { id: task.id, title: task.title, projectId: task.projectId }, contract, effort: input.effort, mode, live, skills: chosen, capUnits, kitTier: input.kitTier ?? "core", designPass: input.designPass === true, theme: input.theme ?? "light" }).catch((e) => {
    log("error", "cloud_run.crashed", { run: runId, error: e instanceof Error ? e.message : String(e) });
  });
  endings.add(done);
  void done.finally(() => endings.delete(done));
  return { ok: true, value: { runId, mode } };
}

/** The person's answer to the approval a run is waiting for. Only the person who started it, or an owner or admin, may answer. */
/** Said when a run isn't in this server's registry: it ended, or the server restarted under it (production deploys on every merge). */
const NOT_LIVE_HERE = "This run isn't going any more: it finished, or Farbaek's server restarted while it was waiting. Its work so far is kept; if it stopped early, the task offers Keep going.";

export function answerRunApproval(person: RunPerson, input: { runId: string; requestId: string; approved: boolean; bindingHash: string }): WriteResult<null> {
  const live = registry.get(input.runId);
  if (!live || live.orgId !== person.orgId) return fail("NOT_FOUND", NOT_LIVE_HERE);
  if (live.startedBy !== person.userId && !MANAGER_ROLES.includes(person.role)) return fail("FORBIDDEN", "Only the person who started the run, or an owner or admin, can answer it.");
  const pending = live.approvals.get(input.requestId);
  if (!pending) return fail("NOT_FOUND", "That request was already answered or has expired.");
  if (input.approved && pending.bindingHash !== input.bindingHash) return fail("VERSION_CONFLICT", "The command changed since you looked at it. Look again.");
  live.approvals.delete(input.requestId);
  pending.resolve(input.approved ? { approved: true, bindingHash: input.bindingHash } : { approved: false });
  return { ok: true, value: null };
}

/** Longest message a person can send a running agent. */
export const RUN_MESSAGE_MAX = 1_000;

/**
 * A message for the running agent from the person who started it, or an
 * owner or admin. It reaches the agent at its next step as guidance; the
 * contract and the Guard still decide what may change.
 */
export function sendRunMessage(person: RunPerson, input: { runId: string; text: string }): WriteResult<null> {
  const live = registry.get(input.runId);
  if (!live || live.orgId !== person.orgId) return fail("NOT_FOUND", `${NOT_LIVE_HERE} It can't read new messages.`);
  if (live.startedBy !== person.userId && !MANAGER_ROLES.includes(person.role)) return fail("FORBIDDEN", "Only the person who started the run, or an owner or admin, can message it.");
  const text = input.text.replace(/\s+/g, " ").trim();
  if (!text) return fail("INVALID_TITLE", "Write a message first.");
  if (text.length > RUN_MESSAGE_MAX) return fail("INVALID_TITLE", `Keep messages under ${RUN_MESSAGE_MAX} characters.`);
  if (live.messages.length >= 10) return fail("INVALID_TRANSITION", "The agent hasn't read your last messages yet. Wait for its next step.");
  live.messages.push(text);
  live.record?.({ kind: "note", text, from: "person" });
  return { ok: true, value: null };
}

export function cancelCloudRun(person: RunPerson, runId: string): WriteResult<null> {
  const live = registry.get(runId);
  if (!live || live.orgId !== person.orgId) return fail("NOT_FOUND", NOT_LIVE_HERE);
  if (live.startedBy !== person.userId && !MANAGER_ROLES.includes(person.role)) return fail("FORBIDDEN", "Only the person who started the run, or an owner or admin, can stop it.");
  live.controller.abort();
  for (const p of live.approvals.values()) p.resolve({ approved: false });
  live.approvals.clear();
  return { ok: true, value: null };
}

/** Stops a live run from outside. It ends through its own path, which says what stopped it. */
function stopFromOutside(live: LiveRun, why: OutsideStop): void {
  // Whatever stopped it first is what the run says. A person who had already cancelled it is the first: their cancel
  // suggests nothing, and a restart or a pause that lands while it winds down doesn't change that.
  if (!live.stop && !live.controller.signal.aborted) {
    live.stop = why;
    live.record?.({ kind: "note", text: STOP_NOTE[why] });
  }
  live.controller.abort();
  for (const p of live.approvals.values()) p.resolve({ approved: false });
  live.approvals.clear();
}

/**
 * Stops live runs on this server: one workspace's when its agents are paused (ADR 0083) or Office Space suspends it
 * (ADR 0032), or every run when Farbaek pauses AI. Each run ends through its own path and suggests nothing: while a
 * pause or a suspension lasts, the database takes no change from an agent. Returns how many it stopped.
 */
export function abortCloudRuns(scope: { orgId: string } | "all", why: Exclude<OutsideStop, "restart"> = "pause"): number {
  let stopped = 0;
  for (const live of registry.values()) {
    if (scope !== "all" && live.orgId !== scope.orgId) continue;
    stopFromOutside(live, why);
    stopped += 1;
  }
  return stopped;
}

/**
 * Stops every live run on this server because the server itself is stopping (production restarts it on every deploy),
 * and waits for each to keep its work so far and write how it ended (stage 291, ADR 0299). A run that was already
 * writing its end is waited for too. Resolves when they have all ended or after `maxMs`, whichever is first, with how
 * many it waited for. A run that hasn't ended by then is found later by the sweep that marks runs that stopped
 * reporting, as before.
 */
export async function drainCloudRuns(maxMs: number): Promise<number> {
  for (const live of registry.values()) stopFromOutside(live, "restart");
  const ending = [...endings];
  if (ending.length === 0) return 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  await Promise.race([
    Promise.allSettled(ending),
    new Promise<void>((resolve) => {
      timer = setTimeout(resolve, Math.max(0, maxMs));
    }),
  ]);
  clearTimeout(timer);
  return ending.length;
}

function describeOutcome(kind: string, detail: string | null): string {
  switch (kind) {
    case "refused":
      return "The model declined this task.";
    case "no_finish":
      return "The model stopped without finishing the task.";
    default:
      return detail ?? "The run stopped.";
  }
}

async function execute(
  deps: ExecutorDeps,
  r: {
    runId: string;
    person: RunPerson;
    task: { id: string; title: string; projectId: string };
    contract: { version: number; sha256: string; body: IntentContract };
    effort: Effort;
    mode: CloudRunMode;
    live: LiveRun;
    skills: readonly Skill[];
    capUnits: number | null;
    kitTier: KitTier;
    designPass: boolean;
    theme: SiteTheme;
  },
): Promise<void> {
  const { runId, person, live } = r;
  const dir = path.join(deps.workRoot ?? path.join(os.tmpdir(), "farbaek-runs"), runId);
  let stopSandbox: (() => Promise<void>) | null = null;
  let verifyInSandbox: (() => Promise<VerificationOutcome>) | null = null;

  // Events are batched and written about once a second, and at once for approvals and the end.
  let pending: RunPatch = {};
  let flushing: Promise<void> = Promise.resolve();
  // How the run ended, for the email to the person who started it (ADR 0060).
  let ended: { status: "finished" | "failed" | "cancelled"; outcome: string } | null = null;
  /** The run wrote an end of any kind, interrupted among them: what waits on it (a workflow's step) is settled. */
  let over = false;
  const queue = (p: RunPatch) => {
    if (p.status === "finished" || p.status === "failed" || p.status === "cancelled" || p.status === "interrupted") over = true;
    if ((p.status === "finished" || p.status === "failed" || p.status === "cancelled") && p.outcome) ended = { status: p.status, outcome: p.outcome };
    pending = {
      ...pending,
      ...p,
      addSteps: (pending.addSteps ?? 0) + (p.addSteps ?? 0),
      addInputTokens: (pending.addInputTokens ?? 0) + (p.addInputTokens ?? 0),
      addOutputTokens: (pending.addOutputTokens ?? 0) + (p.addOutputTokens ?? 0),
      events: [...(pending.events ?? []), ...(p.events ?? [])],
    };
  };
  const flush = () => {
    flushing = flushing.then(async () => {
      while (pending.events && pending.events.length > 50) {
        const head = pending.events.slice(0, 50);
        pending.events = pending.events.slice(50);
        await deps.runs.update(runId, { events: head });
      }
      const batch = pending;
      pending = {};
      const written = await deps.runs.update(runId, batch);
      if (!written.ok) log("warn", "cloud_run.update_failed", { run: runId, error: written.error });
    });
    return flushing;
  };
  const event = (e: RunEventPayload) => queue({ events: [boundEvent(e)] });
  live.record = event;
  const timer = setInterval(() => void flush(), 1_000);
  // A heartbeat, so a run waiting for a person isn't taken for a stopped one.
  const heartbeat = setInterval(() => void deps.runs.update(runId, {}), RUN_HEARTBEAT_MS);

  try {
    queue({ status: "working" });
    const files = await deps.checks.projectFiles(person.orgId, r.task.projectId);
    const contents = await deps.checks.fileContents(person.orgId, r.task.projectId, files);
    await fs.mkdir(dir, { recursive: true });
    const folder = await ProjectFolder.open(dir);
    const { skipped } = await materialize(
      folder,
      files.flatMap((f) => (contents.has(f.path) ? [{ path: f.path, content: contents.get(f.path)! }] : [])),
    );
    const workspace = await AgentWorkspace.open(
      folder,
      r.mode === "sandboxed" ? "disk" : "patch",
      files.map((f) => ({ path: f.path, revision: f.revision, sha256: f.sha256 })),
    );
    event({ kind: "note", text: `Copied ${files.length - skipped.length} files into the run's working folder.` });
    // The skills chosen for this build, then the project's own (.farbaek/skills or .claude/skills), said out loud.
    // A project skill applies only in the version a person approved; new or changed ones wait (ADR 0043).
    const { use: pinned, held } = splitByPins(files, await deps.skillPins(person.orgId, r.task.projectId));
    const skills = [...r.skills, ...projectSkills(pinned.flatMap((f) => (contents.has(f.path) ? [{ path: f.path, content: contents.get(f.path)! }] : [])))];
    const heldNote = heldSkillsNote(held);
    if (heldNote) event({ kind: "note", text: heldNote });
    if (skills.length) event({ kind: "note", text: `Building to the Farbaek Studio standard on the Studio kit${r.kitTier === "pro" ? " with Studio kit Pro" : ""}, with these skills: ${skills.map((s) => (s.source === "project" ? `${s.name} (this project's)` : "label" in s ? String(s.label) : s.name)).join(", ")}.` });

    let commands: CommandRunner | null = null;
    if (r.mode === "sandboxed") {
      const box = await deps.sandbox({
        runId,
        taskTitle: r.task.title,
        projectId: r.task.projectId,
        taskId: r.task.id,
        paths: files.map((f) => f.path),
        pending: async () => (await workspace.changes()).changes.map((c) => ({ path: c.path, content: c.content })),
        onCommand: (c) => event({ kind: "command", command: c.command, exitCode: c.exitCode, output: c.output }),
      });
      if (box && "runner" in box) {
        commands = box.runner;
        stopSandbox = box.stop;
        verifyInSandbox = box.verify ?? null;
        queue({ sandboxSessionId: box.sessionId });
        event({ kind: "note", text: "Started an isolated test space for tests and builds." });
      } else {
        const reason = box && "error" in box ? `: ${box.error.replace(/[.\s]+$/, "")}` : "";
        event({ kind: "note", text: `No test space this time${reason}. The agent will prepare the change without running anything.` });
      }
    }

    // What the run's settled steps have cost so far; refused steps were refunded and cost nothing.
    let spentUnits = 0;
    const startedAt = Date.now();
    const step = async (request: ModelStepRequest, signal?: AbortSignal): Promise<ModelStepReply> => {
      const budget = r.capUnits === null ? {} : { remainingUnits: Math.max(0, r.capUnits - spentUnits) };
      // The run's own lease (ADR 0117): this task's project and Farbaek's AI, for as long as a run can last.
      const lease = { expiresAt: new Date(startedAt + 2 * CLOUD_RUN_MAX_MINUTES * 60_000).toISOString(), projects: [r.task.projectId], capabilities: ["model" as const], actionsPerHour: 5_000 };
      const result = await callModel(deps.gateway.deps, deps.gateway.model, { agentId: `run:${runId}`, orgId: person.orgId, userId: person.userId, role: person.role, name: "Farbaek Agent", lease }, r.designPass ? { ...request, design: true } : request, signal, budget);
      if (!result.ok) throw new FarbaekApiError(result.status, result.code, result.message);
      if (result.value.message.stop_reason !== "refusal") spentUnits += stepUnits(result.value.message);
      // The gateway's reply is Claude's message as it came; its content blocks all carry a type.
      return result.value as ModelStepReply;
    };
    let noted = false;
    const model = deps.makeModel
      ? deps.makeModel({ taskId: r.task.id, effort: r.effort, step })
      : createFarbaekToolModel({
          client: { modelStep: step },
          taskId: r.task.id,
          effort: r.effort,
          onUsage: (u) => {
            if (u.note && !noted) {
              noted = true;
              event({ kind: "note", text: u.note });
            }
          },
        });

    const onEvent = (e: RunEvent) => {
      if (e.type === "model") {
        queue({ model: e.model, addSteps: 1, addInputTokens: e.usage.inputTokens, addOutputTokens: e.usage.outputTokens });
        if (e.text.trim()) event({ kind: "model", text: e.text, model: e.model, tokens: e.usage.inputTokens + e.usage.outputTokens });
      } else if (e.type === "tool") {
        event({ kind: "tool", tool: e.tool, target: e.target, status: e.status, detail: e.detail });
      }
    };

    // What Farbaek knows about the task, with each fact's status, so the agent doesn't take a stale or missing one as given.
    const passport = deps.context ? await deps.context(person.orgId, r.task.id).catch(() => null) : null;
    const report = await runAgent({
      runId,
      task: { id: r.task.id, title: r.task.title, contractVersion: r.contract.version, contract: r.contract.body, ...(passport ? { context: passportBrief(passport, 30) } : {}) },
      mode: commands ? "sandboxed_autopilot" : "review_only",
      sandboxVerified: commands !== null,
      model,
      workspace,
      commands,
      signal: live.controller.signal,
      limits: { maxWallMs: CLOUD_RUN_MAX_MINUTES * 60_000 },
      onEvent,
      takeMessages: () => live.messages.splice(0),
      skills,
      kitTier: r.kitTier,
      theme: r.theme,
      approve: (request, signal) =>
        new Promise<ApprovalAnswer>((resolve) => {
          live.approvals.set(request.id, { resolve, bindingHash: request.bindingHash });
          event({ kind: "approval", requestId: request.id, display: request.display, risk: request.risk, reason: request.reason, why: request.why, bindingHash: request.bindingHash });
          queue({ status: "waiting" });
          void flush();
          signal?.addEventListener(
            "abort",
            () => {
              live.approvals.delete(request.id);
              resolve({ approved: false });
            },
            { once: true },
          );
          // The stop landed while the request was being put together: the listener above will never hear it.
          if (signal?.aborted) {
            live.approvals.delete(request.id);
            resolve({ approved: false });
          }
        }).then((answer) => {
          event({ kind: "note", text: answer.approved ? "Approved: the command ran." : "Declined: the command didn't run." });
          queue({ status: "working" });
          return answer;
        }),
    });

    const o = report.outcome;
    if (o.kind === "finished") {
      const { changes, notProposed } = await workspace.changes();
      if (changes.length === 0) {
        queue({ status: "finished", outcome: "Finished without changing any files.", finish: o.finish });
      } else {
        // A finished change may apply on its own within the workspace's autonomy limits (ADR 0046),
        // only when this run's own sandbox is there to check it straight away (ADR 0047).
        const policyContext = { autonomy: await deps.autonomy(person.orgId), verifiable: r.contract.body.requiredChecks.length > 0 && commands !== null && verifyInSandbox !== null };
        const prepared = await prepareAgentProposal(deps.checks, person, { kind: "run", runId }, r.task.id, {
          contractVersion: r.contract.version,
          contractSha256: r.contract.sha256,
          plan: { summary: o.finish.summary, steps: o.finish.steps, risks: o.finish.risks, checks: o.finish.checks },
          changes: changes.slice(0, 30).map((c) => ({ path: c.path, kind: c.kind, baseRevision: c.baseRevision, content: c.content, reason: c.reason })),
          notProposed: [...skipped.map((s) => ({ path: s.path, reason: `Not copied into the run: ${s.reason}` })), ...notProposed].slice(0, 100),
          usage: { model: report.model === "auto" ? "farbaek-gateway" : report.model, inputTokens: report.usage.inputTokens, outputTokens: report.usage.outputTokens },
          mode: commands ? "sandboxed_autopilot" : "review_only",
        }, policyContext);
        if (!prepared.ok) {
          queue({ status: "failed", outcome: `The agent finished, but its change couldn't be suggested: ${prepared.message}`, finish: o.finish });
        } else {
          await flush();
          const created = await deps.runs.createRunProposal(runId, prepared.value.input);
          if (created.ok) {
            const blocked = prepared.value.blocked;
            const policy = prepared.value.input.policy;
            const autonomyNote = policy.findings.find((f) => f.rule === "autonomy");
            if (autonomyNote) event({ kind: "note", text: autonomyNote.detail });
            const applied = policy.outcome === "ALLOW_WITHIN_LIMITS" ? await deps.applyWithinLimits({ orgId: person.orgId, userId: person.userId, proposalId: created.value }) : null;
            // Checked straight away (ADR 0047), in a fresh test space: the agent could have changed this one (ADR 0175).
            let verified: VerificationOutcome | null = null;
            if (applied?.ok && verifyInSandbox) {
              const n = r.contract.body.requiredChecks.length;
              event({ kind: "note", text: `Checking the applied change: running the plan's ${n === 1 ? "check" : `${n} checks`} in a fresh test space.` });
              await flush();
              verified = await verifyInSandbox().catch(() => ({ ok: false as const, reason: "Something went wrong on Farbaek's side, so the checks didn't finish." }));
              event({
                kind: "note",
                text: verified.ok
                  ? `${VERIFICATION_RESULT_WORDS[verified.result].title}. ${VERIFICATION_RESULT_WORDS[verified.result].detail.replace(" See the check run below.", " The check run is on the task.")}`
                  : verified.reason,
              });
            }
            queue({
              status: "finished",
              finish: o.finish,
              outcome: blocked
                ? "Finished. Farbaek stopped the change: it goes outside the plan or breaks a rule. Open the change to see why."
                : applied?.ok
                  ? verified
                    ? autoVerifiedOutcome(verified)
                    : "Finished. The change applied on its own, within the limits this workspace set. Run its checks to verify it, or undo it from the task."
                  : applied
                    ? `Finished. The change couldn't apply on its own (${applied.message.replace(/[.\s]+$/, "")}), so it's waiting for your review.`
                    : "Finished. The change is waiting for your review.",
            });
          } else {
            const code = codeFromDatabaseError(created.error);
            queue({ status: "failed", finish: o.finish, outcome: `The agent finished, but its change couldn't be suggested: ${MESSAGES[code]}` });
          }
        }
      }
    } else if (o.kind === "limit" || (o.kind === "cancelled" && live.stop === "restart")) {
      // Stopped by the run's cap or a fixed limit, or by the server stopping under it (stage 291, ADR 0299): keep the work
      // so far as a partial proposal, the checkpoint to carry on from. It is not applied: a person reviews it.
      const restarted = o.kind !== "limit";
      const { changes, notProposed } = await workspace.changes();
      const why = o.kind === "limit" ? o.detail.replace(/\s+$/, "") : RESTART_WHY;
      if (changes.length === 0) {
        // Nothing to keep. A limit is the run's own end. A restart is an interruption, and says what to do next.
        queue(restarted ? { status: "interrupted", outcome: `${why} The agent hadn't changed any files yet, so there was no work to keep. Start the run again.` } : { status: "failed", outcome: `${why} The agent hadn't changed any files yet.` });
      } else {
        const prepared = await prepareAgentProposal(deps.checks, person, { kind: "run", runId }, r.task.id, {
          contractVersion: r.contract.version,
          contractSha256: r.contract.sha256,
          plan: {
            summary: `Partial: the run stopped before finishing. ${why}`.slice(0, 2000),
            steps: ["Review what changed so far.", "Apply it if it's useful, then choose Keep going to carry on from it."],
            risks: ["The agent didn't finish, so this change may be incomplete."],
            checks: [],
          },
          changes: changes.slice(0, 30).map((c) => ({ path: c.path, kind: c.kind, baseRevision: c.baseRevision, content: c.content, reason: c.reason })),
          notProposed: [...skipped.map((s) => ({ path: s.path, reason: `Not copied into the run: ${s.reason}` })), ...notProposed].slice(0, 100),
          usage: { model: report.model === "auto" ? "farbaek-gateway" : report.model, inputTokens: report.usage.inputTokens, outputTokens: report.usage.outputTokens },
          mode: commands ? "sandboxed_autopilot" : "review_only",
        });
        const created = prepared.ok ? (await flush(), await deps.runs.createRunProposal(runId, prepared.value.input)) : null;
        if (prepared.ok && created?.ok) {
          // A partial change that the rules stopped can't be applied, so it doesn't say to apply it.
          queue({
            status: "finished",
            outcome: prepared.value.blocked
              ? `${why} The work so far was kept as a partial change, and Farbaek stopped it: it goes outside the plan or breaks a rule. Open the change to see why.`
              : `${why} The work so far is waiting for your review as a partial change: apply it and choose Keep going to carry on.`,
          });
        } else {
          queue({ status: restarted ? "interrupted" : "failed", outcome: `${why} The work so far couldn't be kept as a change.` });
        }
      }
    } else if (o.kind === "cancelled") {
      // The person's own cancel, or a pause or a suspension: nothing is suggested, and the run says which it was.
      queue({ status: "cancelled", outcome: live.stop === "pause" || live.stop === "suspended" ? STOPPED_OUTCOME[live.stop] : "Cancelled. Nothing was suggested." });
    } else {
      queue({ status: "failed", outcome: describeOutcome(o.kind, "detail" in o ? o.detail : null) });
    }
  } catch (e) {
    log("error", "cloud_run.failed", { run: runId, error: e instanceof Error ? e.message : String(e) });
    queue({ status: "failed", outcome: "The run stopped because of an error on Farbaek's side. Nothing was suggested." });
  } finally {
    clearInterval(timer);
    clearInterval(heartbeat);
    for (const p of live.approvals.values()) p.resolve({ approved: false });
    registry.delete(runId);
    // Messages that came after the agent's last step were shown as sent; say plainly that it didn't read them.
    if (live.messages.length > 0) {
      const n = live.messages.splice(0).length;
      event({ kind: "note", text: `The run ended before the agent read your last ${n === 1 ? "message" : `${n} messages`}, so ${n === 1 ? "it wasn't" : "they weren't"} used. Send it again under Keep going.` });
    }
    await flush().catch(() => undefined);
    if (stopSandbox) await stopSandbox().catch(() => undefined);
    if (ended && deps.notify) {
      const end: { status: "finished" | "failed" | "cancelled"; outcome: string } = ended;
      await deps.notify.buildFinished({ userId: person.userId, taskId: r.task.id, taskTitle: r.task.title, ...end }).catch(() => undefined);
    }
    if (over && deps.afterRun) await deps.afterRun(r.task.id).catch(() => undefined);
    await fs.rm(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 }).catch(() => undefined);
  }
}
