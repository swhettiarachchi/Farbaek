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
import type { KitTier } from "@/core/media/studio-kit";
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
        verify?(files: { path: string; content: string }[]): Promise<VerificationOutcome>;
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

interface LiveRun {
  orgId: string;
  startedBy: string;
  controller: AbortController;
  approvals: Map<string, { resolve: (a: ApprovalAnswer) => void; bindingHash: string }>;
  /** Messages from the person, waiting for the agent's next step (ADR 0027). */
  messages: string[];
  /** Records an event in the run's history, once the run has started writing them. */
  record?: (e: RunEventPayload) => void;
}

// One registry per server process, kept across hot reloads in development.
const registry: Map<string, LiveRun> = ((globalThis as { __farbaekCloudRuns?: Map<string, LiveRun> }).__farbaekCloudRuns ??= new Map());

export function isRunLiveHere(runId: string): boolean {
  return registry.has(runId);
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
}

/** Checks and records the run, then starts it in the background. Returns as soon as it's recorded. */
export async function startCloudRun(deps: ExecutorDeps, input: StartRunInput): Promise<WriteResult<{ runId: string; mode: CloudRunMode }>> {
  const { person } = input;
  if (!CONTRIBUTOR_ROLES.includes(person.role)) return fail("FORBIDDEN");
  const allowed = requirePermission(person.role, person.permissions, "run_agents");
  if (!allowed.ok) return allowed;
  const task = await deps.checks.loadTask(person.orgId, input.taskId);
  if (!task) return fail("NOT_FOUND");
  if (task.state !== "CONTRACT_APPROVED") return fail("INVALID_TRANSITION", "The agent works on a task once its contract is approved and no proposal is open.");
  const contract = await deps.checks.approvedContract(person.orgId, task.id);
  if (!contract) return fail("INVALID_TRANSITION", "Approve the intent contract first.");
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
  void execute(deps, { runId, person, task: { id: task.id, title: task.title, projectId: task.projectId }, contract, effort: input.effort, mode, live, skills: chosen, capUnits, kitTier: input.kitTier ?? "core" }).catch((e) => {
    log("error", "cloud_run.crashed", { run: runId, error: e instanceof Error ? e.message : String(e) });
  });
  return { ok: true, value: { runId, mode } };
}

/** The person's answer to the approval a run is waiting for. Only the person who started it, or an owner or admin, may answer. */
export function answerRunApproval(person: RunPerson, input: { runId: string; requestId: string; approved: boolean; bindingHash: string }): WriteResult<null> {
  const live = registry.get(input.runId);
  if (!live || live.orgId !== person.orgId) return fail("NOT_FOUND", "That run isn't working on this server right now.");
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
  if (!live || live.orgId !== person.orgId) return fail("NOT_FOUND", "The agent has finished or isn't working on this server right now, so it can't read new messages.");
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
  if (!live || live.orgId !== person.orgId) return fail("NOT_FOUND", "That run isn't working on this server right now.");
  if (live.startedBy !== person.userId && !MANAGER_ROLES.includes(person.role)) return fail("FORBIDDEN", "Only the person who started the run, or an owner or admin, can stop it.");
  live.controller.abort();
  for (const p of live.approvals.values()) p.resolve({ approved: false });
  live.approvals.clear();
  return { ok: true, value: null };
}

/**
 * Stops live runs on this server for Office Space (ADR 0032): one
 * workspace's when it's suspended, or every run when AI is paused. Each run
 * ends as stopped, through its own abort path. Returns how many it stopped.
 */
