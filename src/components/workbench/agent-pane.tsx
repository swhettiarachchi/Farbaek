"use client";

/**
 * The Agent pane of Build's workspace (stage 202, ADR 0219): the open task as a conversation. The person's request, then the
 * agent's side: its plan, the control to approve it, the live steps, the way to answer or stop it, and the result. Under it,
 * the box for the next request, or for a message to the agent while it is working.
 *
 * It reuses the build flow's own parts (`ApproveBuild`, `StartRun`, `EventRow`, `ApprovalCard`, `MessageBar`,
 * `PromptComposer`), each told that it is in the workspace, so approving and starting come back here.
 */
import { ArrowRightIcon, CaretDownIcon, CheckIcon, ListChecksIcon, PencilSimpleLineIcon, ShieldCheckIcon, StopCircleIcon, WarningCircleIcon } from "@phosphor-icons/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { cancelBuildRunAction } from "@/app/app/build/actions";
import { TaskStateBadge } from "@/components/app/primitives";
import { BrandMark } from "@/components/brand/brand-mark";
import { BrandLogo } from "@/components/brand/brand-logo";
import { ApproveBuild } from "@/components/build/approve-build";
import { PromptComposer } from "@/components/build/prompt-composer";
import { ApprovalCard, EventRow, MessageBar } from "@/components/build/run-live";
import { RunStatusBadge } from "@/components/build/run-status";
import { StartRun } from "@/components/build/start-run";
import { Menu } from "@/components/chat/primitives";
import { buttonClasses } from "@/components/ui/button";
import { workbenchPath } from "@/core/agent/build-surface";
import { EFFORT_LABELS } from "@/core/agent/effort";
import { modelName } from "@/core/billing/model-names";
import type { RunEventView, RunView } from "@/server/cloud-agent/store";
import type { WorkbenchData, WorkbenchPlan } from "@/server/workbench/types";

