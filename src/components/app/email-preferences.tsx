"use client";

import { CheckCircleIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { useActionState } from "react";
import { setEmailPreferencesAction, type FormState } from "@/app/app/actions";
import { buttonClasses } from "@/components/ui/button";
import type { EmailPreferences } from "@/server/workspace/types";

const IDLE: FormState = { status: "idle" };

const CHOICES = [
  { name: "workUpdates", key: "workUpdates", title: "Builds and checks", detail: "When a build or a check you started finishes." },
  { name: "trialReminders", key: "trialReminders", title: "Trial reminders", detail: "Before a trial ends in a workspace you own, and when it has ended." },
] as const;

/** The signed-in person's email choices (ADR 0063). Saved for them only, in every workspace. */
export function EmailPreferencesForm({ preferences, disabledReason }: { preferences: EmailPreferences; disabledReason: string | null }) {
  const [state, action, pending] = useActionState(setEmailPreferencesAction, IDLE);
  const disabled = pending || Boolean(disabledReason);
  return (
    <form action={action} className="grid gap-4">
      <fieldset className="grid gap-1" disabled={disabled}>
        <legend className="sr-only">Emails you get</legend>
        {CHOICES.map((c) => (
          <label key={c.name} className={`flex min-h-11 items-start gap-3 py-1.5 ${disabled ? "" : "cursor-pointer"}`}>
            <input type="checkbox" name={c.name} defaultChecked={preferences[c.key]} className="mt-1 size-4 shrink-0 accent-[var(--color-accent)]" />
            <span className="grid gap-0.5">
              <span className="text-body font-medium">{c.title}</span>
              <span className="text-sm text-ink-2">{c.detail}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={disabled} className={buttonClasses("secondary", "sm")}>
          {pending ? "Saving…" : "Save email choices"}
        </button>
        {state.status === "done" ? (
          <p role="status" className="flex items-start gap-2 text-sm text-verified">
            <CheckCircleIcon size={16} weight="fill" className="mt-0.5 shrink-0 text-verified" aria-hidden />
            <span>{state.message}</span>
          </p>
        ) : null}
        {state.status === "error" ? (
          <p role="alert" className="flex items-start gap-2 text-sm text-failed">
            <WarningCircleIcon size={16} weight="fill" className="mt-0.5 shrink-0 text-failed" aria-hidden />
            <span>{state.message}</span>
          </p>
        ) : null}
        {disabledReason ? <p className="text-sm text-ink-3">{disabledReason}</p> : null}
      </div>
    </form>
  );
}