export function abortCloudRuns(scope: { orgId: string } | "all"): number {
  let stopped = 0;
  for (const live of registry.values()) {
    if (scope !== "all" && live.orgId !== scope.orgId) continue;
    live.record?.({ kind: "note", text: "Farbaek stopped this run from Office Space." });
    live.controller.abort();
    for (const p of live.approvals.values()) p.resolve({ approved: false });
    live.approvals.clear();
    stopped += 1;
  }
  return stopped;
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
  },
): Promise<void> {
  const { runId, person, live } = r;
  const dir = path.join(deps.workRoot ?? path.join(os.tmpdir(), "farbaek-runs"), runId);
  let stopSandbox: (() => Promise<void>) | null = null;
  let verifyInSandbox: ((files: { path: string; content: string }[]) => Promise<VerificationOutcome>) | null = null;

  // Events are batched and written about once a second, and at once for approvals and the end.
  let pending: RunPatch = {};
  let flushing: Promise<void> = Promise.resolve();
  // How the run ended, for the email to the person who started it (ADR 0060).
  let ended: { status: "finished" | "failed" | "cancelled"; outcome: string } | null = null;
  const queue = (p: RunPatch) => {
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
        event({ kind: "note", text: "Started an isolated sandbox for tests and builds." });
      } else {
        const reason = box && "error" in box ? `: ${box.error.replace(/[.\s]+$/, "")}` : "";
        event({ kind: "note", text: `No sandbox this time${reason}. The agent will prepare the change without running anything.` });
      }
    }

    // What the run's settled steps have cost so far; refused steps were refunded and cost nothing.
    let spentUnits = 0;
    const startedAt = Date.now();
    const step = async (request: ModelStepRequest, signal?: AbortSignal): Promise<ModelStepReply> => {
      const budget = r.capUnits === null ? {} : { remainingUnits: Math.max(0, r.capUnits - spentUnits) };
      // The run's own lease (ADR 0117): this task's project and Farbaek's AI, for as long as a run can last.
      const lease = { expiresAt: new Date(startedAt + 2 * CLOUD_RUN_MAX_MINUTES * 60_000).toISOString(), projects: [r.task.projectId], capabilities: ["model" as const], actionsPerHour: 5_000 };
      const result = await callModel(deps.gateway.deps, deps.gateway.model, { agentId: `run:${runId}`, orgId: person.orgId, userId: person.userId, role: person.role, name: "Farbaek Agent", lease }, request, signal, budget);
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
          queue({ status: "failed", outcome: `The agent finished, but its change couldn't be proposed: ${prepared.message}`, finish: o.finish });
        } else {
          await flush();
          const created = await deps.runs.createRunProposal(runId, prepared.value.input);
          if (created.ok) {
            const blocked = prepared.value.blocked;
            const policy = prepared.value.input.policy;
            const autonomyNote = policy.findings.find((f) => f.rule === "autonomy");
            if (autonomyNote) event({ kind: "note", text: autonomyNote.detail });
            const applied = policy.outcome === "ALLOW_WITHIN_LIMITS" ? await deps.applyWithinLimits({ orgId: person.orgId, userId: person.userId, proposalId: created.value }) : null;
            // Checked straight away, in this run's sandbox, against exactly what applied (ADR 0047).
            let verified: VerificationOutcome | null = null;
            if (applied?.ok && verifyInSandbox) {
              const files = prepared.value.input.changes.filter((c) => !(c.kind === "create" && c.content === "")).map((c) => ({ path: c.path, content: c.content }));
              const n = r.contract.body.requiredChecks.length;
              event({ kind: "note", text: `Checking the applied change: running the contract's ${n === 1 ? "check" : `${n} checks`} in this run's sandbox.` });
              await flush();
              verified = await verifyInSandbox(files).catch(() => ({ ok: false as const, reason: "Something went wrong on Farbaek's side, so the checks didn't finish." }));
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
                ? "Finished. Farbaek blocked the change: it breaks the contract. Open the proposal to see why."
                : applied?.ok
                  ? verified
                    ? autoVerifiedOutcome(verified)
                    : "Finished. The change applied on its own, within this workspace's autonomy limits. Run its checks to verify it, or undo it from the task."
                  : applied
                    ? `Finished. The change couldn't apply on its own (${applied.message.replace(/[.\s]+$/, "")}), so it's waiting for your review.`
                    : "Finished. The change is waiting for your review.",
            });
          } else {
            const code = codeFromDatabaseError(created.error);
            queue({ status: "failed", finish: o.finish, outcome: `The agent finished, but its change couldn't be proposed: ${MESSAGES[code]}` });
          }
        }
      }
    } else if (o.kind === "limit") {
      // Stopped by the run's cap or a fixed limit: keep the work so far as a partial proposal, the checkpoint to carry on from.
      const { changes, notProposed } = await workspace.changes();
      const why = o.detail.replace(/\s+$/, "");
      if (changes.length === 0) {
        queue({ status: "failed", outcome: `${why} The agent hadn't changed any files yet.` });
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
          queue({ status: "finished", outcome: `${why} The work so far is waiting for your review as a partial change: apply it and choose Keep going to carry on.` });
        } else {
          queue({ status: "failed", outcome: `${why} The work so far couldn't be kept as a proposal.` });
        }
      }
    } else if (o.kind === "cancelled") {
      queue({ status: "cancelled", outcome: "Cancelled. Nothing was proposed." });
    } else {
      queue({ status: "failed", outcome: describeOutcome(o.kind, "detail" in o ? o.detail : null) });
    }
  } catch (e) {
    log("error", "cloud_run.failed", { run: runId, error: e instanceof Error ? e.message : String(e) });
    queue({ status: "failed", outcome: "The run stopped because of an error on Farbaek's side. Nothing was proposed." });
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
    if (ended && deps.afterRun) await deps.afterRun(r.task.id).catch(() => undefined);
    await fs.rm(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 }).catch(() => undefined);
  }
}
