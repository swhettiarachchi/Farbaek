"use client";

import { EyeIcon, EyeSlashIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { useActionState } from "react";
import { setOutcomeWatchAction, type WatchState } from "@/app/app/projects/[projectId]/launch/watch-actions";
import { buttonClasses } from "@/components/ui/button";

const IDLE: WatchState = { status: "idle" };

export function WatchToggle({ projectId, on, disabledReason }: { projectId: string; on: boolean; disabledReason: string | null }) {
  const [state, action, pending] = useActionState(setOutcomeWatchAction, IDLE);
  return (
    <form action={action} className="grid gap-2">
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="on" value={on ? "false" : "true"} />
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending || Boolean(disabledReason)} className={buttonClasses(on ? "secondary" : "primary", "sm")}>
          {on ? <EyeSlashIcon size={16} weight="bold" aria-hidden /> : <EyeIcon size={16} weight="bold" aria-hidden />}
          {pending ? "Saving…" : on ? "Stop watching" : "Watch it every hour"}
        </button>
        {disabledReason ? <span className="text-sm text-ink-3">{disabledReason}</span> : null}
      </div>
      {state.status === "error" ? (
        <p role="alert" className="flex items-start gap-2 text-sm text-failed">
          <WarningCircleIcon size={16} weight="fill" className="mt-0.5 shrink-0" aria-hidden /> {state.message}
        </p>
      ) : null}
    </form>
  );
}
