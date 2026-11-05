/**
 * What the phone shows, read through the same WorkspaceReader as the web app
 * (ADR 0110): with the person's own session, so Row Level Security decides
 * what's visible, or from the sample workspace. Shapes are plain JSON the app
 * decodes; times are ISO strings, and every state comes with its words.
 */
import { lensForChange, lensSummary } from "@/core/realityloop/intent-lens";
import { diffLines, splitLines } from "@/core/realityloop/line-diff";
import { taskNextStep, type NextStep } from "@/core/realityloop/next-step";
import type { TaskState } from "@/core/realityloop/task-machine";
import { TASK_STATE_LABELS, lifecycleProgress, stateTone } from "@/core/realityloop/progress";
import { EFFORT_LABELS } from "@/core/agent/routing";
import { RUN_STATUS_LABELS, isLive, type RunStatus } from "@/core/agent/cloud-run";
import { getPlan } from "@/core/billing/catalog";
import { approvalWindow, walletRisk } from "@/core/trust/approval-wallet";
import type { RunEventView, RunView } from "@/server/cloud-agent/store";
import type { AppContext } from "@/server/workspace/context";
import { CONTRIBUTOR_ROLES, MANAGER_ROLES, type Project, type Task, type WorkspaceReader } from "@/server/workspace/types";

/** The runs a view can read: the person's own, or none in the sample workspace. */
export interface RunReader {
  list(options: { taskId?: string; limit?: number }): Promise<RunView[]>;
  get(runId: string): Promise<RunView | null>;
  events(runId: string, after: number): Promise<RunEventView[]>;
}

export const NO_RUNS: RunReader = { list: async () => [], get: async () => null, events: async () => [] };

/** Most lines of diff one review sends, so a large change still opens quickly on a phone. */
const MAX_DIFF_LINES = 1_500;
const MAX_FILE_LINES = 400;
const MAX_APPROVALS = 25;

export function taskItem(t: Task) {
  return {
    id: t.id,
    title: t.title,
    state: t.state,
    stateLabel: TASK_STATE_LABELS[t.state],
    tone: stateTone(t.state),
    projectId: t.projectId,
    projectName: t.projectName ?? "Project",
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
  };
}

export function runItem(r: RunView) {
  return {
    id: r.id,
    taskId: r.taskId,
    taskTitle: r.taskTitle,
    projectName: r.projectName,
    status: r.status,
    statusLabel: RUN_STATUS_LABELS[r.status],
    live: isLive(r.status),
    effort: r.effort,
    effortLabel: EFFORT_LABELS[r.effort].title,
    model: r.model,
    steps: r.steps,
    outcome: r.outcome,
    proposalId: r.proposalId,
    startedAt: r.startedAt,
    endedAt: r.endedAt,
  };
}

function projectItem(p: Project) {
  return { id: p.id, name: p.name, description: p.description, createdAt: p.createdAt, archived: p.archivedAt !== null };
}

/**
 * Who bills the open workspace (ADR 0112): "web" (Dodo), "apple" (the App Store) or null while it
 * has no paid plan; whether its plan is live; and whether App Store purchases are open on this server.
 */
export interface BillingFacts {
  managedBy: "web" | "apple" | null;
  live: boolean;
  applePurchases: boolean;
}

/** Who's signed in, the workspaces they can open, and what this phone can do. */
export function meView(ctx: AppContext, phone: { push: { available: boolean; on: boolean }; billing?: BillingFacts | null }) {
  return {
    sample: ctx.mode === "demo",
    user: { id: ctx.user.id, email: ctx.user.email },
    workspaces: ctx.workspaces.map((w) => ({
      id: w.id,
      name: w.name,
      plan: getPlan(w.plan.planId).name,
      paused: w.suspension?.notice ?? null,
      agentsPaused: w.agentsPaused !== null,
    })),
    current: ctx.current?.id ?? null,
    role: ctx.role,
    writes: ctx.writes.enabled ? { enabled: true as const, reason: null } : { enabled: false as const, reason: ctx.writes.reason },
    push: phone.push,
    billing: phone.billing
      ? { ...phone.billing, canManage: ctx.role !== null && MANAGER_ROLES.includes(ctx.role), accountToken: ctx.current?.id ?? null }
      : null,
  };
}

