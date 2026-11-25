import { nextRun, type Schedule } from "@/core/automation/schedule";
import { DEFAULT_OPTIONS } from "@/core/automation/tasks";
import type { ScheduledTask, TaskRun } from "./store";

/**
 * Sample scheduled tasks for the read-only demo workspace (stage 271): made up, labelled "Sample" in their names, and never saved or
 * run. They show what the page looks like with tasks on it; nothing here reaches a model.
 */
export function demoScheduled(now: Date): { tasks: ScheduledTask[]; runs: TaskRun[] } {
  const hour = 3_600_000;
  const ago = (hours: number) => new Date(Math.floor(now.getTime() / hour) * hour - hours * hour).toISOString();
  const task = (n: number, title: string, instruction: string, schedule: Schedule, more: Partial<ScheduledTask>): ScheduledTask => ({
    id: `00000000-0000-4000-8000-00000000000${n}`,
    title,
    instruction,
    schedule,
    options: DEFAULT_OPTIONS,
    state: "active",
    stateReason: null,
    conversationId: null,
    nextRunAt: nextRun(schedule, now, more.runsFinished ?? 0)?.toISOString() ?? null,
    lastRunAt: null,
    lastStatus: null,
    runsFinished: 0,
    version: 1,
    createdAt: ago(24 * 9),
    ...more,
  });
  const tasks = [
    task(1, "Sample: morning AI news", "Research the latest AI news and give me a short summary with sources.", { repeat: { kind: "daily", time: "08:00" }, timeZone: "UTC", end: { kind: "never" } }, { runsFinished: 8, lastRunAt: ago(5), lastStatus: "done" }),
    task(2, "Sample: weekly competitor check", "Look at what our three closest competitors changed on their pricing pages this week and list the differences.", { repeat: { kind: "weekly", days: [1], time: "09:30" }, timeZone: "UTC", end: { kind: "never" } }, { runsFinished: 2, lastRunAt: ago(24 * 3), lastStatus: "failed" }),
    task(3, "Sample: month-end report outline", "Draft the outline of this month's progress report from what we discussed in Chat.", { repeat: { kind: "monthly", day: 28, time: "16:00" }, timeZone: "UTC", end: { kind: "never" } }, { state: "paused", nextRunAt: null, runsFinished: 1, lastRunAt: ago(24 * 20), lastStatus: "done" }),
  ];
  // A sample run sits on one of its task's own times: the one before now, and the ones before that.
  const before = (t: ScheduledTask, back: number): string => {
    const days = t.schedule?.repeat.kind === "weekly" ? 7 : t.schedule?.repeat.kind === "monthly" ? 28 : 1;
    const from = new Date(now.getTime() - (back + 1) * days * 24 * hour - (t.schedule?.repeat.kind === "monthly" ? 3 * 24 * hour : 0));
    return (t.schedule ? nextRun(t.schedule, from, 0) : null)?.toISOString() ?? ago(back * days * 24);
  };
  const run = (n: number, t: ScheduledTask, back: number, status: TaskRun["status"], detail: string | null): TaskRun => {
    const at = before(t, back);
    return { id: `00000000-0000-4000-8000-0000000001${String(n).padStart(2, "0")}`, taskId: t.id, dueAt: at, status, manual: false, detail, conversationId: null, finishedAt: at };
  };
  const runs = [
    run(1, tasks[0]!, 0, "done", "Sample run: a real one links to its answer in Chat."),
    run(2, tasks[0]!, 1, "done", null),
    run(3, tasks[0]!, 2, "skipped", "This month's AI usage had run out, so it didn't start."),
    run(4, tasks[1]!, 0, "failed", "The answer didn't finish in time. It will run again at its next time."),
    run(5, tasks[1]!, 1, "done", null),
    run(6, tasks[2]!, 0, "done", null),
  ];
  // Each sample task's own record of its last run is its newest sample run.
  for (const t of tasks) {
    const newest = runs.find((r) => r.taskId === t.id);
    if (newest && (newest.status === "done" || newest.status === "failed" || newest.status === "skipped")) Object.assign(t, { lastRunAt: newest.dueAt, lastStatus: newest.status });
  }
  return { tasks, runs };
}
