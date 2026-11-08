"use client";

import { PlayIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { useActionState } from "react";
import { tryFailureAction, type FailureTrialState } from "@/app/app/tasks/failure-actions";
import { buttonClasses } from "@/components/ui/button";
import type { FailureKind } from "@/core/realityloop/failure-futures";

const IDLE: FailureTrialState = { status: "idle" };

/** Starts a trial of one failure scenario (ADR 0135). */
export function TryFailure({ proposalId, taskId, kind, again, disabled }: { proposalId: string; taskId: string; kind: FailureKind; again: boolean; disabled: boolean }) {
  const [state, action, pending] = useActionState(tryFailureAction, IDLE);
  return (
    <form action={action} className="grid gap-2">
      <input type="hidden" name="proposalId" value={proposalId} />
      <input type="hidden" name="taskId" value={taskId} />
      <input type="hidden" name="kind" value={kind} />
      <div>
        <button type="submit" disabled={pending || disabled || state.status === "started"} className={buttonClasses("secondary", "sm")}>
          <PlayIcon size={16} weight="bold" aria-hidden />
          {pending ? "Writing the test…" : state.status === "started" ? "Trial started" : again ? "Try it again" : "Try this failure"}
        </button>
      </div>
      {state.status === "error" ? (
        <p role="alert" className="flex items-start gap-2 text-sm text-failed">
          <WarningCircleIcon size={16} weight="fill" className="mt-0.5 shrink-0 text-failed" aria-hidden /> {state.message}
        </p>
      ) : null}
    </form>
  );
}