/** The first screen: what waits for the person, what's running, and what happened lately. */
export async function homeView(reader: WorkspaceReader, orgId: string, runs: RunReader) {
  const [tasks, projects, recentRuns] = await Promise.all([reader.listTasks(orgId, { limit: 50 }), reader.listProjects(orgId), runs.list({ limit: 10 })]);
  // Counted as Approvals lists them, so Home and the tab's badge never promise a change that isn't there (ADR 0174).
  const latest = await Promise.all(
    tasks
      .filter((t) => t.state === "APPROVAL_PENDING")
      .slice(0, MAX_APPROVALS)
      .map((t) => reader.getLatestProposal(orgId, t.id).catch(() => null)),
  );
  return {
    waiting: latest.filter((p) => p?.status === "pending").length,
    live: recentRuns.filter((r) => isLive(r.status)).map(runItem),
    recent: tasks.slice(0, 10).map(taskItem),
    projects: projects.filter((p) => !p.archivedAt).length,
  };
}

/** The approvals inbox as wallet cards, soonest to close first (ADR 0042). */
export async function approvalsView(ctx: AppContext, orgId: string, execution: { mode: string; reason?: string }) {
  const waiting = (await ctx.reader.listTasks(orgId)).filter((t) => t.state === "APPROVAL_PENDING");
  const canApproveEscalated = ctx.role !== null && MANAGER_ROLES.includes(ctx.role);
  const cards = await Promise.all(
    waiting.slice(0, MAX_APPROVALS).map(async (t) => {
      const [proposal, contract] = await Promise.all([ctx.reader.getLatestProposal(orgId, t.id), ctx.reader.getContract(orgId, t.id)]);
      if (!proposal || proposal.status !== "pending") return null;
      const bases = await editBases(ctx.reader, orgId, t.projectId, proposal.changes);
      const lens = contract ? lensSummary(proposal.changes.map((c) => lensForChange(contract.body, c, bases[c.path] ?? ""))) : null;
      const escalated = proposal.policy?.outcome === "ESCALATE";
      return {
        taskId: t.id,
        proposalId: proposal.id,
        title: t.title,
        projectName: t.projectName ?? "Project",
        sha256: proposal.sha256,
        createdAt: proposal.createdAt,
        expiresAt: proposal.expiresAt,
        byAgent: proposal.agentId !== null,
        facts: walletRisk({ policyOutcome: proposal.policy?.outcome ?? null, lens, changes: proposal.changes }),
        checks: contract?.body.requiredChecks ?? [],
        checksNote: execution.mode === "review_only" ? (execution.reason ?? null) : null,
        canApprove: !escalated || canApproveEscalated,
      };
    }),
  );
  const items = cards.filter((c) => c !== null).sort((a, b) => a.expiresAt.localeCompare(b.expiresAt));
  return { items, more: Math.max(0, waiting.length - MAX_APPROVALS) };
}

async function editBases(reader: WorkspaceReader, orgId: string, projectId: string, changes: readonly { path: string; kind: "create" | "edit"; baseRevision: number }[]) {
  return Object.fromEntries(
    await Promise.all(changes.filter((c) => c.kind === "edit").map(async (c) => [c.path, (await reader.getFileRevision(orgId, projectId, c.path, c.baseRevision)) ?? ""] as const)),
  ) as Record<string, string>;
}

type DiffLine = { kind: "add" | "del" | "ctx"; text: string; old: number | null; new: number | null };

/** A change as hunks of numbered lines, cut off past the phone's limits and saying so. */
export function fileDiff(base: string, content: string, budget: number): { hunks: { lines: DiffLine[] }[]; added: number; removed: number; truncated: boolean; used: number } {
  const hunks = diffLines(base, content);
  const oldLines = splitLines(base);
  let used = 0;
  let truncated = false;
  let added = 0;
  let removed = 0;
  const out: { lines: DiffLine[] }[] = [];
  const room = Math.min(budget, MAX_FILE_LINES);
  for (const h of hunks) {
    added += h.added.length;
    removed += h.removed.length;
    if (truncated) continue;
    const lines: DiffLine[] = [];
    // Up to two unchanged lines before the hunk, so it reads in place.
    for (let n = Math.max(1, h.oldStart - 2); n < h.oldStart; n++) lines.push({ kind: "ctx", text: oldLines[n - 1] ?? "", old: n, new: h.newStart - (h.oldStart - n) });
    h.removed.forEach((text, i) => lines.push({ kind: "del", text, old: h.oldStart + i, new: null }));
    h.added.forEach((text, i) => lines.push({ kind: "add", text, old: null, new: h.newStart + i }));
    if (used + lines.length > room) {
      const fit = Math.max(0, room - used);
      if (fit > 0) out.push({ lines: lines.slice(0, fit) });
      used += fit;
      truncated = true;
      continue;
    }
    out.push({ lines });
    used += lines.length;
  }
  return { hunks: out, added, removed, truncated, used };
}

