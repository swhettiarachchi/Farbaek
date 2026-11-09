"use client";

import { PlusIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { useActionState } from "react";
import { OfficeActionForm } from "@/components/office/action-form";
import { inputClasses, LABEL_CLASSES } from "@/components/ui/field";
import { buttonClasses } from "@/components/ui/button";
import { addAuthenticatorAction, confirmAuthenticatorAction, type AddState } from "./actions";

export function AddAuthenticator() {
  const [state, start, starting] = useActionState(async () => addAuthenticatorAction(), { status: "idle" } as AddState);
  if (state.status !== "ready") {
    return (
      <form action={start} className="grid gap-2">
        <button type="submit" disabled={starting} className={buttonClasses("secondary", "sm", "justify-self-start")}>
          <PlusIcon size={16} weight="bold" aria-hidden /> {starting ? "Preparing…" : "Add another authenticator"}
        </button>
        {state.status === "error" ? (
          <p role="alert" className="flex items-start gap-2 text-sm text-failed">
            <WarningCircleIcon size={16} weight="fill" className="mt-0.5 shrink-0 text-failed" aria-hidden /> <span>{state.message}</span>
          </p>
        ) : null}
      </form>
    );
  }
  return (
    <OfficeActionForm action={confirmAuthenticatorAction} submit="Add it" className="grid gap-4 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-start">
      {/* Supabase returns the QR code as an SVG data URL. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={state.qr} alt="QR code for a second authenticator" width={168} height={168} className="size-42 rounded-sm border border-line bg-white p-2" />
      <div className="grid gap-3 text-sm">
        <p className="text-ink-2">
          Scan it with the app on your other device, or enter <code className="break-all rounded-xs bg-surface-raised px-1.5 py-0.5 font-mono text-xs text-ink">{state.secret}</code>
        </p>
        <input type="hidden" name="factorId" value={state.factorId} />
        <label htmlFor="add-code" className="grid gap-1.5">
          <span className={LABEL_CLASSES}>Code from the new app</span>
          <input id="add-code" name="code" required inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" maxLength={7} className={inputClasses("font-mono tracking-[0.3em]")} />
        </label>
      </div>
    </OfficeActionForm>
  );
}
