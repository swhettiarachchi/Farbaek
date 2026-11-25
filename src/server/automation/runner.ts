import "server-only";
import { nextRun, scheduleSchema } from "@/core/automation/schedule";
import { DEFAULT_OPTIONS, outcomeOfRefusal, planProblem, settle, taskOptionsSchema, tooLate, type RunOutcome, type ScheduledLimit, type Settled } from "@/core/automation/tasks";
import type { ScheduledNotice } from "@/server/email/notify";
import type { HeadlessResult, HeadlessTurn } from "./headless-chat";
import type { ClaimedRun, ScheduledStore } from "./store";

/**
 * The runner for scheduled tasks (stage 271, ADR 0278). Each tick claims the tasks that are due (each under a lease, in the
 * database), runs each as one Chat turn for its owner, and records how it went: done, tried again later, skipped or failed, and when
 * the task runs next. Nothing is held in the server's memory between ticks, so a restart loses no task: its lease runs out and it is
 * claimed again as another try at the same due time.
 */

/** A turn is given this long. Under the lease (15 minutes), so a run that is cut short still records why itself. */
export const TURN_TIMEOUT_MS = 10 * 60_000;
/** Asking the database again when an outcome couldn't be recorded: an answer already written must not be run a second time for a dropped call. */
const FINISH_RETRY_MS = [500, 2_000, 5_000] as const;

export interface RunnerDeps {
  store: ScheduledStore;
  /** Runs the task's instruction as its owner's Chat turn. */
  turn(input: HeadlessTurn, signal: AbortSignal, taskId: string): Promise<HeadlessResult>;
  /** What the owner's plan allows now, read when the task runs; null when it couldn't be read (the turn itself then decides). */
  limit?(orgId: string, ownerId: string): Promise<ScheduledLimit | null>;
  /** Tells the person a run ended, by the ways they've switched on. Missing: nobody is told. */
  notify?(n: ScheduledNotice): Promise<void>;
  now(): Date;
  /** Waits between tries at recording an outcome; the tests don't. */
  sleep?(ms: number): Promise<void>;
  log?(event: string, fields: Record<string, unknown>): void;
}

export interface TickResult {
  claimed: number;
  done: number;
  retrying: number;
  skipped: number;
  failed: number;
}

/** What a turn that ran means for the run. An answer that was cut off or failed part-way may work if tried again. */
function outcomeOf(result: HeadlessResult): RunOutcome {
  if (!result.ok) return outcomeOfRefusal(result.status, result.message);
  if (result.status === "complete") return { kind: "done", conversationId: result.conversationId, messageId: result.messageId };
  if (result.status === "stopped") return { kind: "retry", detail: "The answer took too long and was stopped." };
  return { kind: "retry", detail: result.error ? `The answer couldn't be finished: ${result.error}` : "The answer couldn't be finished." };
}

