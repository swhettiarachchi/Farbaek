"use client";

import { CheckCircleIcon, HandPalmIcon, PauseCircleIcon, PlayIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { useId, useState, useTransition } from "react";
import { pauseAgentsAction, resumeAgentsAction, type IncidentActionState } from "@/app/app/incidents/actions";
import { buttonClasses } from "@/components/ui/button";
import { inputClasses, LABEL_CLASSES } from "@/components/ui/field";
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
          <p className="flex items-start gap-2.5 text-body">
            <PauseCircleIcon size={20} weight="fill" className="mt-0.5 shrink-0 text-caution" aria-hidden />
            <span>
              <span className="font-medium">Agents are paused</span> since <RelativeTime iso={paused.at} />
              {paused.reason ? `: ${paused.reason}` : "."} No cloud runs start, desktop agents&apos; changes are refused, and nothing applies on its own. People can still review
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
          <p className="flex items-start gap-2.5 text-body">
            <CheckCircleIcon size={20} weight="fill" className="mt-0.5 shrink-0 text-verified" aria-hidden />
            <span>
              <span className="font-medium">Agents are running.</span> Pausing stops live cloud runs at once, and refuses desktop agents&apos; changes and anything that would
              apply on its own. It lasts until an owner or admin resumes them.
            </span>
          </p>
          <div className="grid gap-1.5">
            <label htmlFor={id} className={LABEL_CLASSES}>
              Why, if you know <span className="font-normal text-ink-3">(optional)</span>
            </label>
            <input
              id={id}
              value={reason}
              maxLength={300}
              onChange={(e) => setReason(e.target.value)}
              disabled={Boolean(pauseReason)}
              placeholder="For example: the agent is changing files it shouldn't."
              className={inputClasses()}
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
          <WarningCircleIcon size={16} weight="fill" className="mt-0.5 shrink-0 text-failed" aria-hidden />
          <span>{state.message}</span>
        </p>
      ) : state.status === "done" ? (
        <p role="status" className="flex items-start gap-2 text-sm text-verified">
          <CheckCircleIcon size={16} weight="fill" className="mt-0.5 shrink-0 text-verified" aria-hidden />
          <span>{state.message}</span>
        </p>
      ) : null}
    </div>
  );
}
