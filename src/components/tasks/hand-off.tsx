"use client";

import { DesktopTowerIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { useActionState } from "react";
import { requestHandoffAction, type HandoffState } from "@/app/app/tasks/handoff-actions";
import { buttonClasses } from "@/components/ui/button";

const IDLE: HandoffState = { status: "idle" };

/** Hands the task to one of the workspace's computers (ADR 0139). */
export function HandOff({ taskId, computers, disabledReason }: { taskId: string; computers: { id: string; name: string }[]; disabledReason: string | null }) {
  const [state, action, pending] = useActionState(requestHandoffAction, IDLE);
  const off = pending || Boolean(disabledReason) || computers.length === 0;
  return (
    <form action={action} className="grid gap-3">
      <input type="hidden" name="taskId" value={taskId} />
      {computers.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)]">
          <label className="grid gap-1.5 text-sm font-medium">
            Computer
            <select name="agentId" required disabled={off} className="min-h-11 rounded-sm border border-line-strong bg-surface px-3 text-base text-ink">
              {computers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1.5 text-sm font-medium">
            Note for yourself (optional)
            <input name="note" maxLength={500} disabled={off} placeholder="Check the checkout flow on the real database" className="min-h-11 rounded-sm border border-line-strong bg-surface px-3 text-base text-ink placeholder:text-ink-3" />
          </label>
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={off || state.status === "sent"} className={buttonClasses("secondary", "sm")}>
          <DesktopTowerIcon size={16} weight="bold" aria-hidden />
          {pending ? "Sending…" : state.status === "sent" ? "Sent to your computer" : "Continue on my computer"}
        </button>
        {disabledReason ? <span className="text-sm text-ink-3">{disabledReason}</span> : null}
      </div>
      {state.status === "error" ? (
        <p role="alert" className="flex items-start gap-2 text-sm text-failed">
          <WarningCircleIcon size={16} className="mt-0.5 shrink-0" aria-hidden /> {state.message}
        </p>
      ) : null}
    </form>
  );
}