export function AgentPane({ data, run, events, usage, live }: { data: WorkbenchData; run: RunView | null; events: RunEventView[]; usage: WorkbenchData["usage"]; live: boolean }) {
  const router = useRouter();
  const { project, task, tasks, stage, plan } = data;
  const log = useRef<HTMLDivElement>(null);

  // While the agent works the newest step stays in view, unless the person has scrolled up to read.
  const stick = useRef(true);
  useEffect(() => {
    const el = log.current;
    if (el && live && stick.current) el.scrollTop = el.scrollHeight;
  }, [events.length, live]);

  const lastApproval = [...events].reverse().find((e) => e.kind === "approval");
  // The request just answered leaves at once; the run's own status follows on its next report.
  const [answered, setAnswered] = useState<number | null>(null);
  const waitingOn = run?.status === "waiting" && lastApproval && events.at(-1)?.id === lastApproval.id && lastApproval.id !== answered ? lastApproval : null;

  return (
    <>
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-line px-3">
        {tasks.length > 0 && task ? (
          <Menu
            label="This project's requests"
            align="start"
            items={tasks.map((t) => ({ label: t.title, checked: t.id === task.id, onSelect: () => router.push(workbenchPath(project.id, t.id)) }))}
            trigger={({ ref, open, toggle, id }) => (
              <button ref={ref} type="button" aria-haspopup="menu" aria-expanded={open} aria-controls={open ? id : undefined} onClick={toggle} className="tap inline-flex min-h-10 min-w-0 items-center gap-1.5 rounded-full px-2.5 text-sm font-medium text-ink hover:bg-surface">
                <span className="truncate">{task.title}</span>
                <CaretDownIcon size={14} weight="bold" className="shrink-0 text-ink-3" aria-hidden />
              </button>
            )}
          />
        ) : (
          <p className="px-2.5 text-sm font-medium text-ink">Agent</p>
        )}
        {task ? (
          <span className="ml-auto shrink-0">
            <TaskStateBadge state={task.state} />
          </span>
        ) : null}
      </div>

      <div
        ref={log}
        role="log"
        aria-label="The agent's work on this request"
        aria-busy={live || undefined}
        onScroll={(e) => {
          const el = e.currentTarget;
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
      >
        <div className="grid gap-5 px-4 py-5">
          {!task ? (
            <div className="grid justify-items-center gap-3 py-6 text-center motion-safe:animate-[chat-rise_240ms_cubic-bezier(0.16,1,0.3,1)_both]">
              <BrandLogo height={64} />
              <p className="text-title-4 font-medium tracking-[-0.02em] text-ink">What shall we build in {project.name}?</p>
              <p className="max-w-sm text-sm leading-relaxed text-ink-2">Describe the change. The agent drafts a plan, you approve it, and you watch it work here beside the site and its code.</p>
            </div>
          ) : (
            <>
              {/* The person's side: what they asked for. */}
              <div className="flex justify-end motion-safe:animate-[chat-rise_240ms_cubic-bezier(0.16,1,0.3,1)_both]">
                <div className="max-w-[88%] whitespace-pre-wrap rounded-[1.25rem] rounded-br-md bg-surface px-4 py-2.5 text-body leading-relaxed text-ink shadow-e1 [overflow-wrap:anywhere]">{task.title}</div>
              </div>

              {/* The agent's side. */}
              <div className="motion-safe:animate-[chat-rise_240ms_cubic-bezier(0.16,1,0.3,1)_both] sm:grid sm:grid-cols-[2rem_minmax(0,1fr)] sm:gap-x-3">
                <BrandMark live={live} className="hidden sm:inline-flex" />
                <div className="grid min-w-0 gap-4">
                  {stage === "plan_missing" ? (
                    <div className="grid gap-3">
                      <p className="text-sm leading-relaxed text-ink-2">There&apos;s no plan to show for this request: it couldn&apos;t be drafted, or it couldn&apos;t be read just now. Nothing was charged for a draft that didn&apos;t finish. You can draft it again or write it yourself on the task&apos;s page.</p>
                      <Link href={`/app/tasks/${task.id}`} className={buttonClasses("secondary", "sm", "w-fit")}>
                        <PencilSimpleLineIcon size={16} weight="bold" aria-hidden /> Write the plan
                      </Link>
                    </div>
                  ) : null}

                  {plan ? <PlanBlock plan={plan} open={stage === "plan_waiting"} /> : null}

                  {stage === "plan_waiting" && plan?.approve ? (
                    <div className="@container grid gap-3 rounded-md border border-line bg-surface p-4 shadow-e1">
                      <ApproveBuild
                        surface="workbench"
                        taskId={task.id}
                        version={plan.approve.version}
                        expectedTaskVersion={task.version}
                        sha256={plan.approve.sha256}
                        estimates={plan.approve.estimates}
                        disabledReason={data.buildOff}
                        skills={plan.approve.skills}
                        suggested={plan.approve.suggested}
                        projectSkills={plan.approve.projectSkills}
                        heldSkills={plan.approve.heldSkills}
                        skillsHref={`/app/projects/${project.id}#skills`}
                        kitPro={plan.approve.kitPro}
                        defaultCap={plan.approve.defaultCap}
                        defaultTheme={plan.approve.defaultTheme}
                        firstBuildNote={plan.approve.firstBuildNote}
                      />
                      <p className="text-xs leading-relaxed text-ink-3">
                        Approving covers exactly this plan. The agent works on a copy and nothing changes in your project until you review its result.{" "}
                        <Link href={`/app/tasks/${task.id}`} className="font-medium text-ink-2 underline underline-offset-4 hover:text-ink">
                          Edit the plan
                        </Link>
                      </p>
                    </div>
                  ) : null}

                  {stage === "ready" && !run ? (
                    <div className="grid gap-2 rounded-md border border-line bg-surface p-4 shadow-e1">
                      <p className="text-sm text-ink-2">The plan is approved. Start the agent on it when you&apos;re ready.</p>
                      <StartRun taskId={task.id} disabledReason={data.buildOff} compact surface="workbench" />
                    </div>
                  ) : null}

                  {run ? <RunBlock run={run} events={events} usage={usage} live={live} /> : null}

                  {waitingOn && run && data.canAnswer ? <ApprovalCard run={run} request={waitingOn} onAnswered={() => setAnswered(waitingOn.id)} /> : null}
                  {waitingOn && !data.canAnswer ? <p className="text-sm text-ink-2">The agent is waiting for the person who started it to approve a command.</p> : null}

                  {stage === "ready" && run ? (
                    <div className="grid gap-2 rounded-md border border-line bg-surface p-4 shadow-e1">
                      <p className="text-sm text-ink-2">The plan is still approved. You can start the agent on it again.</p>
                      <StartRun taskId={task.id} disabledReason={data.buildOff} compact surface="workbench" />
                    </div>
                  ) : null}

                  {stage === "change_waiting" ? (
                    <div className="grid gap-3 rounded-md border border-approval/30 bg-approval/[0.04] p-4">
                      <p className="text-sm font-medium text-ink">The change is ready for you to review.</p>
                      <p className="text-sm leading-relaxed text-ink-2">Preview shows the site with it and as it is now. Nothing is in your project until you apply it.</p>
                      <Link href={`/app/tasks/${task.id}#change`} className={buttonClasses("primary", "sm", "w-fit")}>
                        Review and apply <ArrowRightIcon size={16} weight="bold" aria-hidden />
                      </Link>
                    </div>
                  ) : null}

                  {stage === "settled" || stage === "cancelled" || stage === "under_way" ? (
                    <p className="text-sm leading-relaxed text-ink-2">
                      {stage === "cancelled"
                        ? "This request was cancelled. Its history is kept."
                        : stage === "under_way"
                          ? "The agent's part is done. The request is still moving: its change is being applied or checked, or it's waiting on someone."
                          : "This request is finished."}{" "}
                      <Link href={`/app/tasks/${task.id}`} className="font-medium text-ink underline underline-offset-4">
                        {stage === "under_way" ? "See where it stands" : "See its checks, proof and undo"}
                      </Link>
                      .
                    </p>
                  ) : null}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="shrink-0 border-t border-line bg-canvas-2 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:pb-3">
        {live && run && data.canAnswer ? (
          <div className="grid gap-2">
            <MessageBar runId={run.id} />
            <StopRun runId={run.id} />
          </div>
        ) : live ? (
          <p className="px-2 text-sm text-ink-2">The agent is working. Only the person who started it, an owner or an admin can message or stop it.</p>
        ) : (
          <PromptComposer mode="app" size="compact" projectId={project.id} surface="workbench" disabledReason={data.demo ? "The sample workspace can't start a build. Sign in to build for real." : data.editOff} />
        )}
      </div>
    </>
  );
}

/** The plan, in the plan card's own words. Open while it waits for approval, folded once it is approved. */
function PlanBlock({ plan, open }: { plan: WorkbenchPlan; open: boolean }) {
  return (
    <details open={open} className="group rounded-md border border-line bg-surface shadow-e1">
      <summary className="flex min-h-11 cursor-pointer list-none items-start gap-2.5 px-4 py-3 [&::-webkit-details-marker]:hidden">
        <ListChecksIcon size={20} className="mt-0.5 shrink-0 text-ink-3" aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block text-xs font-medium text-ink-3">{plan.approved ? "The approved plan" : "The plan"}</span>
          <span className="block text-sm font-medium leading-snug text-ink">{plan.outcome}</span>
        </span>
        <CaretDownIcon size={16} weight="bold" className="mt-1 shrink-0 text-ink-3 transition-transform duration-150 group-open:rotate-180" aria-hidden />
      </summary>
      <div className="grid gap-4 border-t border-line px-4 py-4 text-sm">
        <div className="grid gap-1.5">
          <p className="font-medium text-ink">What will change</p>
          <p className="text-ink-2">{plan.changes}</p>
          {plan.resources.length ? <p className="break-all font-mono text-xs text-ink-3">{plan.resources.join(", ")}</p> : <p className="text-ink-3">Anywhere in the project.</p>}
        </div>
        {plan.checks.length ? (
          <div className="grid gap-1.5">
            <p className="font-medium text-ink">How it will be checked</p>
            <ul className="grid list-disc gap-1 pl-5 text-ink-2 marker:text-ink-3">
              {plan.checks.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {plan.kept.length ? (
          <div className="grid gap-1.5">
            <p className="flex items-center gap-1.5 font-medium text-ink">
              <ShieldCheckIcon size={16} className="shrink-0 text-ink-3" aria-hidden /> What stays untouched
            </p>
            <ul className="grid gap-1 text-ink-2">
              {plan.kept.map((k) => (
                <li key={k}>{k}</li>
              ))}
            </ul>
          </div>
        ) : null}
        <div className="grid gap-1.5">
          <p className="font-medium text-ink">If something goes wrong</p>
          <p className="text-ink-2">{plan.recovery}</p>
        </div>
        {plan.questions.length ? (
          <div className="grid gap-1.5 rounded-sm border border-approval/30 bg-approval/[0.04] p-3">
            <p className="font-medium text-approval">Questions to settle</p>
            <ul className="grid gap-1 text-ink">
              {plan.questions.map((q) => (
                <li key={q}>{q}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </details>
  );
}

/** The run: where it stands in a sentence, then every step it recorded, newest last. */
function RunBlock({ run, events, usage, live }: { run: RunView; events: RunEventView[]; usage: WorkbenchData["usage"]; live: boolean }) {
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <RunStatusBadge status={run.status} />
        <p className="text-sm text-ink-2">
          {live ? (run.steps === 0 ? "Starting" : <>Step <span className="tabular font-medium text-ink">{run.steps}</span></>) : <><span className="tabular font-medium text-ink">{run.steps}</span> {run.steps === 1 ? "step" : "steps"}</>}
          {live ? " of a" : " in a"} {EFFORT_LABELS[run.effort].title.toLowerCase()} run{run.model ? ` on ${modelName(run.model)}` : ""}.
          {usage?.share ? <> {live ? "Used so far" : "Used"}: <span className="tabular font-medium text-ink">{usage.share}</span> of this month&apos;s AI usage.</> : null}
        </p>
      </div>
      {events.length === 0 ? (
        <p className="text-sm text-ink-3">{live ? "The agent is getting ready…" : "This run recorded no steps."}</p>
      ) : (
        <ol className="relative before:absolute before:bottom-6 before:left-[13px] before:top-2 before:w-px before:bg-line">
          {events.map((e, i) => (
            <EventRow key={e.id} e={e} latest={live && i === events.length - 1} />
          ))}
        </ol>
      )}
      {!live && run.outcome ? (
        <div className="grid gap-1.5 rounded-md border border-line bg-surface p-4 shadow-e1">
          <p className="flex items-center gap-2 text-sm font-medium text-ink">
            <CheckIcon size={16} weight="bold" className="shrink-0 text-ink-3" aria-hidden /> {run.status === "finished" ? "The agent finished" : "What happened"}
          </p>
          <p className="text-sm leading-relaxed text-ink-2">{run.outcome}</p>
          {run.finish ? <p className="text-sm leading-relaxed text-ink">{run.finish.summary}</p> : null}
        </div>
      ) : null}
    </div>
  );
}

function StopRun({ runId }: { runId: string }) {
  const [stopping, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-wrap items-center gap-3 px-1">
      <button
        type="button"
        disabled={stopping}
        onClick={() =>
          start(async () => {
            setError(null);
            const r = await cancelBuildRunAction(runId);
            if (r.status === "error") setError(r.message);
          })
        }
        className={buttonClasses("secondary", "sm")}
      >
        <StopCircleIcon size={16} weight="bold" aria-hidden /> {stopping ? "Stopping…" : "Stop the agent"}
      </button>
      {error ? (
        <p role="alert" className="flex items-start gap-2 text-sm text-failed">
          <WarningCircleIcon size={16} weight="fill" className="mt-0.5 shrink-0" aria-hidden /> {error}
        </p>
      ) : null}
    </div>
  );
}