/** One approval in full: the plan, each file as a diff, what the policy found, and whether this person can approve it. */
export async function approvalView(ctx: AppContext, orgId: string, taskId: string, execution: { mode: string; reason?: string }) {
  const found = await ctx.reader.getTask(orgId, taskId);
  if (!found) return null;
  const proposal = await ctx.reader.getLatestProposal(orgId, taskId);
  if (!proposal) return null;
  const [contract, project] = await Promise.all([ctx.reader.getContract(orgId, taskId), ctx.reader.getProject(orgId, found.task.projectId)]);
  const bases = await editBases(ctx.reader, orgId, found.task.projectId, proposal.changes);
  let budget = MAX_DIFF_LINES;
  const files = proposal.changes.map((c) => {
    const d = fileDiff(c.kind === "edit" ? (bases[c.path] ?? "") : "", c.content, budget);
    budget -= d.used;
    return { path: c.path, kind: c.kind, reason: c.reason, added: d.added, removed: d.removed, hunks: d.hunks, truncated: d.truncated };
  });
  const escalated = proposal.policy?.outcome === "ESCALATE";
  const canApproveEscalated = ctx.role !== null && MANAGER_ROLES.includes(ctx.role);
  const blockers = [
    !ctx.writes.enabled ? ctx.writes.reason : null,
    project?.archivedAt ? ARCHIVED_REASON : null,
    proposal.status !== "pending" ? "This change isn't waiting for approval any more." : null,
    found.task.state !== "APPROVAL_PENDING" ? "This task isn't waiting for approval." : null,
    escalated && !canApproveEscalated ? "This change needs an owner or admin to approve it." : null,
    ctx.permissions.approve === false ? "An owner or admin turned off approving for you in this workspace." : null,
  ].filter((r): r is string => r !== null);
  return {
    task: taskItem(found.task),
    proposal: {
      id: proposal.id,
      status: proposal.status,
      sha256: proposal.sha256,
      createdAt: proposal.createdAt,
      expiresAt: proposal.expiresAt,
      model: proposal.model,
      byAgent: proposal.agentId !== null,
      summary: proposal.plan.summary,
      steps: proposal.plan.steps,
      risks: proposal.plan.risks,
      checks: contract?.body.requiredChecks ?? proposal.plan.checks,
      checksNote: execution.mode === "review_only" ? (execution.reason ?? null) : null,
      policy: proposal.policy ? { outcome: proposal.policy.outcome, findings: proposal.policy.findings.map((f) => ({ rule: f.rule, outcome: f.outcome, detail: f.detail })) } : null,
      dropped: proposal.dropped.map((d) => ({ path: d.path, reason: d.reason })),
      files,
    },
    canApprove: blockers.length === 0,
    approveReason: blockers[0] ?? null,
    canDiscard: ctx.writes.enabled && (proposal.status === "pending" || proposal.status === "blocked"),
  };
}

const FILTERS = {
  all: () => true,
  waiting: (t: Task) => t.state === "APPROVAL_PENDING" || t.state === "REVIEW_REQUIRED" || t.state === "REQUIRES_HUMAN_INTERVENTION" || t.state === "CONTRACT_DRAFTED",
  active: (t: Task) => ["EXECUTION_AUTHORIZED", "EXECUTING", "VERIFYING", "CONTRACT_APPROVED", "PLAN_PROPOSED", "POLICY_EVALUATED"].includes(t.state),
  done: (t: Task) => t.state === "VERIFIED" || t.state === "PARTIALLY_VERIFIED" || t.state === "RECOVERED",
  stopped: (t: Task) => ["FAILED", "BLOCKED", "REJECTED", "EXPIRED", "CANCELLED", "INTERRUPTED"].includes(t.state),
} as const;
export type TaskFilter = keyof typeof FILTERS;
export const isTaskFilter = (v: unknown): v is TaskFilter => typeof v === "string" && Object.hasOwn(FILTERS, v);

export async function tasksView(reader: WorkspaceReader, orgId: string, filter: TaskFilter) {
  const tasks = await reader.listTasks(orgId, { limit: 100 });
  return { items: tasks.filter(FILTERS[filter]).slice(0, 60).map(taskItem) };
}

/** The web's words for it. */
const ARCHIVED_REASON = "This project is archived, so nothing in it can change.";

const UNDO_IS_THE_NEXT_STEP: ReadonlySet<TaskState> = new Set<TaskState>(["FAILED", "INTERRUPTED", "VERIFYING"]);

/**
 * The web's next step, for the iPhone app (ADR 0173). Its words are the web's, so both always agree. An action the app
 * has a screen for keeps its label, and anything else opens the task on the web, saying so.
 */
