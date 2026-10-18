"use client";

import {
  ArrowRightIcon,
  ChatTextIcon,
  CheckIcon,
  EyeIcon,
  FilePlusIcon,
  FlagCheckeredIcon,
  InfoIcon,
  MagnifyingGlassIcon,
  PencilSimpleLineIcon,
  ProhibitIcon,
  ShieldWarningIcon,
  StopCircleIcon,
  TerminalWindowIcon,
  WarningCircleIcon,
  XIcon,
} from "@phosphor-icons/react";
import type { Icon } from "@phosphor-icons/react";
import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { answerBuildApprovalAction, cancelBuildRunAction } from "@/app/app/build/actions";
import { buttonClasses } from "@/components/ui/button";
import { CLOUD_RUN_MODE_LABELS, isLive } from "@/core/agent/cloud-run";
import { EFFORT_LABELS } from "@/core/agent/routing";
import { latestActivity, runFiles, runPhase } from "@/core/agent/run-phase";
import type { RunEventView, RunView } from "@/server/cloud-agent/store";
import { AgentCore } from "./agent-core";
import { RunStatusBadge } from "./run-status";

const POLL_MS = 1_500;

const TOOL_ICON: Record<string, Icon> = {
  read_file: EyeIcon,
  list_files: MagnifyingGlassIcon,
  search_files: MagnifyingGlassIcon,
  write_file: PencilSimpleLineIcon,
  edit_file: PencilSimpleLineIcon,
  run_command: TerminalWindowIcon,
  finish: FlagCheckeredIcon,
};

// On phones the page is three panes you can swipe between; on wide screens all three show at once.
const PANES = [
  { id: "steps", label: "Steps" },
  { id: "files", label: "Files" },
  { id: "run", label: "Run" },
] as const;
type PaneId = (typeof PANES)[number]["id"];
// Written out in full so Tailwind sees them. Phones only, and only with motion allowed.
const PANE_ENTER = {
  right: "max-lg:motion-safe:animate-[pane-from-right_240ms_cubic-bezier(0.16,1,0.3,1)]",
  left: "max-lg:motion-safe:animate-[pane-from-left_240ms_cubic-bezier(0.16,1,0.3,1)]",
} as const;

const str = (v: unknown) => (typeof v === "string" ? v : "");

function EventRow({ e, latest }: { e: RunEventView; latest: boolean }) {
  const p = e.payload;
  let icon: Icon = InfoIcon;
  let body: React.ReactNode;
  let tone = "text-ink-2";
  if (e.kind === "model") {
    icon = ChatTextIcon;
    body = <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-ink">{str(p.text)}</p>;
  } else if (e.kind === "tool") {
    icon = TOOL_ICON[str(p.tool)] ?? InfoIcon;
    const status = str(p.status);
    tone = status === "done" ? "text-ink-2" : status === "failed" ? "text-failed" : "text-approval";
    body = (
      <div className="min-w-0">
        <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
          <span className="font-mono text-xs text-ink-3">{str(p.tool)}</span>
          <span className="break-all font-mono text-[13px] text-ink">{str(p.target)}</span>
          {status !== "done" ? <span className={`text-xs font-medium ${tone}`}>{status === "failed" ? "Failed" : status === "denied" ? "Not allowed" : "Declined"}</span> : null}
        </p>
        {status !== "done" && str(p.detail) ? <p className="mt-1 text-xs text-ink-3">{str(p.detail)}</p> : null}
      </div>
    );
  } else if (e.kind === "command") {
    icon = TerminalWindowIcon;
    const code = typeof p.exitCode === "number" ? p.exitCode : null;
    tone = code === 0 ? "text-verified" : "text-failed";
    body = (
      <details className="group min-w-0">
        <summary className="flex cursor-pointer list-none flex-wrap items-baseline gap-x-2 text-sm">
          <span className="break-all font-mono text-[13px] text-ink">{str(p.command)}</span>
          <span className={`text-xs font-medium ${tone}`}>{code === 0 ? "Passed" : code === null ? "Didn't finish" : `Exit ${code}`}</span>
          <span className="text-xs text-ink-3 group-open:hidden">Show output</span>
        </summary>
        <pre className="mt-2 max-h-72 overflow-auto rounded-sm bg-media p-3 font-mono text-xs leading-relaxed text-media-ink">{str(p.output) || "No output."}</pre>
      </details>
    );
  } else if (e.kind === "approval") {
    icon = ShieldWarningIcon;
    tone = "text-approval";
    body = (
      <p className="text-sm">
        Asked to run <span className="break-all font-mono text-[13px] text-ink">{str(p.display)}</span>
      </p>
    );
  } else {
    body = <p className="text-sm text-ink-2">{str(p.text)}</p>;
  }
  const RowIcon = icon;
  return (
    <li className="relative grid grid-cols-[28px_minmax(0,1fr)] gap-3 pb-5 motion-safe:animate-[usage-in_220ms_cubic-bezier(0.16,1,0.3,1)]">
      <span className={`relative z-10 mt-0.5 inline-flex size-7 items-center justify-center rounded-full border border-line bg-surface ${tone}`}>
        <RowIcon size={15} weight="bold" aria-hidden />
        {latest ? <span className="absolute inset-0 rounded-full ring-2 ring-accent/40 motion-safe:animate-ping" aria-hidden /> : null}
      </span>
      <div className="min-w-0 pt-1">{body}</div>
    </li>
  );
}

