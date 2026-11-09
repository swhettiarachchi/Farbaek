"use client";

import { ArrowRightIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { useActionState } from "react";
import { buttonClasses } from "@/components/ui/button";
import { inputClasses, LABEL_CLASSES } from "@/components/ui/field";
import { verifyTotpAction, type FactorState } from "../actions";

export function TotpForm() {
  const [state, action, pending] = useActionState(verifyTotpAction, { message: null } as FactorState);
  return (
    <form action={action} className="grid gap-4">
      <label htmlFor="office-totp" className="grid gap-1.5 text-sm">
        <span className={LABEL_CLASSES}>6-digit code</span>
        <input id="office-totp" name="code" required inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" maxLength={7} autoFocus className={inputClasses("font-mono text-lg tracking-[0.4em]")} />
      </label>
      <button type="submit" disabled={pending} className={buttonClasses("primary", "md", "w-full")}>
        {pending ? "Checking…" : "Enter the office"}
        <ArrowRightIcon size={16} weight="bold" aria-hidden />
      </button>
      {state.message ? (
        <p role="alert" className="flex items-start gap-2 text-sm text-failed">
          <WarningCircleIcon size={16} weight="fill" className="mt-0.5 shrink-0 text-failed" aria-hidden /> <span>{state.message}</span>
        </p>
      ) : null}
    </form>
  );
}
