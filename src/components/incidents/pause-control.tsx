"use client";

import { CheckCircleIcon, HandPalmIcon, PlayIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { useId, useState, useTransition } from "react";
import { pauseAgentsAction, resumeAgentsAction, type IncidentActionState } from "@/app/app/incidents/actions";
import { buttonClasses } from "@/components/ui/button";
import { RelativeTime } from "@/components/ui/local-time";

/**
 * The emergency pause (ADR 0083): anyone who contributes stops the
 * workspace's agents at once; an owner or admin resumes them. Says what a
 * pause does and what it can't undo.
 */
export function PauseControl({
  paused,
  pauseReason,
  resumeReason,
}: {
  paused: { at: string; reason: string | null } | null;
  /** Why this person can't pause here, or null. */
  pauseReason: string | null;
  /** Why this person can't resume, or null. */
  resumeReason: string | null;
}) {
  const id = useId();
  const [reason, setReason] = useState("");
  const [state, setState] = useState<IncidentActionState>({ status: "idle" });
  const [pending, start] = useTransition();
  const run = (action: () => Promise<IncidentActionState>) => start(async () => setState(await action()));

  return (
    <div className="grid gap-4">
      {paused ? (
        <>
          <p className="flex items-start gap-2.5 text-[15px]">
            <HandPalmIcon size={20} weight="bold" className="mt-0.5 shrink-0 text-failed" aria-hidden />
            <span>
              <span className="font-medium">Agents are paused</span> since <RelativeTime iso={paused.at} />
              {paused.reason ? `: ${paused.reason}` : "."} No cloud runs start, desktop agents&apos; proposals are refused, and nothing applies on its own. People can still review
              and approve changes.
            </span>
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={() => run(resumeAgentsAction)} disabled={pending || Boolean(resumeReason)} className={buttonClasses("secondary", "sm")}>
              <PlayIcon size={16} weight="bold" aria-hidden /> {pending ? "Resuming…" : "Resume agents"}
            </button>
            {resumeReason ? <span className="text-sm text-ink-3">{resumeReason}</span> : null}
          </div>
        </>
      ) : (
        <>
          <p className="flex items-start gap-2.5 text-[15px]">
            <CheckCircleIcon size={20} weight="bold" className="mt-0.5 shrink-0 text-verified" aria-hidden />
            <span>
              <span className="font-medium">Agents are running.</span> Pausing stops live cloud runs at once, refuses desktop agents&apos; proposals and anything that would apply
              on its own, until an owner or admin resumes them.
            </span>
          </p>
          <div className="grid gap-1.5">
            <label htmlFor={id} className="text-sm font-medium">
              Why, if you know <span className="font-normal text-ink-3">(optional)</span>
            </label>
            <input
              id={id}
              value={reason}
              maxLength={300}
              onChange={(e) => setReason(e.target.value)}
              disabled={Boolean(pauseReason)}
              placeholder="For example: the agent is changing files it shouldn't."
              className="min-h-11 rounded-sm border border-line bg-surface px-3 text-base sm:text-sm"
            />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={() => run(() => pauseAgentsAction({ reason }))} disabled={pending || Boolean(pauseReason)} className={buttonClasses("danger", "sm")}>
              <HandPalmIcon size={16} weight="bold" aria-hidden /> {pending ? "Pausing…" : "Pause agents now"}
            </button>
            {pauseReason ? <span className="text-sm text-ink-3">{pauseReason}</span> : null}
          </div>
        </>
      )}
      <p className="text-xs leading-relaxed text-ink-3">A pause stops what agents would do next. It can&apos;t undo changes already applied, or anything done outside Farbaek.</p>
      {state.status === "error" ? (
        <p role="alert" className="flex items-start gap-2 text-sm text-failed">
          <WarningCircleIcon size={16} className="mt-0.5 shrink-0" aria-hidden /> {state.message}
        </p>
      ) : state.status === "done" ? (
        <p role="status" className="flex items-start gap-2 text-sm text-verified">
          <CheckCircleIcon size={16} className="mt-0.5 shrink-0" aria-hidden /> {state.message}
        </p>
      ) : null}
    </div>
  );
}
