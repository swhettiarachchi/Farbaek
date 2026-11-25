import { approvalWindow } from "@/core/trust/approval-wallet";

/**
 * The one thing Home leads with when something is waiting on a person (ADR 0174). A task's state isn't enough to say so:
 * the change behind it decides, as it does on the task's page and in Approvals, and so does who's looking.
 */

/** What this person may do here. */
export interface NeedsYouPerson {
  /** May work on tasks at all, which includes discarding a change that ran out of time. */
  canAct: boolean;
  /** May approve an ordinary change. */
  canApprove: boolean;
  /** May approve a change the rules send to an owner or admin. */
  canApproveEscalated: boolean;
}

export interface WaitingTask {
  id: string;
  title: string;
  /** The task's latest change, or null when there's none on record. */
  change: { status: string; createdAt: string; expiresAt: string | null; escalated: boolean } | null;
}

export interface WaitingChanges {
  /** Changes this person can say yes or no to now. */
  mine: { id: string; title: string }[];
  /** Changes that ran out of time, which this person can clear away. */
  expired: { id: string; title: string }[];
  /** How many open changes someone else has to decide. */
  others: number;
}

/** Sorts waiting tasks by what each one really needs. A task with no open change has nothing to say yes or no to, so it's left out. */
export function sortWaiting(tasks: readonly WaitingTask[], who: NeedsYouPerson, now: Date): WaitingChanges {
  const out: WaitingChanges = { mine: [], expired: [], others: 0 };
  for (const t of tasks) {
    if (t.change?.status !== "pending") continue;
    const task = { id: t.id, title: t.title };
    if (t.change.expiresAt && approvalWindow(t.change.createdAt, t.change.expiresAt, now).state === "expired") {
      if (who.canAct) out.expired.push(task);
    } else if (who.canApprove && (!t.change.escalated || who.canApproveEscalated)) {
      out.mine.push(task);
    } else {
      out.others += 1;
    }
  }
  return out;
}

/**
 * The order changes are listed in: what can still be decided first, soonest to close, so the one that needs someone isn't
 * buried under ones that ran out of time. Those come last, newest first.
 */
export function approvalsOrder<T extends { createdAt: string; expiresAt: string }>(cards: readonly T[], now: Date): T[] {
  const closed = (c: T) => approvalWindow(c.createdAt, c.expiresAt, now).state === "expired";
  return [...cards].sort((a, b) => {
    const [x, y] = [closed(a), closed(b)];
    if (x !== y) return x ? 1 : -1;
    return x ? b.expiresAt.localeCompare(a.expiresAt) : a.expiresAt.localeCompare(b.expiresAt);
  });
}

export interface NeedsYouFacts extends WaitingChanges {
  /** Runs stopped on a question this person is allowed to answer. */
  questions: readonly { id: string; taskTitle: string }[];
  /** The person's scheduled tasks that Farbaek paused itself in the last few days, each with why (stage 274). Missing: none. */
  scheduledStopped?: readonly { id: string; title: string; reason: string; agent?: boolean }[];
}

export interface NeedsYou {
  /** Whether it's this person's turn, or something they can only read about. */
  tone: "action" | "idle";
  title: string;
  body: string;
  action: { label: string; href: string } | null;
}

const isOrAre = (n: number) => (n === 1 ? "A change is" : `${n} changes are`);

export function needsYou({ questions, mine, expired, others, scheduledStopped = [] }: NeedsYouFacts): NeedsYou | null {
  // A question comes first: the agent has stopped until someone answers it.
  if (questions.length > 0) {
    const also = mine.length > 0 ? ` ${isOrAre(mine.length)} waiting for your yes or no too.` : "";
    if (questions.length === 1) {
      return {
        tone: "action",
        title: "The agent is waiting for you",
        body: `On "${questions[0]!.taskTitle}". It wants to run a command and needs your approval first.${also}`,
        action: { label: "Answer it", href: `/app/build/${questions[0]!.id}` },
      };
    }
    return {
      tone: "action",
      title: `The agent is waiting for you on ${questions.length} tasks`,
      body: `It wants to run commands and needs your approval first.${also}`,
      action: { label: "See them", href: "/app/build" },
    };
  }

  if (mine.length === 1) {
    return {
      tone: "action",
      title: "A change is waiting for your yes or no",
      body: mine[0]!.title,
      action: { label: "Review it", href: `/app/tasks/${mine[0]!.id}` },
    };
  }
  if (mine.length > 1) {
    return {
      tone: "action",
      title: `${mine.length} changes are waiting for your yes or no`,
      body: "Nothing goes into your project until you approve it.",
      action: { label: "See them", href: "/app/approvals" },
    };
  }

  // A scheduled task Farbaek paused has stopped running until the person looks: after their approvals, before what only expired.
  // An agent's work is listed on the Agents tab (stage 275), so that is where its link goes.
  if (scheduledStopped.length === 1) {
    const one = scheduledStopped[0]!;
    return {
      tone: "action",
      title: one.agent ? "An agent was paused" : "A scheduled task was paused",
      body: `"${one.title}". ${one.reason}`,
      action: { label: "See it", href: one.agent ? "/app/scheduled/agents" : "/app/scheduled" },
    };
  }
  if (scheduledStopped.length > 1) {
    const agents = scheduledStopped.filter((s) => s.agent).length;
    const all = scheduledStopped.length;
    return {
      tone: "action",
      title: agents === all ? `${all} agents were paused` : agents === 0 ? `${all} scheduled tasks were paused` : `${all} scheduled tasks and agents were paused`,
      body: agents > 0 && agents < all ? "Farbaek paused them, and each says why and what to do, on the Scheduled page and its Agents tab. They won't run while they're paused." : "Farbaek paused them, and each says why and what to do. They won't run while they're paused.",
      action: { label: "See them", href: agents === all ? "/app/scheduled/agents" : "/app/scheduled" },
    };
  }

  // Nothing here is lost by waiting, so it only leads when nothing else needs this person.
  if (expired.length === 1) {
    return {
      tone: "action",
      title: "A change ran out of time",
      body: `"${expired[0]!.title}" can't be approved now. Discard it, and ask the agent to try again.`,
      action: { label: "Open it", href: `/app/tasks/${expired[0]!.id}` },
    };
  }
  if (expired.length > 1) {
    return {
      tone: "action",
      title: `${expired.length} changes ran out of time`,
      body: "They can't be approved now. Discard them, and ask the agent to try again.",
      action: { label: "See them", href: "/app/approvals" },
    };
  }

  if (others > 0) {
    return {
      tone: "idle",
      title: `${isOrAre(others)} waiting for someone else's yes or no`,
      body: "You can read what's waiting in Approvals, but someone else decides.",
      action: null,
    };
  }
  return null;
}
