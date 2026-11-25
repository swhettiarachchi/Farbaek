/**
 * All work (stage 276, ADR 0283): everything Farbaek is doing for a person, in one list sorted by what it needs from them. The
 * agent's builds, changes waiting for a yes or no, workflows, scheduled tasks and agents each had a page of their own; this puts
 * them side by side under four headings: needs you, in progress, scheduled, finished. Framework-free and tested: the page only
 * draws what this returns.
 */
import { RUN_STATUS_LABELS, type RunStatus } from "../agent/cloud-run";
import { laneSummary, type InboxLane, type ProposalState } from "../agent/inbox";
import { AGENTS_HREF, SCHEDULED_HREF, endedRuns, scheduledOnHome, type HomeRun, type HomeTask } from "../automation/home";
import type { WaitingChanges } from "../realityloop/needs-you";

/** One of the status kinds the app draws (ADR 0183), by name: the page maps it to the badge. */
export type BoardStatus = "approval" | "working" | "pending" | "paused" | "attention" | "done" | "failed" | "off";
export type BoardKind = "build" | "change" | "workflow" | "task" | "agent";

export interface BoardItem {
  /** Its own within the board: the kind and the thing's id. */
  id: string;
  kind: BoardKind;
  title: string;
  /** Where it stands, in a sentence. */
  line: string;
  status: BoardStatus;
  label: string;
  href: string;
  /** What pressing it does, in a word or two. */
  action: string;
  /** When it started, ended or runs next. */
  at: string | null;
  /** How `at` reads: a time that has been, or the time it runs next. */
  when: "past" | "next" | null;
}

/** An agent's build run, with its change's state when it made one. */
export interface BoardRun {
  id: string;
  taskId: string;
  taskTitle: string;
  projectName: string;
  status: RunStatus;
  steps: number;
  outcome: string | null;
  finish: { summary: string } | null;
  /** The state of the change it made, when it made one. */
  changeState: ProposalState | null;
  startedAt: string;
  endedAt: string | null;
}

export interface BoardWorkflow {
  id: string;
  title: string;
  status: "draft" | "approved" | "running" | "waiting" | "halted" | "finished" | "cancelled";
  /** Why it waits: at a checkpoint for someone to continue it, or for a step's change to be reviewed. */
  waitingReason: "checkpoint" | "review" | null;
  /** What happens next, in a sentence (`nextAction`). */
  next: string;
  /** The runs its steps have made: those builds are the workflow's own, said once, by the workflow. */
  stepRunIds: readonly string[];
  /** The tasks of its steps whose change waits for review. */
  waitingTaskIds: readonly string[];
  /** A draft whose every step has an approved plan: an owner or admin approves it to start it. */
  readyToApprove?: boolean;
}

export interface BoardFacts {
  /** The agent's recent builds by lane; null when they couldn't be read or the workspace has none to read. */
  lanes: Record<InboxLane, BoardRun[]> | null;
  /** Builds waiting on a question only someone else may answer (whoever started the run, or an owner or admin). */
  waitingOnOthers?: readonly BoardRun[];
  changes: WaitingChanges;
  scheduled: { tasks: readonly HomeTask[]; runs: readonly HomeRun[] | null };
  workflows: readonly BoardWorkflow[];
  /**
   * Whether this person may act on work here at all: a viewer, or anyone while changes are off, may not. For them nothing is
   * "waiting for you": what would need them is listed where it stands, and said as waiting on someone else. Missing: they may.
   */
  canAct?: boolean;
  /** Whether this person is an owner or admin here, who approves a workflow to start it. Missing: they aren't. */
  canApproveWorkflows?: boolean;
  now: Date;
}

export interface Board {
  needsYou: BoardItem[];
  working: BoardItem[];
  scheduled: BoardItem[];
  /** The latest few that ended, newest first. */
  finished: BoardItem[];
  /** Changes waiting for someone else's yes or no: said, not listed. */
  others: number;
}

/** How many finished things the board lists. Each kind's own page has the rest. */
export const FINISHED_SHOWN = 8;

const DONE_STATUS: Record<RunStatus, { status: BoardStatus; label: string }> = {
  starting: { status: "working", label: RUN_STATUS_LABELS.starting },
  working: { status: "working", label: RUN_STATUS_LABELS.working },
  waiting: { status: "approval", label: RUN_STATUS_LABELS.waiting },
  finished: { status: "done", label: RUN_STATUS_LABELS.finished },
  failed: { status: "failed", label: RUN_STATUS_LABELS.failed },
  cancelled: { status: "off", label: RUN_STATUS_LABELS.cancelled },
  interrupted: { status: "off", label: RUN_STATUS_LABELS.interrupted },
};

const RAN: Record<"done" | "failed" | "skipped", { status: BoardStatus; label: string }> = {
  done: { status: "done", label: "Ran" },
  failed: { status: "failed", label: "Didn't finish" },
  skipped: { status: "off", label: "Skipped" },
};

