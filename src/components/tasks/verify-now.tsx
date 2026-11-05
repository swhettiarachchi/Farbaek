"use client";

import { PlayIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useActionState, useEffect } from "react";
import { startVerificationAction, type VerifyActionState } from "@/app/app/tasks/[taskId]/actions";
import { buttonClasses } from "@/components/ui/button";

const IDLE: VerifyActionState = { status: "idle" };

/** One button for an applied change's checks (ADR 0047): a sandbox starts, installs, runs them and stops. */
export function VerifyNow({ taskId, disabledReason, label = "Run the checks now" }: { taskId: string; disabledReason: string | null; label?: string }) {
  const [state, action, pending] = useActionState(startVerificationAction, IDLE);
  const router = useRouter();

  // Once it starts, load the page again so it shows as running.
  useEffect(() => {
    if (state.status === "started") router.refresh();
  }, [state, router]);

  return (
    <form action={action} className="grid gap-2">
      <input type="hidden" name="taskId" value={taskId} />
      <span className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending || state.status === "started" || Boolean(disabledReason)} className={buttonClasses("primary", "md")}>
          <PlayIcon size={18} weight="bold" aria-hidden />
          {pending || state.status === "started" ? "Starting the test space…" : label}
        </button>
        {disabledReason ? <span className="max-w-[48ch] text-xs text-ink-3">{disabledReason}</span> : null}
      </span>
      {state.status === "error" ? (
        <p role="alert" className="flex items-start gap-2 text-sm text-failed">
          <WarningCircleIcon size={16} className="mt-0.5 shrink-0" aria-hidden /> {state.message}
        </p>
      ) : null}
    </form>
  );
}
