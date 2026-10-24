"use client";

import { ArrowRightIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { useActionState } from "react";
import { buttonClasses } from "@/components/ui/button";
import { continueOnDeviceAction, type FactorState } from "../actions";

export function ContinueForm() {
  const [state, action, pending] = useActionState(continueOnDeviceAction, { message: null } as FactorState);
  return (
    <form action={action} className="grid gap-3">
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
