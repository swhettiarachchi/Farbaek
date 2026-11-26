"use client";

import { ArrowUpRightIcon, BroomIcon, InfoIcon, PauseIcon, PencilSimpleIcon, PlayIcon, TrashIcon, WarningCircleIcon } from "@/components/icons";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { clearAgentNotesAction, removeAgentAction, runScheduledTaskNowAction, setScheduledTaskStateAction, type ScheduledState } from "@/app/app/scheduled/actions";
import { BY_FARBAEK, stoppedReason } from "@/core/automation/home";
import { describeSchedule } from "@/core/automation/schedule";
import type { ScheduledLimit } from "@/core/automation/tasks";
import type { Agent } from "@/server/automation/agents";
import type { PageLinks } from "@/server/automation/links";
import type { TaskRun } from "@/server/automation/store";
import { buttonClasses } from "@/components/ui/button";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { LocalTime } from "@/components/ui/local-time";
import { StatusBadge } from "@/components/ui/status-badge";
import { linkWaitSeconds } from "@/core/automation/links";
import { RunLink } from "./run-link";
import { RUN_STATUS, STOPPED_BADGE, stateBadge } from "./status";
import { TaskForm } from "./task-form";

const ANSWER_LINK = "tap inline-flex items-center gap-1 font-medium text-accent underline-offset-2 hover:underline";

/** What the page knows of an agent. */
export interface AgentView {
  agent: Agent;
  /** Its latest runs, newest first; null when they couldn't be read. */
  runs: TaskRun[] | null;
  /** Runs counted against its limit, as the runner counts them; null when they couldn't be counted. */
  runsIn30Days: number | null;
  /** Notes its next run will be given, as the database will choose them; null when they couldn't be counted. */
  notesGiven: number | null;
}

/**
 * One agent (stage 275, ADR 0282): who it is and what it is for, when it works next, how much of its limit it has used, what its
 * last runs did, and its controls: work now, pause or resume, change, clear its notes, remove. Every control works or says why it's
 * off.
 */
