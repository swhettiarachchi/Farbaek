"use client";

import { ArrowUpRightIcon, InfoIcon, PauseIcon, PencilSimpleIcon, PlayIcon, TrashIcon, WarningCircleIcon } from "@phosphor-icons/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { removeScheduledTaskAction, runScheduledTaskNowAction, setScheduledTaskStateAction, type ScheduledState } from "@/app/app/scheduled/actions";
import { describeSchedule } from "@/core/automation/schedule";
import type { ScheduledLimit } from "@/core/automation/tasks";
import type { ScheduledTask, TaskRun } from "@/server/automation/store";
import { buttonClasses } from "@/components/ui/button";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { LocalTime } from "@/components/ui/local-time";
import { StatusBadge } from "@/components/ui/status-badge";
import { BY_FARBAEK } from "@/core/automation/home";
import { RUN_STATUS, stateBadge } from "./status";
import { TaskForm } from "./task-form";

const ANSWER_LINK = "tap inline-flex items-center gap-1 font-medium text-accent underline-offset-2 hover:underline";

/**
 * One scheduled task (stage 271, ADR 0278): what it does, when it runs next, how its last runs went, and the controls: run now,
 * pause or resume, change, remove. Every control works or says why it's off.
 */
function TaskCard({ task, runs, limit, disabledReason, serverNow }: { task: ScheduledTask; runs: TaskRun[]; limit: ScheduledLimit; disabledReason: string | null; serverNow: number }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [result, setResult] = useState<ScheduledState>({ status: "idle" });
  const [pending, startTransition] = useTransition();
  const act = (work: () => Promise<ScheduledState>) =>
    startTransition(async () => {
      const r = await work().catch((): ScheduledState => ({ status: "error", message: "The connection dropped. Nothing was changed. Try again." }));
      setResult(r);
      if (r.status === "done") router.refresh();
    });
  // Running now: its newest run is under way, and the task is one that runs. An older row can't say so.
  const running = task.state === "active" && runs[0]?.status === "running";
  const badge = stateBadge(task.state, running);
  const off = disabledReason ?? (pending ? "Working on it." : null);
  const nowReason = off ?? (task.state === "paused" ? "Resume it first." : task.state === "ended" ? "Its schedule has ended: change its schedule first." : running ? "It's running now." : null);
  // The answers are in the task's own conversation; a run whose conversation has since been replaced or deleted has no link.
  const answer = (conversationId: string | null) => (conversationId && conversationId === task.conversationId ? `/app/chat/${conversationId}` : null);
  const byFarbaek = task.stateReason?.startsWith(BY_FARBAEK) ?? false;

  return (
    <li className="rounded-md border border-line bg-surface p-4 shadow-e1 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h3 className="text-title-4 font-medium text-ink">{task.title}</h3>
          <p className="mt-0.5 text-sm text-ink-2">{task.schedule ? describeSchedule(task.schedule) : "Its schedule couldn't be read. Change it and save it again."}</p>
        </div>
        <StatusBadge status={badge.status} label={badge.label} />
      </div>
      <p className="mt-3 line-clamp-3 text-body leading-relaxed text-ink-2">{task.instruction}</p>
      {task.stateReason ? (
        <p className="mt-3 flex items-start gap-2 text-sm text-ink">
          {byFarbaek ? <WarningCircleIcon size={16} weight="fill" aria-hidden className="mt-0.5 shrink-0 text-caution" /> : <InfoIcon size={16} weight="fill" aria-hidden className="mt-0.5 shrink-0 text-ink-3" />}
          {task.stateReason}
        </p>
      ) : null}
      <p className="mt-3 text-sm text-ink-3">
        {task.state === "active" && task.nextRunAt ? (
          <>
            Next run <LocalTime iso={task.nextRunAt} />.
          </>
        ) : task.state === "paused" ? (
          "It won't run until you resume it."
        ) : (
          "No run is planned."
        )}{" "}
        {task.runsFinished === 0 ? "No scheduled run yet." : `${task.runsFinished} scheduled ${task.runsFinished === 1 ? "run" : "runs"} so far.`}
      </p>

      {runs.length > 0 ? (
        <ul aria-label={`Latest runs of ${task.title}`} className="mt-3 grid gap-1.5 border-t border-line pt-3">
          {runs.slice(0, 4).map((r) => {
            const href = r.status === "done" ? answer(r.conversationId) : null;
            return (
              <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                <StatusBadge status={RUN_STATUS[r.status].status} label={RUN_STATUS[r.status].label} />
                <span className="text-ink-2">
                  <LocalTime iso={r.dueAt} />
                  {r.manual ? ", started by you" : ""}
                </span>
                {href ? (
                  <Link href={href} className={ANSWER_LINK}>
                    Read the answer <ArrowUpRightIcon size={14} weight="bold" aria-hidden />
                  </Link>
                ) : r.detail ? (
                  <span className="min-w-0 basis-full text-ink-3 sm:basis-auto sm:flex-1">{r.detail}</span>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : task.lastRunAt && task.lastStatus ? (
        // Its runs are older than the latest ones read for the page: the task's own record of its last run stands in.
        <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line pt-3 text-sm">
          <StatusBadge status={RUN_STATUS[task.lastStatus].status} label={RUN_STATUS[task.lastStatus].label} />
          <span className="text-ink-2">
            Last run <LocalTime iso={task.lastRunAt} />
          </span>
          {task.lastStatus === "done" && task.conversationId ? (
            <Link href={`/app/chat/${task.conversationId}`} className={ANSWER_LINK}>
              Read the answer <ArrowUpRightIcon size={14} weight="bold" aria-hidden />
            </Link>
          ) : null}
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button type="button" disabled={Boolean(nowReason)} onClick={() => act(() => runScheduledTaskNowAction(task.id))} className={buttonClasses("secondary", "sm")}>
          <PlayIcon size={16} weight="bold" aria-hidden /> Run now
        </button>
        {task.state === "active" ? (
          <button type="button" disabled={Boolean(off)} onClick={() => act(() => setScheduledTaskStateAction(task.id, "paused"))} className={buttonClasses("secondary", "sm")}>
            <PauseIcon size={16} weight="bold" aria-hidden /> Pause
          </button>
        ) : task.state === "paused" ? (
          <button type="button" disabled={Boolean(off)} onClick={() => act(() => setScheduledTaskStateAction(task.id, "active"))} className={buttonClasses("secondary", "sm")}>
            <PlayIcon size={16} weight="bold" aria-hidden /> Resume
          </button>
        ) : null}
        <button type="button" aria-expanded={editing} disabled={Boolean(disabledReason)} onClick={() => setEditing((v) => !v)} className={buttonClasses("ghost", "sm")}>
          <PencilSimpleIcon size={16} weight="bold" aria-hidden /> {editing ? "Close" : "Change"}
        </button>
        <ConfirmAction
          action={removeScheduledTaskAction}
          fields={{ taskId: task.id }}
          trigger={
            <>
              <TrashIcon size={16} weight="bold" aria-hidden /> Remove
            </>
          }
          triggerVariant="ghost"
          question="It will stop running and leave this list. Its past answers stay in Chat."
          confirmLabel="Remove the task"
          pendingLabel="Removing…"
          disabledReason={disabledReason}
        />
      </div>
      {nowReason && !disabledReason && !pending ? <p className="mt-2 text-sm text-ink-3">Run now is off: {nowReason.charAt(0).toLowerCase() + nowReason.slice(1)}</p> : null}
      {result.status === "error" ? (
        <p role="alert" className="mt-3 flex items-start gap-2 text-sm text-failed">
          <WarningCircleIcon size={16} weight="fill" aria-hidden className="mt-0.5 shrink-0" />
          {result.message}
        </p>
      ) : result.status === "done" ? (
        <p role="status" className="mt-3 text-sm text-ink-2">
          {result.message}
        </p>
      ) : null}
      {editing ? (
        <div className="mt-4 border-t border-line pt-4">
          <TaskForm
            key={`${task.id}:${task.version}`}
            start={{ taskId: task.id, version: task.version, title: task.title, instruction: task.instruction, schedule: task.schedule, options: task.options, runsFinished: task.runsFinished, state: task.state }}
            limit={limit}
            disabledReason={disabledReason}
            serverNow={serverNow}
            onDone={() => setEditing(false)}
          />
        </div>
      ) : null}
    </li>
  );
}

export function TaskList({ tasks, runs, limit, disabledReason, serverNow }: { tasks: ScheduledTask[]; runs: TaskRun[]; limit: ScheduledLimit; disabledReason: string | null; serverNow: number }) {
  // Newest first, as read; each task's own, in that order.
  const byTask = new Map<string, TaskRun[]>();
  for (const r of runs) byTask.set(r.taskId, [...(byTask.get(r.taskId) ?? []), r]);
  return (
    <ul className="grid gap-4">
      {tasks.map((t) => (
        <TaskCard key={t.id} task={t} runs={byTask.get(t.id) ?? []} limit={limit} disabledReason={disabledReason} serverNow={serverNow} />
      ))}
    </ul>
  );
}
