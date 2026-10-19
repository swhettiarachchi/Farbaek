"use client";

import { ArrowCounterClockwiseIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { useActionState } from "react";
import { setLiveAction, type PublishState } from "@/app/app/projects/[projectId]/publish-actions";
import { buttonClasses } from "@/components/ui/button";

const IDLE: PublishState = { status: "idle" };

/** Make an earlier version live again, or take the site offline (no deployment id). Says when it couldn't. */
export function SetLiveForm({ projectId, deploymentId, className }: { projectId: string; deploymentId: string | null; className?: string }) {
  const [state, action, pending] = useActionState(setLiveAction, IDLE);
  const offline = deploymentId === null;
  return (
    <form action={action} className={className}>
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="deploymentId" value={deploymentId ?? ""} />
      {offline ? (
        <button type="submit" disabled={pending} className="min-h-11 text-sm text-failed underline-offset-4 hover:underline disabled:opacity-60">
          {pending ? "Taking it offline…" : "Take the site offline"}
        </button>
      ) : (
        <button type="submit" disabled={pending} className={buttonClasses("secondary", "sm")}>
          <ArrowCounterClockwiseIcon size={14} aria-hidden /> {pending ? "Making it live…" : "Make live"}
        </button>
      )}
      {state.status === "error" ? (
        <p role="alert" className="mt-1 flex items-start gap-2 text-sm text-failed">
          <WarningCircleIcon size={16} className="mt-0.5 shrink-0" aria-hidden /> {state.message}
        </p>
      ) : state.status === "done" ? (
        <p role="status" className="mt-1 text-sm text-verified">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
