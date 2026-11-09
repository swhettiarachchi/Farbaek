"use client";

import { PlayIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { useActionState } from "react";
import { tryChangeAction, type ArenaState } from "@/app/app/tasks/arena-actions";
import { buttonClasses } from "@/components/ui/button";

const IDLE: ArenaState = { status: "idle" };

/** Starts a trial of a change waiting for review (ADR 0076). */
export function TryChange({ proposalId, taskId, again, disabledReason }: { proposalId: string; taskId: string; again: boolean; disabledReason: string | null }) {
  const [state, action, pending] = useActionState(tryChangeAction, IDLE);
  return (
    <form action={action} className="grid gap-2">
      <input type="hidden" name="proposalId" value={proposalId} />
      <input type="hidden" name="taskId" value={taskId} />
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending || Boolean(disabledReason) || state.status === "started"} className={buttonClasses(again ? "secondary" : "primary", "sm")}>
          <PlayIcon size={16} weight="bold" aria-hidden />
          {pending ? "Starting…" : state.status === "started" ? "Trial started" : again ? "Try it again" : "Try it on a copy"}
        </button>
        {disabledReason ? <span className="text-sm text-ink-3">{disabledReason}</span> : null}
      </div>
      {state.status === "error" ? (
        <p role="alert" className="flex items-start gap-2 text-sm text-failed">
          <WarningCircleIcon size={16} weight="fill" className="mt-0.5 shrink-0 text-failed" aria-hidden /> {state.message}
        </p>
      ) : null}
    </form>
  );
}