const SOMEONE_ELSE = "Waiting for someone else";
const time = (iso: string | null): number => (iso ? Date.parse(iso) : Number.NaN);

export function buildBoard({ lanes, waitingOnOthers = [], changes, scheduled, workflows, canAct = true, canApproveWorkflows = false, now }: BoardFacts): Board {
  const build = (lane: InboxLane, r: BoardRun, more: Pick<BoardItem, "status" | "label" | "action" | "at">): BoardItem => ({
    id: `build:${r.id}`,
    kind: "build",
    title: r.taskTitle,
    line: `${r.projectName}. ${laneSummary(lane, r, r.changeState)}`,
    href: `/app/build/${r.id}`,
    when: more.at ? "past" : null,
    ...more,
  });
  const flow = (w: BoardWorkflow, more: Pick<BoardItem, "status" | "label">): BoardItem => ({ id: `workflow:${w.id}`, kind: "workflow", title: w.title, line: w.next, href: `/app/workflows/${w.id}`, action: "Open", at: null, when: null, ...more });
  const kindOf = (href: string): BoardKind => (href === AGENTS_HREF ? "agent" : "task");

  // Each thing is said once.
  //   - A change waiting for this person is the change: not also the run that made it, nor the workflow whose step it is.
  //   - A build a running workflow started is the workflow's: the workflow says which step is being worked on.
  const mine = new Set(changes.mine.map((c) => c.id));
  const moving = workflows.filter((w) => w.status === "running" || w.status === "approved");
  const ofMoving = new Set(moving.flatMap((w) => w.stepRunIds));
  const home = scheduledOnHome(scheduled.tasks, scheduled.runs, now, Number.POSITIVE_INFINITY);
  const rows = home?.rows ?? [];
  // Work Farbaek paused is this person's to look at while the pause is new, as on Home (ADR 0281): a pause they can't or won't
  // undo (a plan that allows fewer) mustn't sit under "Needs you" for good. After that it is listed with the scheduled work.
  const fresh = new Set((home?.stopped ?? []).map((s) => s.id));
  const pausedByFarbaek = rows.filter((r) => r.kind === "stopped").map((r) => ({ recent: fresh.has(r.id), item: { id: `${kindOf(r.href)}:${r.id}`, kind: kindOf(r.href), title: r.title, line: r.line, status: "attention", label: "Paused by Farbaek", href: r.href, action: "See it", at: null, when: null } satisfies BoardItem }));
  const stopped = pausedByFarbaek.filter((p) => canAct && p.recent).map((p) => p.item);
  const stoppedBefore = pausedByFarbaek.filter((p) => !(canAct && p.recent)).map((p) => p.item);

  // A workflow that has stopped for a person: theirs to continue at a checkpoint or to look at when it halted. One waiting for a
  // step's change to be reviewed is that change's row when the change is this person's to decide; otherwise it waits on someone.
  const held = workflows.filter((w) => w.status === "waiting" || w.status === "halted");
  const ownTurn = (w: BoardWorkflow) => canAct && (w.status === "halted" || w.waitingReason !== "review");
  const asChange = (w: BoardWorkflow) => w.status === "waiting" && w.waitingReason === "review" && w.waitingTaskIds.some((id) => mine.has(id));
  // A build whose change the plan's checks stopped: someone who can act should look. One whose change waits for a yes or no is
  // that change's row when it is this person's (waiting, or run out of time), and is counted in `others` when it is someone
  // else's: it is never listed a second time as the run.
  const expired = new Set(changes.expired.map((c) => c.id));
  const blocked = (lanes?.review ?? []).filter((r) => !mine.has(r.taskId) && !expired.has(r.taskId) && r.changeState === "blocked");
  // A draft with every plan approved waits for an owner or admin to start it.
  const toApprove = canAct && canApproveWorkflows ? workflows.filter((w) => w.status === "draft" && w.readyToApprove === true) : [];

  const needsYou: BoardItem[] = [
    // A question comes first: the agent has stopped until someone answers it.
    ...(lanes?.needs_you ?? []).map((r) => build("needs_you", r, { status: "approval", label: "Waiting for you", action: "Answer", at: r.startedAt })),
    ...changes.mine.map(
      (c): BoardItem => ({ id: `change:${c.id}`, kind: "change", title: c.title, line: "A change is waiting for your yes or no. Nothing goes into your project until you approve it.", status: "approval", label: "Waiting for you", href: `/app/tasks/${c.id}`, action: "Review", at: null, when: null }),
    ),
    ...(canAct ? blocked.map((r) => build("review", r, { status: "attention", label: "Stopped by a check", action: "Open", at: r.endedAt })) : []),
    ...held.filter(ownTurn).map((w) => flow(w, w.status === "halted" ? { status: "attention", label: "Stopped" } : { status: "approval", label: "Waiting for you" })),
    ...toApprove.map((w) => flow(w, { status: "approval", label: "Ready to approve" })),
    ...stopped,
    // Nothing here is lost by waiting, so it comes last.
    ...changes.expired.map(
      (c): BoardItem => ({ id: `change:${c.id}`, kind: "change", title: c.title, line: "This change ran out of time and can't be approved now. Discard it, and ask the agent to try again.", status: "attention", label: "Ran out of time", href: `/app/tasks/${c.id}`, action: "Open", at: null, when: null }),
    ),
  ];

  const working: BoardItem[] = [
    ...(lanes?.working ?? []).filter((r) => !ofMoving.has(r.id)).map((r) => build("working", r, { status: "working", label: RUN_STATUS_LABELS[r.status === "starting" ? "starting" : "working"], action: "Watch", at: r.startedAt })),
    // Stopped on a question that isn't this person's to answer: still under way for them, and said as waiting on someone else.
    ...waitingOnOthers.map((r): BoardItem => ({ ...build("needs_you", r, { status: "pending", label: SOMEONE_ELSE, action: "Open", at: r.startedAt }), line: `${r.projectName}. Waiting for whoever started it, or an owner or admin, to approve a command.` })),
    ...moving.map((w) => flow(w, { status: "working", label: "Working" })),
    // Held for a person who isn't this one: said as that, where it stands.
    ...held.filter((w) => !ownTurn(w) && !asChange(w)).map((w) => flow(w, w.status === "halted" ? { status: "attention", label: "Stopped" } : { status: "pending", label: SOMEONE_ELSE })),
    ...(canAct ? [] : blocked.map((r) => build("review", r, { status: "attention", label: "Stopped by a check", action: "Open", at: r.endedAt }))),
    ...rows
      .filter((r) => r.kind === "next" && (r.when === "running" || r.when === "due"))
      .map((r): BoardItem => ({ id: `${kindOf(r.href)}:${r.id}`, kind: kindOf(r.href), title: r.title, line: r.line, status: r.when === "running" ? "working" : "pending", label: r.when === "running" ? "Running now" : "Due now", href: r.href, action: "See it", at: null, when: null })),
  ];

  const waiting: BoardItem[] = [
    ...rows
      .filter((r) => r.kind === "next" && r.when !== "running" && r.when !== "due")
      .map((r): BoardItem => ({ id: `${kindOf(r.href)}:${r.id}`, kind: kindOf(r.href), title: r.title, line: r.line, status: "pending", label: "Scheduled", href: r.href, action: "See it", at: r.nextRunAt, when: r.nextRunAt ? "next" : null })),
    ...rows
      .filter((r) => r.kind === "paused")
      .map((r): BoardItem => ({ id: `${kindOf(r.href)}:${r.id}`, kind: kindOf(r.href), title: r.title, line: r.line, status: "paused", label: "Paused", href: r.href, action: "See it", at: null, when: null })),
    // Their own work that Farbaek paused a while ago, or that they can't resume now: listed where it stands, not as their turn.
    ...stoppedBefore,
  ];

  const finished: BoardItem[] = [
    ...(lanes?.done ?? []).map((r) => build("done", r, { ...DONE_STATUS[r.status], action: "Open", at: r.endedAt ?? r.startedAt })),
    ...endedRuns(scheduled.tasks, scheduled.runs).map((r, i): BoardItem => {
      const home = r.agent ? AGENTS_HREF : SCHEDULED_HREF;
      return {
        // A task ends many runs: each is its own row.
        id: `${r.agent ? "agent" : "task"}:${r.taskId}:${r.at}:${i}`,
        kind: r.agent ? "agent" : "task",
        title: r.title,
        // What the run itself said, when it said something: an agent's note of what it did, or why a run didn't finish.
        line: r.said ?? (r.agent ? "An agent's run." : "A scheduled run."),
        ...RAN[r.status],
        href: r.conversationId ? `/app/chat/${r.conversationId}` : home,
        action: r.conversationId ? "Read the answer" : "See it",
        at: r.at,
        when: "past",
      };
    }),
  ]
    // Newest first; one with a time that can't be read goes last.
    .sort((a, b) => (Number.isNaN(time(b.at)) ? -Infinity : time(b.at)) - (Number.isNaN(time(a.at)) ? -Infinity : time(a.at)))
    .slice(0, FINISHED_SHOWN);

  return { needsYou, working, scheduled: waiting, finished, others: changes.others };
}

const count = (n: number, one: string, many: string) => (n === 1 ? one : many.replace("N", String(n)));

/** The board in a sentence or two, said before the lists: the numbers are the lists' own. */
export function boardSentence(board: Pick<Board, "needsYou" | "working" | "scheduled">): string {
  const needs = board.needsYou.length === 0 ? "Nothing needs you." : count(board.needsYou.length, "One thing needs you.", "N things need you.");
  const doing = board.working.length === 0 ? "Nothing is in progress" : count(board.working.length, "One thing is in progress", "N things are in progress");
  const later = board.scheduled.length === 0 ? "nothing is scheduled" : count(board.scheduled.length, "one is scheduled", "N are scheduled");
  return `${needs} ${doing}, and ${later}.`;
}
