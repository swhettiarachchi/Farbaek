"use client";

import { ArrowRightIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { useActionState } from "react";
import { buttonClasses } from "@/components/ui/button";
import { redeemDeviceCodeAction, type CodeState } from "./actions";

export function CodeForm() {
  const [state, action, pending] = useActionState(redeemDeviceCodeAction, { message: null } as CodeState);
  return (
    <form action={action} className="grid gap-4">
      <label htmlFor="device-code" className="grid gap-1.5 text-sm">
        <span className="font-medium text-ink">Device code</span>
        <input
          id="device-code"
          name="code"
          required
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={9}
          autoFocus
          className="h-12 w-full rounded-sm border border-line bg-surface px-3.5 font-mono text-lg tracking-[0.3em] text-ink shadow-e1 outline-none focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/25"
        />
      </label>
      <button type="submit" disabled={pending} className={buttonClasses("primary", "md", "w-full")}>
        {pending ? "Checking…" : "Continue"}
        <ArrowRightIcon size={16} weight="bold" aria-hidden />
      </button>
      {state.message ? (
        <p role="alert" className="flex items-start gap-2 text-sm text-failed">
          <WarningCircleIcon size={16} weight="bold" className="mt-0.5 shrink-0" aria-hidden /> {state.message}
        </p>
      ) : null}
    </form>
  );
}
