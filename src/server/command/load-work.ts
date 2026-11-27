import "server-only";
import { groupInbox, type InboxLane } from "@/core/agent/inbox";
import { buildBoard, type Board, type BoardRun, type BoardWorkflow } from "@/core/command/board";
import { nextAction, unapprovedSteps } from "@/core/realityloop/workflow";
import { loadScheduledWork } from "@/server/automation/work";
import { loadInbox } from "@/server/cloud-agent/inbox";
import type { RunView } from "@/server/cloud-agent/store";
import type { AppContext } from "@/server/workspace/context";
import { RESUME_MANAGERS_ONLY } from "@/server/workspace/incidents";
import { CONTRIBUTOR_ROLES, MANAGER_ROLES } from "@/server/workspace/types";
import { loadUsageSummary } from "@/server/workspace/usage-summary";
import { waitingChanges } from "@/server/workspace/waiting-changes";

/** How many of the agent's latest builds are read: the live ones, and the latest that ended. */
export const RUNS_READ = 40;

export type WorkContext = AppContext & { current: NonNullable<AppContext["current"]> };

export interface LoadedWork {
  /** Everything Farbaek is doing for this person, sorted by tested code (`buildBoard`). */
  board: Board;
  /** What couldn't be read. A list that is known to be short is said as that, never summed up as if it were whole. */
  unread: { builds: boolean; workflows: boolean; tasks: boolean; runs: boolean; any: boolean };
  /** Something is live now and worth reading again every few seconds: a build under way or stopped on a question, a scheduled run. */
  liveNow: boolean;
  /** Whether this person may act on work here at all: a viewer, or anyone while changes are off, may not. */
  canAct: boolean;
  manager: boolean;
  contributor: boolean;
  /** The demo workspace: its sample tasks and sample scheduled work. */
  tour: boolean;
  live: boolean;
}

/**
 * The reads behind the All work page (stage 276, ADR 0283) and the assistant's answer to "what needs me?" (stage 290,
 * ADR 0298): the same reads Home, Approvals, Workflows and Scheduled make, as the signed-in person, and who may act. Both
 * draw the one board this returns, so the page and the answer can't disagree.
 */
export async function loadWork(ctx: WorkContext, now: Date): Promise<LoadedWork> {
  const ws = ctx.current;
  const live = ctx.mode === "live";
  const tour = ctx.mode === "demo";
  const [usage, inbox, flows, scheduled] = await Promise.all([
    loadUsageSummary(ctx, ws),
    live ? loadInbox(ws.id, RUNS_READ) : Promise.resolve(null),
    // Unreadable workflows are said as that: never as "none".
    ctx.reader.listWorkflows(ws.id).catch(() => null),
    loadScheduledWork(ctx.mode, ws.id, 60),
  ]);
  const { tasks, projects } = usage;
  // Nothing in an archived project can change, so it never asks for anyone's turn and isn't work in progress.
  const archived = new Set(projects.filter((p) => p.archivedAt).map((p) => p.id));
  const manager = ctx.role !== null && MANAGER_ROLES.includes(ctx.role);
  const contributor = ctx.role !== null && CONTRIBUTOR_ROLES.includes(ctx.role);
  const waiting = await waitingChanges(ctx.reader, { orgId: ws.id, tasks, archivedProjects: archived, role: ctx.role, permissions: ctx.permissions, tour }, now);
  // A viewer, or anyone while changes are off, can't act on work here: nothing is said to be waiting for them.
  const canAct = tour || (ctx.writes.enabled && contributor);
  const changes = canAct ? waiting : { mine: [], expired: [], others: waiting.others + waiting.mine.length };

  const asRun = (r: RunView): BoardRun => ({
    id: r.id,
    taskId: r.taskId,
    taskTitle: r.taskTitle,
    projectName: r.projectName,
    status: r.status,
    steps: r.steps,
    outcome: r.outcome,
    finish: r.finish,
    changeState: r.proposalId ? (inbox?.proposals.get(r.proposalId) ?? "other") : null,
    startedAt: r.startedAt,
    endedAt: r.endedAt,
  });
  const grouped = inbox ? groupInbox(inbox.runs.filter((r) => !archived.has(r.projectId)), inbox.proposals, 8) : null;
  // Only the person who started a run, or an owner or admin, can answer its question, and only while changes are on: for
  // anyone else it is waiting on someone.
  const mayAnswer = (r: RunView) => canAct && (manager || r.startedBy === ctx.user.id);
  const lanes: Record<InboxLane, BoardRun[]> | null = grouped
    ? { needs_you: grouped.needs_you.filter(mayAnswer).map(asRun), working: grouped.working.map(asRun), review: grouped.review.map(asRun), done: grouped.done.map(asRun) }
    : null;
  const workflows: BoardWorkflow[] = (flows ?? [])
    .filter((w) => !archived.has(w.projectId))
    .map((w) => ({
      id: w.id,
      title: w.title,
      status: w.status,
      waitingReason: w.waitingReason,
      next: nextAction(w),
      stepRunIds: w.steps.flatMap((s) => (s.runId ? [s.runId] : [])),
      waitingTaskIds: w.steps.filter((s) => s.status === "waiting").map((s) => s.taskId),
      readyToApprove: w.status === "draft" && w.steps.length > 0 && unapprovedSteps(w).length === 0,
    }));
  const board = buildBoard({ lanes, waitingOnOthers: grouped ? grouped.needs_you.filter((r) => !mayAnswer(r)).map(asRun) : [], changes, scheduled: { tasks: scheduled.tasks ?? [], runs: scheduled.runs }, workflows, canAct, canApproveWorkflows: manager, now });
  const unread = { builds: live && inbox === null, workflows: flows === null, tasks: scheduled.tasks === null, runs: scheduled.runs === null };
  return {
    board,
    // Runs that couldn't be read leave the lists whole but for "just finished", which says so itself.
    unread: { ...unread, any: unread.builds || unread.workflows || unread.tasks },
    liveNow: (grouped ? grouped.working.length + grouped.needs_you.length > 0 : false) || board.working.some((i) => (i.kind === "task" || i.kind === "agent") && i.status === "working"),
    canAct,
    manager,
    contributor,
    tour,
    live,
  };
}

/** Why this person can't pause, or can't resume, here; null where they can. The server refuses either way: this is what the button says. */
export function pauseReasons(work: Pick<LoadedWork, "tour" | "manager" | "contributor">): { pauseReason: string | null; resumeReason: string | null } {
  const readOnly = work.tour ? "The demo workspace is read-only." : null;
  return {
    pauseReason: readOnly ?? (work.contributor ? null : "Viewers can't pause agents. Ask someone who contributes to this workspace."),
    resumeReason: readOnly ?? (work.manager ? null : RESUME_MANAGERS_ONLY),
  };
}