export function phoneNextStep(step: NextStep, facts: { state: TaskState; hasChange: boolean; hasPlan: boolean; approvedWithNoRun: boolean }) {
  const { state, hasChange, hasPlan, approvedWithNoRun } = facts;
  const target = step.action?.target;
  // The app reads and approves a plan. Writing or changing one is on the web.
  const planOpens = hasPlan && state !== "RECEIVED" && state !== "CONTEXT_ASSEMBLED" && state !== "BLOCKED";
  // These states' words offer undo, which is on the task's web page and not on a project.
  const projectOpens = !UNDO_IS_THE_NEXT_STEP.has(state);
  const native = (target === "plan" && planOpens) || target === "run" || (target === "project" && projectOpens) || (target === "change" && hasChange);
  return {
    tone: step.tone,
    title: step.title,
    // The app can't start a run on an approved plan yet, so it says where that happens rather than "just below".
    body: approvedWithNoRun ? "Start the agent on the web, where you can see why it hasn't started." : step.body,
    action: step.action ? { label: native ? step.action.label : "Open on the web", target: native ? step.action.target : "web" } : null,
  };
}

/** A task's story: its next step, its lifecycle, every transition, the change and its evidence, and its runs. */
export async function taskView(ctx: AppContext, orgId: string, taskId: string, runs: RunReader, execution: { mode: string }, now: Date) {
  const reader = ctx.reader;
  const found = await reader.getTask(orgId, taskId);
  if (!found) return null;
  const [proposal, contract, proofs, verification, taskRuns, project] = await Promise.all([
    reader.getLatestProposal(orgId, taskId),
    reader.getContract(orgId, taskId),
    reader.listProofPacks(orgId, taskId),
    reader.getLatestVerification(orgId, taskId),
    runs.list({ taskId, limit: 5 }),
    reader.getProject(orgId, found.task.projectId),
  ]);
  const state = found.task.state;
  const hasChange = proposal?.status === "pending" || proposal?.status === "blocked";
  const liveRun = taskRuns.find((r) => isLive(r.status));
  // The sample is a tour of what people see, so its read-only state doesn't change the words (as on the web's demo).
  const tour = ctx.mode === "demo";
  // As on the web: nothing in an archived project can change, so it's nobody's turn.
  const canChange = ctx.role !== null && CONTRIBUTOR_ROLES.includes(ctx.role) && ctx.writes.enabled && !project?.archivedAt;
  const manager = ctx.role !== null && MANAGER_ROLES.includes(ctx.role);
  const canBuild = false;
  const nextStep = phoneNextStep(
    taskNextStep({
      state,
      hasChange,
      changeExpired: proposal?.status === "pending" && approvalWindow(proposal.createdAt, proposal.expiresAt, now).state === "expired",
      canApprove: tour || (canChange && ctx.permissions.approve !== false && (proposal?.policy?.outcome !== "ESCALATE" || manager)),
      canAct: tour || canChange,
      run: liveRun ? (liveRun.status === "waiting" ? "waiting" : "working") : "none",
      fix: "none",
      canBuild,
      sandboxed: execution.mode === "sandboxed",
      checking: verification?.status === "running",
      checks: contract?.body.requiredChecks.length ?? 0,
      // Neither is in the app yet, so it doesn't offer them.
      canFix: false,
      canUndo: false,
    }),
    { state, hasChange, hasPlan: contract !== null, approvedWithNoRun: state === "CONTRACT_APPROVED" && !liveRun && !canBuild },
  );
  return {
    task: taskItem(found.task),
    nextStep,
    stages: lifecycleProgress(found.task.state, found.history).map((s) => ({ key: s.key, label: s.label, status: s.status, note: s.note })),
    history: found.history.map((h) => ({ id: h.eventId, from: h.from, to: h.to, toLabel: TASK_STATE_LABELS[h.to], actor: h.actorKind, at: h.at })),
    contract: contract ? { version: contract.version, status: contract.status, outcome: contract.body.outcome } : null,
    proposal: proposal ? { id: proposal.id, status: proposal.status, files: proposal.changes.length, sha256: proposal.sha256, expiresAt: proposal.expiresAt } : null,
    proofs: proofs.slice(0, 5).map((p) => ({ digest: p.digest, status: p.status, createdAt: p.createdAt })),
    verification: verification ? { status: verification.status, result: verification.result, failure: verification.failure, startedAt: verification.startedAt, finishedAt: verification.finishedAt } : null,
    runs: taskRuns.map(runItem),
  };
}