function AgentCard({ view, limit, links, disabledReason, stopReason, serverNow }: { view: AgentView; limit: ScheduledLimit; links: PageLinks; disabledReason: string | null; stopReason: string | null; serverNow: number }) {
  const { agent, runsIn30Days, notesGiven } = view;
  const runs = view.runs ?? [];
  const task = agent.task;
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
  const running = task.state === "active" && runs[0]?.status === "running";
  const byFarbaek = task.stateReason?.startsWith(BY_FARBAEK) ?? false;
  const atLimit = runsIn30Days !== null && runsIn30Days >= agent.runsLimit;
  // An agent at its limit is still on, and waiting: said as that, not as scheduled.
  const badge = byFarbaek && task.state === "paused" ? STOPPED_BADGE : atLimit && task.state === "active" && !running ? ({ status: "pending", label: "At its limit" } as const) : stateBadge(task.state, running);
  const off = disabledReason ?? (pending ? "Working on it." : null);
  const nowReason =
    off ??
    (task.state === "paused"
      ? "Resume it first."
      : task.state === "ended"
        ? "Its schedule has ended: change its schedule first."
        : running
          ? "It's working now."
          : atLimit
            ? "It has reached its limit for these 30 days. Raise its limit first."
            : null);
  // The answers are in the agent's own conversation; a run whose conversation has since been replaced or deleted has no link.
  const answer = (conversationId: string | null) => (conversationId && conversationId === task.conversationId ? `/app/chat/${conversationId}` : null);
  // Its notes are what its finished runs left since they were last cleared, told apart as the database tells them: by when a run started.
  const given = (r: TaskRun) => Boolean(r.note) && r.status === "done" && (!agent.notesFrom || Date.parse(r.startedAt) > Date.parse(agent.notesFrom));
  // Whether it has any to clear is the database's count, by its own rule: the runs on this card are only the latest few.
  const noNotes = notesGiven === 0;

  return (
    <li className="rounded-md border border-line bg-surface p-4 shadow-e1 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h3 className="text-title-4 font-medium text-ink">{agent.name}</h3>
          <p className="mt-0.5 text-sm text-ink-2">{task.schedule ? describeSchedule(task.schedule) : "Its schedule couldn't be read. Change it and save it again."}</p>
        </div>
        <StatusBadge status={badge.status} label={badge.label} />
      </div>
      <p className="mt-3 line-clamp-4 text-body leading-relaxed text-ink-2">{agent.goal}</p>
      {task.stateReason ? (
        <p className="mt-3 flex items-start gap-2 text-sm text-ink">
          {byFarbaek ? <WarningCircleIcon size={16} weight="fill" aria-hidden className="mt-0.5 shrink-0 text-caution" /> : <InfoIcon size={16} weight="fill" aria-hidden className="mt-0.5 shrink-0 text-ink-3" />}
          {/* The badge already says who paused it: the reason stands as its own sentence. */}
          {byFarbaek ? stoppedReason(task.stateReason) : task.stateReason}
        </p>
      ) : null}
      <p className="mt-3 text-sm text-ink-3">
        {task.state === "active" && task.nextRunAt ? (
          <>
            It works next <LocalTime iso={task.nextRunAt} />.
          </>
        ) : task.state === "paused" ? (
          "It won't work until you resume it."
        ) : (
          "No run is planned."
        )}{" "}
        {runsIn30Days === null ? (
          <>Its limit is {agent.runsLimit} runs in any 30 days.</>
        ) : (
          <>
            It has made <span className="font-medium tabular-nums text-ink">{runsIn30Days}</span> of the <span className="font-medium tabular-nums text-ink">{agent.runsLimit}</span> runs it may make in any 30 days{atLimit ? ", so it is waiting." : "."}
          </>
        )}{" "}
        {agent.useMemory ? "It uses what you asked Farbaek to remember." : "It doesn't use what you asked Farbaek to remember."}
      </p>

      {runs.length > 0 ? (
        <ul aria-label={`Latest runs of ${agent.name}`} className="mt-3 grid gap-3 border-t border-line pt-3">
          {runs.map((r) => {
            const href = r.status === "done" ? answer(r.conversationId) : null;
            return (
              <li key={r.id} className="grid gap-1 text-sm">
                <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <StatusBadge status={RUN_STATUS[r.status].status} label={RUN_STATUS[r.status].label} />
                  <span className="text-ink-2">
                    <LocalTime iso={r.dueAt} />
                    {r.fromLink ? ", started from its link" : r.manual ? ", started by you" : ""}
                  </span>
                  {href ? (
                    <Link href={href} className={ANSWER_LINK}>
                      Read the answer <ArrowUpRightIcon size={14} weight="bold" aria-hidden />
                    </Link>
                  ) : null}
                </span>
                {/* What the run left for the next one, in its own words; or why it didn't finish. */}
                {r.note ? (
                  <span className="grid gap-0.5">
                    <span className="line-clamp-4 leading-relaxed text-ink-2">{r.note}</span>
                    {given(r) ? null : <span className="text-ink-3">Cleared: it is no longer given this.</span>}
                  </span>
                ) : r.detail ? (
                  <span className="text-ink-3">{r.detail}</span>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : view.runs === null ? (
        <p className="mt-3 border-t border-line pt-3 text-sm text-ink-3">Its runs couldn&apos;t be read just now. Reload the page: nothing has been lost.</p>
      ) : task.runsFinished > 0 || task.lastRunAt ? (
        <p className="mt-3 border-t border-line pt-3 text-sm text-ink-3">Its latest runs are older than the ones this page reads. Its answers are in Chat, under its name.</p>
      ) : (
        <p className="mt-3 border-t border-line pt-3 text-sm text-ink-3">It hasn&apos;t worked yet. After each run, what it did and what it will do next appear here.</p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button type="button" disabled={Boolean(nowReason)} onClick={() => act(() => runScheduledTaskNowAction(task.id))} className={buttonClasses("secondary", "sm")}>
          <PlayIcon size={16} weight="bold" aria-hidden /> Work now
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
          action={clearAgentNotesAction}
          fields={{ agentId: agent.id }}
          trigger={
            <>
              <BroomIcon size={16} weight="bold" aria-hidden /> Clear its notes
            </>
          }
          triggerVariant="ghost"
          question="A fresh start: its next run begins a new chat, without the notes and answers of its earlier runs. The notes above stay for you to read, and its past answers stay in Chat."
          confirmLabel="Clear its notes"
          pendingLabel="Clearing…"
          disabledReason={disabledReason ?? (noNotes ? "It has no notes to clear." : null)}
          danger={false}
        />
        <ConfirmAction
          action={removeAgentAction}
          fields={{ agentId: agent.id }}
          trigger={
            <>
              <TrashIcon size={16} weight="bold" aria-hidden /> Remove
            </>
          }
          triggerVariant="ghost"
          question="It will stop working and leave this list. Its past answers stay in Chat."
          confirmLabel="Remove the agent"
          pendingLabel="Removing…"
          disabledReason={disabledReason}
        />
      </div>
      {nowReason && !disabledReason && !pending ? <p className="mt-2 text-sm text-ink-3">Work now is off: {nowReason.charAt(0).toLowerCase() + nowReason.slice(1)}</p> : null}
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
      {links === "off" ? null : (
        <div className="mt-4">
          <RunLink
            taskId={task.id}
            what="agent"
            link={links ? (links[task.id] ?? null) : null}
            unread={links === null}
            waitSeconds={linkWaitSeconds(limit)}
            disabledReason={disabledReason ?? (task.state === "ended" ? "Its schedule has ended: change its schedule first." : null)}
            stopReason={stopReason}
          />
        </div>
      )}
      {editing ? (
        <div className="mt-4 border-t border-line pt-4">
          <TaskForm
            key={`${agent.id}:${agent.version}:${task.version}`}
            start={{ taskId: task.id, version: task.version, title: agent.name, instruction: agent.goal, schedule: task.schedule, options: task.options, runsFinished: task.runsFinished, state: task.state }}
            agent={{ start: { agentId: agent.id, version: agent.version, runsLimit: agent.runsLimit, useMemory: agent.useMemory } }}
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

export function AgentList({ agents, limit, links, disabledReason, stopReason, serverNow }: { agents: AgentView[]; limit: ScheduledLimit; links: PageLinks; disabledReason: string | null; stopReason: string | null; serverNow: number }) {
  return (
    <ul className="grid gap-4">
      {agents.map((v) => (
        <AgentCard key={v.agent.id} view={v} limit={limit} links={links} disabledReason={disabledReason} stopReason={stopReason} serverNow={serverNow} />
      ))}
    </ul>
  );
}
