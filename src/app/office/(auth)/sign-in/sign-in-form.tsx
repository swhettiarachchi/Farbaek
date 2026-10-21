"use client";

import { ArrowRightIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { useActionState } from "react";
import { officeInputClass } from "@/components/office/fields";
import { buttonClasses } from "@/components/ui/button";
import { requestCodeAction, verifyCodeAction, type EmailState } from "../actions";

const START: EmailState = { step: "email", email: "", message: null, error: false };

export function SignInForm({ sentMessage }: { sentMessage: string }) {
  const [sent, send, sending] = useActionState(requestCodeAction, START);
  const [checked, check, checking] = useActionState(verifyCodeAction, START);
  const onCode = sent.step === "code";
  const error = onCode ? checked.message : sent.message;

  return (
    <div className="grid gap-5">
      {!onCode ? (
        <form action={send} className="grid gap-4">
          <label htmlFor="office-email" className="grid gap-1.5 text-sm">
            <span className="font-medium text-ink">Work email</span>
            <input id="office-email" name="email" type="email" required autoComplete="username" defaultValue={sent.email} className={officeInputClass} placeholder="you@farbaek.com" />
          </label>
          <button type="submit" disabled={sending} className={buttonClasses("primary", "md", "w-full")}>
            {sending ? "Sending…" : "Send me a code"}
            <ArrowRightIcon size={16} weight="bold" aria-hidden />
          </button>
        </form>
      ) : (
        <form action={check} className="grid gap-4">
          <p className="rounded-sm bg-surface-raised px-4 py-3 text-sm text-ink-2" aria-live="polite">
            {sentMessage} <span className="font-medium text-ink">{sent.email}</span>
          </p>
          <input type="hidden" name="email" value={sent.email} />
          <label htmlFor="office-code" className="grid gap-1.5 text-sm">
            <span className="font-medium text-ink">6-digit code from the email</span>
            <input id="office-code" name="code" required inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" maxLength={7} autoFocus className={`${officeInputClass} font-mono text-lg tracking-[0.4em]`} />
          </label>
          <button type="submit" disabled={checking} className={buttonClasses("primary", "md", "w-full")}>
            {checking ? "Checking…" : "Continue"}
            <ArrowRightIcon size={16} weight="bold" aria-hidden />
          </button>
          <button type="button" onClick={() => window.location.reload()} className={buttonClasses("ghost", "sm", "justify-self-center")}>
            Use a different address
          </button>
        </form>
      )}
      {error ? (
        <p role="alert" className="flex items-start gap-2 text-sm text-failed">
          <WarningCircleIcon size={16} weight="bold" className="mt-0.5 shrink-0" aria-hidden /> {error}
        </p>
      ) : null}
    </div>
  );
}
