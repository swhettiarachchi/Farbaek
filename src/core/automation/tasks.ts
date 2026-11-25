/**
 * Scheduled tasks (stage 271, ADR 0278): what a person saves, what each plan allows, and the runner's rules for a run that doesn't
 * finish. A task is an instruction and a schedule; each run is one Chat turn made on the server as that person. The rules here are
 * shared by the screen, the server's actions and the runner, and no model is involved in any of them.
 */
import { z } from "zod";
import type { PlanId } from "../billing/catalog";
import { nextRun, scheduleSchema, shortestGapMinutes, type Schedule } from "./schedule";

export const TASK_LIMITS = { title: 80, instruction: 4000 } as const;

const line = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine((s) => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(s), "No control characters.");

export const taskOptionsSchema = z.object({
  /** Check the live web when the instruction needs it. */
  web: z.boolean(),
  effort: z.enum(["quick", "balanced", "thorough"]),
  /** Tell the person when a run finishes, by the ways they've switched on. */
  notify: z.boolean(),
});
export type TaskOptions = z.infer<typeof taskOptionsSchema>;
export const DEFAULT_OPTIONS: TaskOptions = { web: true, effort: "balanced", notify: true };

export const taskInputSchema = z.object({
  title: line(TASK_LIMITS.title),
  instruction: line(TASK_LIMITS.instruction),
  schedule: scheduleSchema,
  options: taskOptionsSchema,
});
export type TaskInput = z.infer<typeof taskInputSchema>;

/** A title for a task from its instruction, until the person gives one: its first words. */
export function titleFor(instruction: string): string {
  const s = instruction.replace(/\s+/g, " ").trim();
  // By whole characters: a cut through the middle of one (an emoji is two units) leaves something no database will store.
  const letters = Array.from(s);
  if (letters.length <= 60) return s || "Scheduled task";
  const cut = letters.slice(0, 60).join("");
  const space = cut.lastIndexOf(" ");
  return `${(space > 30 ? cut.slice(0, space) : cut).replace(/[,.;:!?-]+$/, "")}…`;
}

export interface ScheduledLimit {
  /** Tasks that may be active at once, for one person in a workspace. */
  active: number;
  /** Whether a task may run every hour; otherwise once a day at most. */
  hourly: boolean;
}

/**
 * What each plan allows. Every run also draws on the plan's AI usage as a Chat message does, which is what bounds the cost: these
 * limits bound how much can be left running unattended.
 */
export const SCHEDULED_LIMITS: Record<PlanId, ScheduledLimit> = {
  free: { active: 1, hourly: false },
  lite: { active: 2, hourly: false },
  lite_monthly: { active: 2, hourly: false },
  maker: { active: 3, hourly: false },
  maker_monthly: { active: 3, hourly: false },
  starter: { active: 5, hourly: false },
  plus: { active: 10, hourly: true },
  pro: { active: 20, hourly: true },
  studio: { active: 30, hourly: true },
  max: { active: 50, hourly: true },
  max_2x: { active: 75, hourly: true },
  max_3x: { active: 100, hourly: true },
  enterprise: { active: 100, hourly: true },
};

/** Why a schedule can't be saved on a plan, or null when it can. */
export function scheduleProblem(schedule: Schedule, limit: ScheduledLimit, now: Date, runsFinished = 0): string | null {
  if (!limit.hourly && shortestGapMinutes(schedule.repeat) < 1440) return "Your plan runs a task once a day at most. Choose a daily, weekly or monthly schedule, or a larger plan for hourly tasks.";
  if (nextRun(schedule, now, runsFinished) === null) return schedule.repeat.kind === "once" ? "That time has already passed. Choose a time ahead." : "That schedule has no run left: its end has already passed.";
  return null;
}

/** Tries at one due time: the first, then two more, 2 and 10 minutes later, for failures that may pass (a provider down, a timeout). */
export const RETRY_AFTER_MINUTES = [2, 10] as const;
/** Due times in a row that didn't finish before Farbaek pauses the task and says so: it stops spending, and nobody is left guessing. */
export const PAUSE_AFTER_FAILURES = 5;
/** How late a due time may be run. Later than this (the server was down), that run is skipped and said, and the next one stands. */
export const MAX_LATE_MINUTES = 6 * 60;

export type RunOutcome =
  /** The answer was written. */
  | { kind: "done"; conversationId: string; messageId: string | null }
  /**
   * Nothing worth trying again: no AI usage left, the person can't use AI here any more, the request was refused. `blameless` when
   * it was Farbaek's own doing (its limit for the day): that one isn't counted towards pausing the task.
   */
  | { kind: "skipped"; detail: string; blameless?: boolean }
  /** It may work if tried again: a provider was down, the answer was cut off. */
  | { kind: "retry"; detail: string }
  /** It failed, and trying again wouldn't help. */
  | { kind: "failed"; detail: string };

/**
 * What a turn refused before it started means for the run, from the status it answered with:
 * - 401, 402 and 403 are the person's access and their plan's usage: skipped, never retried, since trying again fails the same way;
 * - 429 is Farbaek's own limit for the day: skipped, and not held against the task;
 * - 409 (an answer is still being written in the task's conversation) and 5xx are passing trouble, tried again;
 * - anything else failed, and trying again wouldn't help.
 */
export function outcomeOfRefusal(status: number, message: string): RunOutcome {
  if (status === 402 || status === 403 || status === 401) return { kind: "skipped", detail: message };
  if (status === 429) return { kind: "skipped", detail: message, blameless: true };
  if (status === 409 || status >= 500) return { kind: "retry", detail: message };
  return { kind: "failed", detail: message };
}

