"use client";

import { ShieldCheckIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useActionState, useEffect } from "react";
import { startSecurityCheckAction, type SecurityActionState } from "@/app/app/projects/[projectId]/security/actions";
import { buttonClasses } from "@/components/ui/button";

const IDLE: SecurityActionState = { status: "idle" };

/** `rulesOnly`: the plan runs the rules check (ADR 0168), so the button says that. */
export function RunSecurityCheck({ projectId, disabledReason, running, rulesOnly = false }: { projectId: string; disabledReason: string | null; running: boolean; rulesOnly?: boolean }) {
  const [state, action, pending] = useActionState(startSecurityCheckAction, IDLE);
  const router = useRouter();
  const busy = running;

  // Once a check starts, load the page again so it shows as running.
  useEffect(() => {
    if (state.status === "started") router.refresh();
  }, [state, router]);

  // While a check runs, look again every two seconds until its report is in.
  useEffect(() => {
    if (!busy) return;
    const t = setInterval(() => router.refresh(), 2_000);
    return () => clearInterval(t);
  }, [busy, router]);

  return (
    <form action={action} className="grid gap-2">
      <input type="hidden" name="projectId" value={projectId} />
      <span className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending || busy || Boolean(disabledReason)} className={buttonClasses("primary", "sm")}>
          <ShieldCheckIcon size={16} weight="bold" aria-hidden />
          {pending ? "Starting…" : busy ? "Checking…" : rulesOnly ? "Run the rules check" : "Run a security check"}
        </button>
        {disabledReason ? <span className="text-xs text-ink-3">{disabledReason}</span> : null}
      </span>
      {state.status === "error" ? (
        <p role="alert" className="flex items-start gap-2 text-sm text-failed">
          <WarningCircleIcon size={16} weight="fill" className="mt-0.5 shrink-0" aria-hidden /> {state.message}
        </p>
      ) : null}
    </form>
  );
}
