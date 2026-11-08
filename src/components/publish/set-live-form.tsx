"use client";

import { ArrowCounterClockwiseIcon } from "@phosphor-icons/react";
import { setLiveAction } from "@/app/app/projects/[projectId]/publish-actions";
import { ConfirmAction } from "@/components/ui/confirm-action";

/**
 * Make an earlier version live again, or take the site offline (no deployment id).
 * Both change what visitors see at once, so each asks first and says how it went.
 */
export function SetLiveForm({ projectId, deploymentId, version, className }: { projectId: string; deploymentId: string | null; version?: number; className?: string }) {
  const offline = deploymentId === null;
  return offline ? (
    <ConfirmAction
      action={setLiveAction}
      fields={{ projectId, deploymentId: "" }}
      className={className}
      triggerClassName="min-h-11 text-sm text-failed underline-offset-4 hover:underline disabled:opacity-60"
      trigger="Take the site offline"
      question="Take the site offline? Visitors see nothing at its address until a version is made live again. Every version stays here, so it can come back at any time."
      confirmLabel="Take it offline"
      pendingLabel="Taking it offline…"
      keepLabel="Keep it live"
    />
  ) : (
    <ConfirmAction
      action={setLiveAction}
      fields={{ projectId, deploymentId }}
      className={className}
      trigger={
        <>
          <ArrowCounterClockwiseIcon size={14} weight="bold" aria-hidden /> Make live
        </>
      }
      question={`Make ${version ? `version ${version}` : "this earlier version"} live instead of the current one? Visitors see it within a few seconds, and the current version stays in the history.`}
      confirmLabel="Make it live"
      pendingLabel="Making it live…"
      keepLabel="Leave it"
      danger={false}
    />
  );
}