/**
 * How a task's reason starts when Farbaek, not the person, paused it. Every such reason is built from this, since Home and the
 * Scheduled page tell the two kinds of pause apart by it (ADR 0281).
 */
export const BY_FARBAEK = "Paused by Farbaek: ";

/** Why Farbaek pauses a task whose stored schedule no longer reads. */
export const UNREADABLE_SCHEDULE = `${BY_FARBAEK}its schedule couldn't be read. Open it and save its schedule again.`;

/**
 * Why a task can't run on the plan its owner has now (a trial that ended, a smaller plan chosen), or null. `position` is its place
 * among their active tasks in the workspace, oldest first, from 1: the ones made first keep running.
 */
export function planProblem(schedule: Schedule, limit: ScheduledLimit, position: number): string | null {
  if (!limit.hourly && shortestGapMinutes(schedule.repeat) < 1440) return `${BY_FARBAEK}your plan runs a task once a day at most. Change its schedule, or choose a larger plan, then resume it.`;
  if (position > limit.active) return `${BY_FARBAEK}your plan keeps ${limit.active} scheduled ${limit.active === 1 ? "task" : "tasks"} active at once, and this is one more. Pause or remove another, or choose a larger plan, then resume it.`;
  return null;
}

export interface Settled {
  status: "done" | "failed" | "skipped";
  detail: string | null;
  /** When to try this due time again, or null when it's finished. */
  retryAt: Date | null;
  /** The task's next due time once this one is finished, or null when its schedule has ended. */
  nextRunAt: Date | null;
  /** Set when Farbaek pauses the task itself. */
  pauseReason: string | null;
  /** Due times in a row that didn't finish, after this one. */
  failuresInRow: number;
}

/**
 * How a run is recorded and what the task does next. `attempt` is this try's number, `failuresInRow` the count before this run, and
 * `runsFinished` the schedule's due times finished before it. A run the person started by hand (`manual`) isn't one of the
 * schedule's: it isn't counted, and the database puts the schedule's own next time back.
 */
export function settle(outcome: RunOutcome, task: { schedule: Schedule; attempt: number; failuresInRow: number; runsFinished: number; manual?: boolean }, now: Date): Settled {
  if (outcome.kind === "retry" && task.attempt <= RETRY_AFTER_MINUTES.length) {
    return { status: "failed", detail: outcome.detail, retryAt: new Date(now.getTime() + RETRY_AFTER_MINUTES[task.attempt - 1]! * 60_000), nextRunAt: null, pauseReason: null, failuresInRow: task.failuresInRow };
  }
  const status = outcome.kind === "done" ? "done" : outcome.kind === "skipped" ? "skipped" : "failed";
  const detail = outcome.kind === "done" ? null : outcome.kind === "retry" ? `${outcome.detail} Tried ${task.attempt} times.` : outcome.detail;
  const nextRunAt = nextRun(task.schedule, now, task.manual ? task.runsFinished : task.runsFinished + 1);
  const blameless = outcome.kind === "skipped" && outcome.blameless === true;
  const failures = status === "done" ? 0 : blameless ? task.failuresInRow : task.failuresInRow + 1;
  const pauseReason = nextRunAt !== null && !blameless && failures >= PAUSE_AFTER_FAILURES ? `${BY_FARBAEK}its last ${failures} runs didn't finish. The latest: ${detail ?? "no reason was recorded."}`.slice(0, 300) : null;
  return { status, detail, retryAt: null, nextRunAt, pauseReason, failuresInRow: failures };
}

/**
 * What a scheduled run's turn is told, beside the person's instruction and for the model only. The instruction is the person's words
 * as they wrote them, schedule and all ("remind me tomorrow at 5pm to call the bank", "send me the news every morning"): without
 * this, the model reads them as a new request, and answers that it will remind them, or that it can't.
 */
export const RUN_NOTE =
  "This message is a task the person scheduled in Farbaek, and it is due now. Farbaek runs it by itself at the times they set, so the scheduling is already done: don't offer to schedule or remind, don't say you will do it later, and don't say you can't set reminders. Do what it asks now and give the result itself. If it asks to be reminded of something, this is the reminder: say it plainly, in a sentence or two.";

/** Whether a due time is too old to run: the server was down past it. */
export function tooLate(dueAt: Date, now: Date): boolean {
  return now.getTime() - dueAt.getTime() > MAX_LATE_MINUTES * 60_000;
}

/** Starting points, in a person's own words, each with the schedule it opens the form on. */
export const EXAMPLES: { title: string; instruction: string; repeat: Schedule["repeat"] }[] = [
  { title: "Morning news on what I follow", instruction: "Research the latest news on the topics I care about and give me a short summary with sources.", repeat: { kind: "daily", time: "08:00" } },
  { title: "Weekly look at my field", instruction: "Find what changed in my industry this week: announcements, launches and anything I should act on. Keep it to one page, with sources.", repeat: { kind: "weekly", days: [1], time: "09:00" } },
  { title: "Watch a topic", instruction: "Check for new developments on a topic I name, and tell me only what is new since last time, with sources.", repeat: { kind: "daily", time: "18:00" } },
  { title: "Friday review", instruction: "Help me review my week: ask what I finished, what slipped and what matters next week, then write it up.", repeat: { kind: "weekly", days: [5], time: "16:00" } },
  { title: "Learn a little every day", instruction: "Teach me one useful idea on a subject I choose, in five minutes of reading, with one question to check I understood.", repeat: { kind: "weekdays", time: "07:30" } },
  { title: "Month-end checklist", instruction: "Remind me of my month-end tasks and ask which are done.", repeat: { kind: "monthly", day: 31, time: "09:00" } },
];
