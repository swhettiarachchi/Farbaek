import { CalendarCheckIcon, CheckCircleIcon, PauseCircleIcon, PlayCircleIcon, UserFocusIcon } from "@/components/icons";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LiveRefresh } from "@/components/app/live-refresh";
import { Card, CardTitle, Notice, PageHeader } from "@/components/app/primitives";
import { BoardList } from "@/components/command/board-list";
import { PauseControl } from "@/components/incidents/pause-control";
import { PAGE_STACK } from "@/components/ui/surfaces";
import { groupInbox, type InboxLane } from "@/core/agent/inbox";
import { boardSentence, buildBoard, type BoardRun, type BoardWorkflow } from "@/core/command/board";
import { nextAction, unapprovedSteps } from "@/core/realityloop/workflow";
import { loadScheduledWork } from "@/server/automation/work";
import { loadInbox } from "@/server/cloud-agent/inbox";
import type { RunView } from "@/server/cloud-agent/store";
import { loadAppContext } from "@/server/workspace/context";
import { RESUME_MANAGERS_ONLY } from "@/server/workspace/incidents";
import { CONTRIBUTOR_ROLES, MANAGER_ROLES } from "@/server/workspace/types";
import { loadUsageSummary } from "@/server/workspace/usage-summary";
import { waitingChanges } from "@/server/workspace/waiting-changes";

export const metadata: Metadata = { title: "All work" };

/** How many of the agent's latest builds the page reads: the live ones, and the latest that ended. */
const RUNS_READ = 40;

/**
 * All work (stage 276, ADR 0283): everything Farbaek is doing for this person in one place, sorted by what it needs from them, with
 * the workspace's one pause. Each row opens the page that owns it; nothing is changed here but the pause. This page reads (the
 * same reads Home, Approvals, Workflows and Scheduled make) and says who may act; which list each thing goes in is worked out by
 * tested code (`core/command/board.ts`).
 */
export default async function AllWorkPage() {
  const ctx = await loadAppContext();
  if (!ctx?.current) notFound();
  const ws = ctx.current;
  const live = ctx.mode === "live";
  const tour = ctx.mode === "demo";
  const now = new Date();
  const [usage, inbox, flows, scheduled] = await Promise.all([
    loadUsageSummary(ctx, ws),
    live ? loadInbox(ws.id, RUNS_READ) : Promise.resolve(null),
    // Unreadable workflows are said as that below: never as "none".
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
  // What couldn't be read is said as missing, and then the page doesn't sum up lists it knows are incomplete.
  const unread = (live && inbox === null) || flows === null || scheduled.tasks === null;

  const board = buildBoard({ lanes, waitingOnOthers: grouped ? grouped.needs_you.filter((r) => !mayAnswer(r)).map(asRun) : [], changes, scheduled: { tasks: scheduled.tasks ?? [], runs: scheduled.runs }, workflows, canAct, canApproveWorkflows: manager, now });
  const readOnly = tour ? "The demo workspace is read-only." : null;
  const others =
    board.others === 0
      ? null
      : canAct
        ? `${board.others === 1 ? "One more change is" : `${board.others} more changes are`} waiting for someone else's yes or no. You can read them in Approvals.`
        : `${board.others === 1 ? "One change is" : `${board.others} changes are`} waiting for a yes or no. You can read them in Approvals.`;
  // Only what is live now is worth reading again every few seconds: a build under way or stopped on a question, a scheduled run.
  const liveNow = (grouped ? grouped.working.length + grouped.needs_you.length > 0 : false) || board.working.some((i) => (i.kind === "task" || i.kind === "agent") && i.status === "working");

  return (
    <div className={`${PAGE_STACK} max-w-4xl`}>
      <PageHeader title="All work" description="Everything Farbaek is doing for you, in one place: what needs you, what is in progress, what is scheduled and what just finished." />

      <p className="text-body leading-relaxed text-ink-2">
        {unread ? "Some of this couldn't be read just now, so the lists below are incomplete." : boardSentence(board)}{" "}
        <Link href="#pause" className="font-medium text-accent hover:underline">
          {ws.agentsPaused ? "Agents are paused" : "Pause everything"}
        </Link>
      </p>

      {tour ? <Notice>The demo workspace has no agent builds to show: these are its sample tasks and sample scheduled work.</Notice> : null}
      {live && inbox === null ? <Notice tone="warning">The agent&apos;s builds couldn&apos;t be read just now, so they are missing from this page. Reload to try again.</Notice> : null}
      {flows === null ? <Notice tone="warning">Workflows couldn&apos;t be read just now, so they are missing from this page. Reload to try again.</Notice> : null}
      {scheduled.tasks === null ? <Notice tone="warning">Your scheduled tasks and agents couldn&apos;t be read just now, so they are missing from this page. Reload to try again.</Notice> : null}

      <BoardList id="work-needs-you" icon={UserFocusIcon} title="Needs you" items={board.needsYou} empty="Nothing is waiting for you." note={others} />
      <BoardList id="work-in-progress" icon={PlayCircleIcon} title="In progress" items={board.working} empty="Nothing is running right now." />
      <BoardList id="work-scheduled" icon={CalendarCheckIcon} title="Scheduled" items={board.scheduled} empty={scheduled.tasks === null ? "Your scheduled work couldn't be read just now." : "Nothing is scheduled. Tell Farbaek what to do and when on the Scheduled page, or ask for it in Chat."} />
      <BoardList
        id="work-finished"
        icon={CheckCircleIcon}
        title="Just finished"
        items={board.finished}
        empty="Nothing has finished yet."
        note={scheduled.runs === null ? "The runs of your scheduled work couldn't be read just now, so they are missing here." : board.finished.length > 0 ? "The latest few. Build, History and Scheduled have the rest." : null}
      />

      <Card id="pause" className="scroll-mt-24">
        <CardTitle icon={PauseCircleIcon}>Pause everything</CardTitle>
        <p className="mt-1 text-sm text-ink-2">
          One pause for all of it: no new build, workflow step or scheduled run starts until an owner or admin resumes agents. A build under way is stopped at once, and a workflow with a step under way stops and has to be started again. A scheduled run already under way finishes.
        </p>
        <div className="mt-4">
          <PauseControl
            paused={ws.agentsPaused}
            pauseReason={readOnly ?? (contributor ? null : "Viewers can't pause agents. Ask someone who contributes to this workspace.")}
            resumeReason={readOnly ?? (manager ? null : RESUME_MANAGERS_ONLY)}
          />
        </div>
      </Card>

      <p className="text-sm leading-relaxed text-ink-3">
        Each kind of work has its own page:{" "}
        <Link href="/app/build" className="font-medium text-accent hover:underline">
          Build
        </Link>
        ,{" "}
        <Link href="/app/approvals" className="font-medium text-accent hover:underline">
          Approvals
        </Link>
        ,{" "}
        <Link href="/app/workflows" className="font-medium text-accent hover:underline">
          Workflows
        </Link>{" "}
        and{" "}
        <Link href="/app/scheduled" className="font-medium text-accent hover:underline">
          Scheduled
        </Link>
        .
      </p>
      <LiveRefresh active={live && liveNow} />
    </div>
  );
}