/** One claimed run, start to finish. Never throws: whatever happens is recorded on the run. */
export async function runClaimed(deps: RunnerDeps, run: ClaimedRun): Promise<keyof Omit<TickResult, "claimed">> {
  const schedule = scheduleSchema.safeParse(run.schedule);
  const options = taskOptionsSchema.safeParse(run.options);
  const wants = options.success ? options.data.notify : DEFAULT_OPTIONS.notify;

  /** Records the outcome, asking again when the database couldn't be reached; then tells the person when that is due. */
  const record = async (settled: Settled, conversationId: string | null, messageId: string | null): Promise<keyof Omit<TickResult, "claimed">> => {
    let recorded: "recorded" | "stale" | "error" = "error";
    for (let i = 0; i <= FINISH_RETRY_MS.length; i++) {
      recorded = await deps.store
        .finish({ runId: run.runId, attempt: run.attempt, status: settled.status, detail: settled.detail, conversationId, messageId, nextRunAt: settled.nextRunAt, retryAt: settled.retryAt, pauseReason: settled.pauseReason, failuresInRow: settled.failuresInRow })
        .catch(() => "error" as const);
      if (recorded !== "error" || i === FINISH_RETRY_MS.length) break;
      await (deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms))))(FINISH_RETRY_MS[i]!);
    }
    // A try that was given up on meanwhile (its lease ran out) tells nobody: the try that replaced it will.
    if (recorded !== "recorded") {
      deps.log?.("scheduled.finish_not_recorded", { task: run.taskId, attempt: run.attempt, why: recorded });
      return settled.retryAt ? "retrying" : settled.status;
    }
    if (settled.retryAt) return "retrying";
    // A finished run is told when the person asked: once for runs skipped in a row, not every time. A task Farbaek paused is always
    // told, since it has stopped running.
    const repeatSkip = settled.status === "skipped" && run.failuresInRow > 0;
    if (deps.notify && ((wants && !repeatSkip) || settled.pauseReason)) {
      await deps.notify({ userId: run.ownerId, taskTitle: run.title, status: settled.status, detail: settled.pauseReason ?? settled.detail, conversationId: settled.status === "done" ? conversationId : null }).catch(() => undefined);
    }
    return settled.status;
  };

  // A schedule that no longer reads can't say when to run next: the task is paused and says so, rather than run on a guess.
  if (!schedule.success) {
    const why = "Paused by Farbaek: its schedule couldn't be read. Open it and save its schedule again.";
    return record({ status: "failed", detail: "Its schedule couldn't be read.", retryAt: null, nextRunAt: null, pauseReason: why, failuresInRow: run.failuresInRow + 1 }, run.conversationId, null);
  }
  const position = { schedule: schedule.data, attempt: run.attempt, failuresInRow: run.failuresInRow, runsFinished: run.runsFinished, manual: run.manual };

  // The plan the owner has now, not the one they had when they scheduled it: a trial that ended or a smaller plan pauses what it no
  // longer allows, with the reason, before anything is spent. Their oldest tasks keep running.
  const limit = deps.limit ? await deps.limit(run.orgId, run.ownerId).catch(() => null) : null;
  if (limit) {
    const place = await deps.store.position(run.orgId, run.ownerId, run.taskId).catch(() => null);
    const problem = planProblem(schedule.data, limit, place ?? 1);
    if (problem) {
      // Paused, with its place in the schedule kept for when it is resumed.
      const next = nextRun(schedule.data, deps.now(), run.manual ? run.runsFinished : run.runsFinished + 1);
      return record({ status: "skipped", detail: problem, retryAt: null, nextRunAt: next, pauseReason: problem, failuresInRow: run.failuresInRow }, run.conversationId, null);
    }
  }

  let outcome: RunOutcome;
  let conversationId = run.conversationId;
  let messageId: string | null = null;
  if (tooLate(run.dueAt, deps.now())) {
    outcome = { kind: "skipped", detail: "Farbaek wasn't running at this time, so this run was missed.", blameless: true };
  } else {
    const opts = options.success ? options.data : DEFAULT_OPTIONS;
    try {
      const result = await deps.turn({ orgId: run.orgId, userId: run.ownerId, conversationId: run.conversationId, title: run.title, text: run.instruction, web: opts.web, effort: opts.effort }, AbortSignal.timeout(TURN_TIMEOUT_MS), run.taskId);
      outcome = outcomeOf(result);
      conversationId = result.conversationId ?? conversationId;
      messageId = result.ok ? result.messageId : null;
    } catch (e) {
      outcome = { kind: "retry", detail: "The run stopped unexpectedly." };
      deps.log?.("scheduled.turn_threw", { task: run.taskId, reason: e instanceof Error ? e.name : "unknown" });
    }
  }
  return record(settle(outcome, position, deps.now()), conversationId, messageId);
}

/** Claims up to `limit` due tasks and runs them, a few at a time. Null when the database couldn't be asked. */
export async function runDueTasks(deps: RunnerDeps, limit: number): Promise<TickResult | null> {
  if (limit <= 0) return { claimed: 0, done: 0, retrying: 0, skipped: 0, failed: 0 };
  const claimed = await deps.store.claim(limit);
  if (!claimed) return null;
  const tally: TickResult = { claimed: claimed.length, done: 0, retrying: 0, skipped: 0, failed: 0 };
  const results = await Promise.allSettled(claimed.map((run) => runClaimed(deps, run)));
  for (const r of results) tally[r.status === "fulfilled" ? r.value : "failed"]++;
  return tally;
}
