/**
 * Scheduled work on Home (stage 274, ADR 0281): the few lines the main screen shows about what Farbaek does by itself, and which
 * tasks need the person. Home is one glance, so it carries three rows at most: a task Farbaek paused, which is the person's to look
 * at, then what runs next, soonest first. Everything else is on the Scheduled page.
 */
import { describeSchedule, type Schedule } from "./schedule";
import { BY_FARBAEK } from "./tasks";

/** What Home reads of a scheduled task. */
export interface HomeTask {
  id: string;
  title: string;
  state: "active" | "paused" | "ended";
  stateReason: string | null;
  schedule: Schedule | null;
  nextRunAt: string | null;
  /** When its last run was recorded. A task Farbaek paused was paused then. */
  lastRunAt: string | null;
  conversationId: string | null;
}

/** What Home reads of a run. */
export interface HomeRun {
  taskId: string;
  dueAt: string;
  status: "running" | "retrying" | "done" | "failed" | "skipped";
  conversationId: string | null;
  finishedAt: string | null;
}

export interface HomeRow {
  id: string;
  title: string;
  /** Scheduled, paused by the person, or paused by Farbaek with a reason. */
  kind: "next" | "paused" | "stopped";
  /**
   * For a scheduled one: under way now, due (its time has come and it is about to start, or be tried again), or later, at
   * `nextRunAt`. Null when it has no time that can be read.
   */
  when: "running" | "due" | "later" | null;
  nextRunAt: string | null;
  /** Its schedule in a sentence, or why Farbaek paused it. */
  line: string;
}

/** The newest finished run among the person's tasks: what Farbaek last did by itself. */
export interface HomeLastRun {
  taskId: string;
  title: string;
  at: string;
  status: "done" | "failed" | "skipped";
  /** The chat that holds this run's answer: only for a run that finished, and only while it is still the task's chat. */
  conversationId: string | null;
}

export interface ScheduledOnHome {
  /** Empty when every task's schedule has ended and only the last run is worth saying. */
  rows: HomeRow[];
  /** Scheduled and paused tasks that Home doesn't show. */
  more: number;
  /** Tasks Farbaek paused itself in the last few days: each is the person's to look at. */
  stopped: { id: string; title: string; reason: string }[];
  lastRun: HomeLastRun | null;
}

export { BY_FARBAEK };

/** A task's reason without its "Paused by Farbaek" lead, as a sentence of its own. */
export function stoppedReason(stateReason: string): string {
  const rest = stateReason.startsWith(BY_FARBAEK) ? stateReason.slice(BY_FARBAEK.length) : stateReason;
  return rest.charAt(0).toUpperCase() + rest.slice(1);
}

/** The most rows Home shows. */
export const HOME_ROWS = 3;
/**
 * How long a task Farbaek paused leads Home, and how long the last run of a person with nothing scheduled is still said. A pause
 * the person can't or won't undo (a smaller plan, say) mustn't lead the main screen for good: after this it is a row in the card.
 */
export const HOME_RECENT_DAYS = 7;

const time = (iso: string | null): number => (iso ? Date.parse(iso) : Number.NaN);

/**
 * `runs` are the person's latest runs, any order; null when they couldn't be read, and then nothing is said about a last run or a
 * run under way. Null back when there is nothing to show: Home then says nothing about scheduled work.
 */
export function scheduledOnHome(tasks: readonly HomeTask[], runs: readonly HomeRun[] | null, now: Date): ScheduledOnHome | null {
  const recent = (iso: string | null) => now.getTime() - time(iso) <= HOME_RECENT_DAYS * 86_400_000;
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const newestFirst = [...(runs ?? [])].filter((r) => byId.has(r.taskId)).sort((a, b) => time(b.dueAt) - time(a.dueAt));
  // A task is running when its newest run is under way, as the Scheduled page says it.
  const running = new Set<string>();
  const seen = new Set<string>();
  for (const r of newestFirst) {
    if (seen.has(r.taskId)) continue;
    seen.add(r.taskId);
    if (r.status === "running" && byId.get(r.taskId)!.state === "active") running.add(r.taskId);
  }

  // The newest run that ended, of any task still listed (an ended one too): it is what Farbaek last did.
  const ended = newestFirst
    .filter((r): r is HomeRun & { status: "done" | "failed" | "skipped" } => r.status === "done" || r.status === "failed" || r.status === "skipped")
    .sort((a, b) => time(b.finishedAt ?? b.dueAt) - time(a.finishedAt ?? a.dueAt))[0];
  const lastTask = ended ? byId.get(ended.taskId)! : null;
  const lastRun: HomeLastRun | null =
    ended && lastTask
      ? {
          taskId: lastTask.id,
          title: lastTask.title,
          at: ended.finishedAt ?? ended.dueAt,
          status: ended.status,
          // The answers are in the task's own chat; a run whose chat has since been replaced or deleted has no link.
          conversationId: ended.status === "done" && ended.conversationId !== null && ended.conversationId === lastTask.conversationId ? ended.conversationId : null,
        }
      : null;

  // A task whose schedule has ended runs no more and asks for nothing: it stays on the Scheduled page.
  const live = tasks.filter((t) => t.state !== "ended");
  if (live.length === 0) return lastRun && recent(lastRun.at) ? { rows: [], more: 0, stopped: [], lastRun } : null;

  const stopped = live.filter((t) => t.state === "paused" && t.stateReason?.startsWith(BY_FARBAEK));
  const whenOf = (t: HomeTask): HomeRow["when"] => (running.has(t.id) ? "running" : Number.isNaN(time(t.nextRunAt)) ? null : time(t.nextRunAt) <= now.getTime() ? "due" : "later");
  // Soonest first, so one that is running or due leads; one with no time that can be read goes last.
  const next = live.filter((t) => t.state === "active").sort((a, b) => (Number.isNaN(time(a.nextRunAt)) ? Infinity : time(a.nextRunAt)) - (Number.isNaN(time(b.nextRunAt)) ? Infinity : time(b.nextRunAt)));
  const paused = live.filter((t) => t.state === "paused" && !stopped.includes(t));
  const sentence = (t: HomeTask) => (t.schedule ? describeSchedule(t.schedule) : "Its schedule couldn't be read.");
  const all: HomeRow[] = [
    // What Farbaek stopped comes first: it is the one thing here that wants the person.
    ...stopped.map((t): HomeRow => ({ id: t.id, title: t.title, kind: "stopped", when: null, nextRunAt: null, line: stoppedReason(t.stateReason!) })),
    ...next.map((t): HomeRow => ({ id: t.id, title: t.title, kind: "next", when: whenOf(t), nextRunAt: whenOf(t) === "later" ? t.nextRunAt : null, line: sentence(t) })),
    ...paused.map((t): HomeRow => ({ id: t.id, title: t.title, kind: "paused", when: null, nextRunAt: null, line: sentence(t) })),
  ];
  return {
    rows: all.slice(0, HOME_ROWS),
    more: Math.max(0, all.length - HOME_ROWS),
    // A pause is recorded with the run that caused it, so the task's last run is when it was paused.
    stopped: stopped.filter((t) => recent(t.lastRunAt)).map((t) => ({ id: t.id, title: t.title, reason: stoppedReason(t.stateReason!) })),
    lastRun,
  };
}