function ApprovalCard({ run, request, onAnswered }: { run: RunView; request: RunEventView; onAnswered: () => void }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const p = request.payload;
  const answer = (approved: boolean) =>
    start(async () => {
      setError(null);
      const r = await answerBuildApprovalAction({ runId: run.id, requestId: str(p.requestId), approved, bindingHash: str(p.bindingHash) });
      if (r.status === "error") setError(r.message);
      else onAnswered();
    });
  return (
    <section
      aria-labelledby="approval-heading"
      className="grid gap-3 rounded-md border border-approval/40 bg-approval/[0.06] p-5 max-lg:max-h-[62dvh] max-lg:overflow-y-auto max-lg:rounded-lg max-lg:bg-surface max-lg:shadow-e3 max-lg:motion-safe:animate-[sheet-up_320ms_cubic-bezier(0.16,1,0.3,1)]"
    >
      <span className="mx-auto -mt-1 h-1 w-10 rounded-full bg-line lg:hidden" aria-hidden />
      <h2 id="approval-heading" className="flex items-center gap-2 text-base font-medium">
        <ShieldWarningIcon size={18} weight="bold" className="text-approval" aria-hidden /> The agent wants to run a command
      </h2>
      <pre className="overflow-x-auto rounded-sm bg-media p-3 font-mono text-[13px] text-media-ink">{str(p.display)}</pre>
      <dl className="grid gap-1 text-sm">
        <div className="flex gap-2">
          <dt className="text-ink-3">Why it asks</dt>
          <dd className="text-ink">{str(p.reason)}</dd>
        </div>
        {str(p.why) ? (
          <div className="flex gap-2">
            <dt className="shrink-0 text-ink-3">The agent says</dt>
            <dd className="text-ink-2">{str(p.why)}</dd>
          </div>
        ) : null}
      </dl>
      <p className="text-xs text-ink-3">It runs in the run&apos;s isolated sandbox, never on Farbaek&apos;s servers or your computer.</p>
      {error ? (
        <p role="alert" className="flex items-start gap-2 text-sm text-failed">
          <WarningCircleIcon size={16} className="mt-0.5 shrink-0" aria-hidden /> {error}
        </p>
      ) : null}
      <div className="grid grid-cols-2 gap-3 sm:flex sm:flex-wrap">
        <button type="button" disabled={pending} onClick={() => answer(true)} className={buttonClasses("primary", "sm")}>
          <CheckIcon size={16} weight="bold" aria-hidden /> Run it
        </button>
        <button type="button" disabled={pending} onClick={() => answer(false)} className={buttonClasses("secondary", "sm")}>
          <XIcon size={16} weight="bold" aria-hidden /> Don&apos;t run it
        </button>
      </div>
    </section>
  );
}

/** Pane switching for phones: a segmented control, plus a horizontal swipe that leaves vertical scrolling alone. */
function usePanes() {
  const [active, setActive] = useState<PaneId>("steps");
  const [from, setFrom] = useState<"left" | "right">("right");
  const touch = useRef<{ x: number; y: number } | null>(null);

  const go = (next: PaneId) => {
    if (next === active) return;
    const i = PANES.findIndex((p) => p.id === active);
    const j = PANES.findIndex((p) => p.id === next);
    setFrom(j > i ? "right" : "left");
    setActive(next);
  };

  const swipe = {
    onTouchStart: (e: React.TouchEvent) => {
      // Code blocks scroll sideways on their own.
      const t = e.target as HTMLElement;
      touch.current = t.closest("pre") ? null : { x: e.touches[0]!.clientX, y: e.touches[0]!.clientY };
    },
    onTouchEnd: (e: React.TouchEvent) => {
      const start = touch.current;
      touch.current = null;
      if (!start) return;
      const dx = e.changedTouches[0]!.clientX - start.x;
      const dy = e.changedTouches[0]!.clientY - start.y;
      if (Math.abs(dx) < 56 || Math.abs(dx) < Math.abs(dy) * 1.6) return;
      const i = PANES.findIndex((p) => p.id === active);
      const next = PANES[Math.min(PANES.length - 1, Math.max(0, i + (dx < 0 ? 1 : -1)))]!;
      go(next.id);
    },
  };

  const paneClass = (id: PaneId) => `${active === id ? `block ${PANE_ENTER[from]}` : "hidden"} lg:block`;

  return { active, go, swipe, paneClass };
}

