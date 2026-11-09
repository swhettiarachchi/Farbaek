"use client";

import { DesktopIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { useActionState } from "react";
import { requestHandoffAction, type HandoffState } from "@/app/app/tasks/handoff-actions";
import { buttonClasses } from "@/components/ui/button";
import { inputClasses, LABEL_CLASSES } from "@/components/ui/field";

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
          <label className={`grid gap-1.5 ${LABEL_CLASSES}`}>
            Computer
            <select name="agentId" required disabled={off} className={inputClasses()}>
              {computers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className={`grid gap-1.5 ${LABEL_CLASSES}`}>
            Note for yourself (optional)
            <input name="note" maxLength={500} disabled={off} placeholder="Check the checkout flow on the real database" className={inputClasses()} />
          </label>
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={off || state.status === "sent"} className={buttonClasses("secondary", "sm")}>
          <DesktopIcon size={16} weight="bold" aria-hidden />
          {pending ? "Sending…" : state.status === "sent" ? "Sent to your computer" : "Continue on my computer"}
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
