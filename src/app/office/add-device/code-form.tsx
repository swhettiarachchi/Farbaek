"use client";

import { ArrowRightIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { useActionState } from "react";
import { buttonClasses } from "@/components/ui/button";
import { inputClasses, LABEL_CLASSES } from "@/components/ui/field";
import { redeemDeviceCodeAction, type CodeState } from "./actions";

export function CodeForm() {
  const [state, action, pending] = useActionState(redeemDeviceCodeAction, { message: null } as CodeState);
  return (
    <form action={action} className="grid gap-4">
      <label htmlFor="device-code" className="grid gap-1.5 text-sm">
        <span className={LABEL_CLASSES}>Device code</span>
        <input
          id="device-code"
          name="code"
          required
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={9}
          autoFocus
          className={inputClasses("font-mono text-lg tracking-[0.3em]")}
        />
      </label>
      <button type="submit" disabled={pending} className={buttonClasses("primary", "md", "w-full")}>
        {pending ? "Checking…" : "Continue"}
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
