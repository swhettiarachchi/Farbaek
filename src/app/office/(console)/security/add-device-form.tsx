"use client";

import { CheckCircleIcon, PlusIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { useActionState } from "react";
import { StepUpField } from "@/components/office/fields";
import { buttonClasses } from "@/components/ui/button";
import { LocalTime } from "@/components/ui/local-time";
import { createDeviceInviteAction, type InviteState } from "./actions";

/** Makes a one-time code for a new device (ADR 0072). Other devices can't see the office at all until one is used. */
export function AddDeviceForm() {
  const [state, action, pending] = useActionState(createDeviceInviteAction, { status: "idle" } as InviteState);
  if (state.status === "ready") {
    return (
      <div className="grid gap-3 rounded-sm border border-line bg-surface-raised/70 p-4" role="status">
        <p className="flex items-center gap-2 text-sm text-ink-2">
          <CheckCircleIcon size={16} weight="fill" className="shrink-0 text-verified" aria-hidden />
          <span>Code for your new device</span>
        </p>
        <p className="font-mono text-[1.75rem] font-semibold tracking-[0.25em] text-ink tabular">{state.code}</p>
        <p className="text-sm leading-relaxed text-ink-2">
          On the new device, open <span className="font-mono text-ink">officespace.farbaek.com/add-device</span> and type it. It works once, until <LocalTime iso={state.expiresAt} />, then sign in there as usual.
        </p>
      </div>
    );
  }
  return (
    <form action={action} className="grid gap-3">
      <StepUpField id="add-device-totp" />
      <button type="submit" disabled={pending} className={buttonClasses("secondary", "sm", "justify-self-start")}>
        <PlusIcon size={16} weight="bold" aria-hidden />
        {pending ? "Making a code…" : "Make a code for a new device"}
      </button>
      {state.status === "error" ? (
        <p role="alert" className="flex items-start gap-2 text-sm text-failed">
          <WarningCircleIcon size={16} weight="fill" className="mt-0.5 shrink-0 text-failed" aria-hidden /> <span>{state.message}</span>
        </p>
      ) : null}
    </form>
  );
}
