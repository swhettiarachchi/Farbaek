"use client";

import { HammerIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { useActionState, useState } from "react";
import { startBuildRunAction, type BuildActionState } from "@/app/app/build/actions";
import { EffortPicker } from "@/components/app/effort-picker";
import { buttonClasses } from "@/components/ui/button";
import type { Effort } from "@/core/agent/routing";

const IDLE: BuildActionState = { status: "idle" };

/** Starts a cloud run on a task with an approved contract. The server checks everything again. */
export function StartRun({ taskId, disabledReason, compact = false }: { taskId: string; disabledReason: string | null; compact?: boolean }) {
  const [state, action, pending] = useActionState(startBuildRunAction, IDLE);
  const [effort, setEffort] = useState<Effort>("balanced");
  return (
    <form action={action} className="grid gap-3">
      <input type="hidden" name="taskId" value={taskId} />
      {compact ? <input type="hidden" name="effort" value={effort} /> : <EffortPicker value={effort} onChange={setEffort} disabled={pending || Boolean(disabledReason)} />}
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending || Boolean(disabledReason)} className={buttonClasses("primary", "sm")}>
          <HammerIcon size={16} weight="bold" aria-hidden />
          {pending ? "Starting the agent…" : "Build with the agent"}
        </button>
        {disabledReason ? <p className="text-xs text-ink-3">{disabledReason}</p> : null}
      </div>
      {state.status === "error" ? (
        <p role="alert" className="flex items-start gap-2 text-sm text-failed">
          <WarningCircleIcon size={16} className="mt-0.5 shrink-0" aria-hidden />
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