/** The plan a person approves before the agent starts: the contract's exact version and hash. */
export async function planView(ctx: AppContext, orgId: string, taskId: string) {
  const found = await ctx.reader.getTask(orgId, taskId);
  if (!found) return null;
  const [contract, project] = await Promise.all([ctx.reader.getContract(orgId, taskId), ctx.reader.getProject(orgId, found.task.projectId)]);
  const approvable = found.task.state === "CONTRACT_DRAFTED" && contract?.status === "draft";
  const blockers = [!ctx.writes.enabled ? ctx.writes.reason : null, project?.archivedAt ? ARCHIVED_REASON : null, contract ? null : "There's no plan yet. Open the task on the web to write one.", contract && !approvable ? "This plan isn't waiting for approval." : null, ctx.permissions.run_agents === false ? "An owner or admin turned off running agents for you in this workspace." : null].filter(
    (r): r is string => r !== null,
  );
  return {
    task: { ...taskItem(found.task), version: found.task.version },
    plan: contract
      ? {
          version: contract.version,
          status: contract.status,
          sha256: contract.sha256,
          outcome: contract.body.outcome,
          files: contract.body.scope.resources,
          allowed: contract.body.allowedOperations,
          forbidden: contract.body.forbiddenOperations,
          criteria: contract.body.acceptanceCriteria.map((c) => ({ id: c.id, statement: c.statement, verification: c.verification })),
          checks: contract.body.requiredChecks,
          assumptions: contract.body.assumptions,
          questions: contract.body.openQuestions,
          recovery: contract.body.recovery,
        }
      : null,
    canApprove: blockers.length === 0,
    approveReason: blockers[0] ?? null,
  };
}

const clip = (s: unknown, max: number) => {
  const text = typeof s === "string" ? s : "";
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
};

/** One stored run event as a step the phone lists. */
export function runStep(e: RunEventView) {
  const p = e.payload;
  switch (e.kind) {
    case "model":
      return { id: e.id, kind: e.kind, title: "Thinking", detail: clip(p.text, 600), at: e.at };
    case "tool":
      return { id: e.id, kind: e.kind, title: [p.tool, p.target].filter((x) => typeof x === "string" && x).join(" "), detail: clip(p.detail, 400), status: typeof p.status === "string" ? p.status : null, at: e.at };
    case "command":
      return { id: e.id, kind: e.kind, title: clip(p.command, 200), detail: clip(p.output, 800), exitCode: typeof p.exitCode === "number" ? p.exitCode : null, at: e.at };
    case "approval":
      return { id: e.id, kind: e.kind, title: clip(p.display, 200), detail: clip(p.reason ?? p.why, 400), at: e.at };
    default:
      return { id: e.id, kind: e.kind, title: clip(p.text, 400), detail: "", at: e.at };
  }
}

/** A run and its steps after a cursor; `question` is set while the agent waits on this person's answer. */
export async function runDetail(runs: RunReader, runId: string, after: number, viewer: { userId: string; manager: boolean }) {
  const run = await runs.get(runId);
  if (!run) return null;
  const events = await runs.events(runId, after);
  // Nothing new since the cursor: the newest event is the one at the cursor itself.
  const last = events.at(-1) ?? (after > 0 ? (await runs.events(runId, after - 1))[0] : undefined);
  const waiting: RunStatus = "waiting";
  const question =
    run.status === waiting && last?.kind === "approval"
      ? {
          requestId: String(last.payload.requestId ?? ""),
          bindingHash: String(last.payload.bindingHash ?? ""),
          display: clip(last.payload.display, 300),
          risk: typeof last.payload.risk === "string" ? last.payload.risk : null,
          reason: clip(last.payload.reason, 400),
          why: clip(last.payload.why, 400),
          canAnswer: run.startedBy === viewer.userId || viewer.manager,
        }
      : null;
  return { run: runItem(run), steps: events.map(runStep), cursor: events.at(-1)?.id ?? after, question, finish: run.finish };
}

export async function projectsView(reader: WorkspaceReader, orgId: string) {
  return { items: (await reader.listProjects(orgId)).map(projectItem) };
}

/** A project in the app (ADR 0173): its tasks, newest first, and where it's live, if it is. */
export async function projectView(reader: WorkspaceReader, orgId: string, projectId: string, liveAddress: ((projectId: string) => Promise<string | null>) | undefined) {
  const project = await reader.getProject(orgId, projectId);
  if (!project) return null;
  const [tasks, address] = await Promise.all([reader.listTasks(orgId, { projectId, limit: 40 }), liveAddress ? liveAddress(projectId).catch(() => null) : Promise.resolve(null)]);
  return { project: projectItem(project), tasks: tasks.map(taskItem), address };
}
