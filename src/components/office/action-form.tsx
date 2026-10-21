"use client";

import { CheckCircleIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { useActionState, type ReactNode } from "react";
import { buttonClasses } from "@/components/ui/button";

export type OfficeFormState = { ok: boolean | null; message: string | null };

/**
 * A form for one office action: its fields, one outcome-named button and
 * the server's answer. Danger actions use the failed tone, never the accent.
 */
export function OfficeActionForm({
  action,
  submit,
  tone = "primary",
  children,
  className = "grid gap-4",
}: {
  action: (prev: OfficeFormState, form: FormData) => Promise<OfficeFormState>;
  submit: string;
  tone?: "primary" | "secondary" | "danger";
  children: ReactNode;
  className?: string;
}) {
  const [state, run, pending] = useActionState(action, { ok: null, message: null });
  return (
    <form action={run} className={className}>
      {children}
      <button type="submit" disabled={pending} className={buttonClasses(tone, "sm", "justify-self-start")}>
        {tone === "danger" ? <WarningCircleIcon size={16} weight="bold" aria-hidden /> : null}
        {pending ? "Working…" : submit}
      </button>
      {state.message ? (
        <p role={state.ok ? "status" : "alert"} className={`flex items-start gap-2 text-sm ${state.ok ? "text-verified" : "text-failed"}`}>
          {state.ok ? <CheckCircleIcon size={16} weight="fill" className="mt-0.5 shrink-0" aria-hidden /> : <WarningCircleIcon size={16} weight="bold" className="mt-0.5 shrink-0" aria-hidden />}
          <span className="text-ink">{state.message}</span>
        </p>
      ) : null}
    </form>
  );
}