export function RunLive({ initialRun, initialEvents, canAnswer }: { initialRun: RunView; initialEvents: RunEventView[]; canAnswer: boolean }) {
  const [run, setRun] = useState(initialRun);
  const [events, setEvents] = useState(initialEvents);
  const [cancelling, startCancel] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const cursor = useRef(initialEvents.at(-1)?.id ?? 0);
  const live = isLive(run.status);
  const panes = usePanes();

  useEffect(() => {
    if (!live) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const res = await fetch(`/app/build/${run.id}/events?after=${cursor.current}`, { cache: "no-store" });
        if (res.ok) {
          const body = (await res.json()) as { data: { run: RunView; events: RunEventView[] } };
          if (!stopped) {
            setRun(body.data.run);
            if (body.data.events.length) {
              cursor.current = body.data.events.at(-1)!.id;
              setEvents((prev) => [...prev, ...body.data.events]);
            }
          }
        }
      } catch {
        // A missed poll is retried on the next tick.
      }
      if (!stopped) timer = setTimeout(poll, POLL_MS);
    };
    timer = setTimeout(poll, POLL_MS);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [live, run.id]);

  const lastApproval = [...events].reverse().find((e) => e.kind === "approval");
  const waitingOn = run.status === "waiting" && lastApproval && events.at(-1)?.id === lastApproval.id ? lastApproval : null;
  const latest = events.at(-1);
  const phase = runPhase(run.status, latest);
  const files = runFiles(events);
  const sheet = Boolean(waitingOn && canAnswer);

  return (
    <div className="grid gap-6">
      <AgentCore phase={phase} activity={live ? latestActivity(latest) : run.outcome}>
        <ul className="flex flex-wrap gap-2 text-xs" aria-label="Run details">
          <li className="inline-flex h-7 items-center gap-1.5 rounded-full border border-line bg-surface px-3 text-ink-2">
            Steps <span className="tabular font-medium text-ink">{run.steps}</span>
          </li>
          <li className="inline-flex h-7 items-center gap-1.5 rounded-full border border-line bg-surface px-3 text-ink-2">
            {EFFORT_LABELS[run.effort].title}
          </li>
          <li className="inline-block h-7 max-w-full truncate rounded-full border border-line bg-surface px-3 font-mono leading-[26px] text-ink-2">{run.model ?? "Choosing a model"}</li>
        </ul>
      </AgentCore>

      {sheet ? (
        <>
          {/* On phones the approval rises as a sheet above the tab bar; on wide screens it sits in the page. */}
          <div className="max-lg:fixed max-lg:inset-x-0 max-lg:bottom-[calc(4rem+env(safe-area-inset-bottom))] max-lg:z-40 max-lg:px-3 max-lg:pb-3">
            <ApprovalCard run={run} request={waitingOn!} onAnswered={() => setRun((r) => ({ ...r, status: "working" }))} />
          </div>
        </>
      ) : null}
      {waitingOn && !canAnswer ? (
        <p className="rounded-md border border-approval/40 bg-approval/[0.06] p-4 text-sm">The agent is waiting for the person who started the run to approve a command.</p>
      ) : null}

      <div className="lg:hidden">
        <div className="flex w-full rounded-full border border-line bg-surface p-1 shadow-e1" role="group" aria-label="Show">
          {PANES.map((p) => (
            <button
              key={p.id}
              type="button"
              aria-pressed={panes.active === p.id}
              aria-controls={`pane-${p.id}`}
              onClick={() => panes.go(p.id)}
              className={`flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-full px-4 text-sm transition-colors duration-[160ms] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${panes.active === p.id ? "bg-primary font-medium text-on-primary" : "text-ink-2"}`}
            >
              {p.label}
              {p.id === "files" && files.changed.length > 0 ? <span className="tabular text-xs opacity-80">{files.changed.length}</span> : null}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-6 [touch-action:pan-y] lg:grid-cols-[minmax(0,1fr)_320px] lg:grid-rows-[auto_1fr] lg:items-start" {...panes.swipe}>
        <div id="pane-steps" className={`${panes.paneClass("steps")} lg:row-span-2`}>
          <section aria-labelledby="steps-heading" className="rounded-md border border-line bg-surface p-5 shadow-e1 sm:p-6">
            <h2 id="steps-heading" className="mb-5 text-lg font-medium">
              Steps
            </h2>
            {events.length === 0 ? (
              <p className="text-sm text-ink-3">{live ? "The agent is getting ready…" : "This run recorded no steps."}</p>
            ) : (
              <ol className="relative before:absolute before:bottom-6 before:left-[13px] before:top-2 before:w-px before:bg-line" aria-live="polite">
                {events.map((e, i) => (
                  <EventRow key={e.id} e={e} latest={live && i === events.length - 1} />
                ))}
              </ol>
            )}
          </section>
        </div>

        <div id="pane-run" className={`${panes.paneClass("run")} lg:col-start-2 lg:row-start-1`}>
          <div className="grid gap-4">
            <section className="rounded-md border border-line bg-surface p-5 shadow-e1">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-base font-medium">Run</h2>
                <RunStatusBadge status={run.status} />
              </div>
              <dl className="mt-4 grid gap-2 text-sm">
                <div className="flex justify-between gap-3">
                  <dt className="text-ink-3">Effort</dt>
                  <dd>{EFFORT_LABELS[run.effort].title}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-ink-3">Model</dt>
                  <dd className="font-mono text-xs">{run.model ?? "Choosing"}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-ink-3">Steps</dt>
                  <dd className="tabular">{run.steps}</dd>
                </div>
              </dl>
              <p className="mt-4 border-t border-line pt-3 text-xs leading-relaxed text-ink-3">{CLOUD_RUN_MODE_LABELS[run.mode]}</p>
              {live ? (
                <button
                  type="button"
                  disabled={cancelling}
                  onClick={() =>
                    startCancel(async () => {
                      const r = await cancelBuildRunAction(run.id);
                      if (r.status === "error") setError(r.message);
                    })
                  }
                  className={buttonClasses("secondary", "sm", "mt-4 w-full")}
                >
                  <StopCircleIcon size={16} weight="bold" aria-hidden /> {cancelling ? "Stopping…" : "Stop the run"}
                </button>
              ) : null}
              {error ? <p role="alert" className="mt-2 text-sm text-failed">{error}</p> : null}
            </section>

            {run.outcome ? (
              <section className="rounded-md border border-line bg-surface p-5 shadow-e1">
                <h2 className="flex items-center gap-2 text-base font-medium">
                  {run.status === "finished" ? <FlagCheckeredIcon size={18} weight="bold" aria-hidden /> : <ProhibitIcon size={18} weight="bold" aria-hidden />} Outcome
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-ink-2">{run.outcome}</p>
                {run.finish ? <p className="mt-3 text-sm leading-relaxed text-ink">{run.finish.summary}</p> : null}
                {run.proposalId ? (
                  <Link href={`/app/tasks/${run.taskId}`} className={buttonClasses("primary", "sm", "mt-4 w-full")}>
                    Review the change <ArrowRightIcon size={16} weight="bold" aria-hidden />
                  </Link>
                ) : null}
              </section>
            ) : null}
          </div>
        </div>

        <div id="pane-files" className={`${panes.paneClass("files")} lg:col-start-2 lg:row-start-2`}>
          <section aria-labelledby="files-heading" className="rounded-md border border-line bg-surface p-5 shadow-e1">
            <h2 id="files-heading" className="flex items-baseline justify-between gap-3 text-base font-medium">
              Files <span className="font-mono text-xs font-normal text-ink-3">{`// ${files.read} read`}</span>
            </h2>
            {files.changed.length === 0 ? (
              <p className="mt-3 text-sm text-ink-3">{live ? "No files changed yet." : "This run changed no files."}</p>
            ) : (
              <ul className="mt-3 grid gap-2">
                {files.changed.map((f) => {
                  const FileIcon = f.change === "written" ? FilePlusIcon : PencilSimpleLineIcon;
                  return (
                    <li key={f.path} className="flex items-center gap-2.5 text-sm">
                      <FileIcon size={16} weight="bold" className="shrink-0 text-accent" aria-hidden />
                      <span className="min-w-0 flex-1 truncate font-mono text-[13px]" title={f.path}>
                        {f.path}
                      </span>
                      <span className="shrink-0 text-xs text-ink-3">
                        {f.change === "written" ? "Written" : "Edited"}
                        {f.times > 1 ? ` ${f.times} times` : ""}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
            <p className="mt-4 border-t border-line pt-3 text-xs leading-relaxed text-ink-3">These changes are in the run&apos;s copy. Your project changes only when you review and apply them.</p>
          </section>
        </div>
      </div>
      {/* Room to scroll the last steps above the approval sheet on phones. */}
      {sheet ? <div className="h-80 lg:hidden" aria-hidden /> : null}
    </div>
  );
}
