"use client";

import { ArrowRightIcon, CopyIcon, QrCodeIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { useActionState, useState } from "react";
import { officeInputClass } from "@/components/office/fields";
import { buttonClasses } from "@/components/ui/button";
import { beginEnrollAction, finishEnrollAction, type EnrollState, type FactorState } from "../actions";

/** Shows Supabase's QR code and secret for a new authenticator, then checks its first code. */
export function EnrollPanel() {
  const [current, start, starting] = useActionState(async () => beginEnrollAction(), { status: "idle" } as EnrollState);
  const [checked, confirm, confirming] = useActionState(finishEnrollAction, { message: null } as FactorState);
  const [copied, setCopied] = useState(false);

  if (current.status !== "ready") {
    return (
      <form action={start} className="grid gap-3">
        <button type="submit" disabled={starting} className={buttonClasses("primary", "md", "w-full")}>
          <QrCodeIcon size={18} weight="bold" aria-hidden />
          {starting ? "Preparing…" : "Show my QR code"}
        </button>
        {current.status === "error" ? (
          <p role="alert" className="flex items-start gap-2 text-sm text-failed">
            <WarningCircleIcon size={16} weight="bold" className="mt-0.5 shrink-0" aria-hidden /> {current.message}
          </p>
        ) : null}
      </form>
    );
  }

  return (
    <form action={confirm} className="grid gap-5">
      <input type="hidden" name="factorId" value={current.factorId} />
      <ol className="grid gap-4 text-sm">
        <li className="grid gap-3">
          <span>
            <span className="font-mono text-xs text-ink-3">1 </span>Scan this code with your authenticator app.
          </span>
          {/* Supabase returns the QR code as an SVG data URL; the office CSP allows data: images only for this. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={current.qr} alt="QR code for Farbaek Office Space in your authenticator app" width={184} height={184} className="size-46 justify-self-center rounded-sm border border-line bg-white p-2" />
          <span className="text-ink-2">
            Can&apos;t scan? Enter this key instead:
            <span className="mt-1.5 flex items-center gap-2">
              <code className="min-w-0 break-all rounded-xs bg-surface-raised px-2 py-1 font-mono text-xs text-ink">{current.secret}</code>
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard?.writeText(current.secret).then(() => setCopied(true));
                }}
                className={buttonClasses("ghost", "sm", "shrink-0")}
              >
                <CopyIcon size={16} aria-hidden /> {copied ? "Copied" : "Copy"}
              </button>
            </span>
          </span>
        </li>
        <li className="grid gap-2">
          <span>
            <span className="font-mono text-xs text-ink-3">2 </span>Enter the 6-digit code it shows.
          </span>
          <label htmlFor="office-enroll-code" className="sr-only">
            6-digit code from the authenticator app
          </label>
          <input id="office-enroll-code" name="code" required inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" maxLength={7} className={`${officeInputClass} font-mono text-lg tracking-[0.4em]`} />
        </li>
      </ol>
      <button type="submit" disabled={confirming} className={buttonClasses("primary", "md", "w-full")}>
        {confirming ? "Checking…" : "Finish and enter the office"}
        <ArrowRightIcon size={16} weight="bold" aria-hidden />
      </button>
      {checked.message ? (
        <p role="alert" className="flex items-start gap-2 text-sm text-failed">
          <WarningCircleIcon size={16} weight="bold" className="mt-0.5 shrink-0" aria-hidden /> {checked.message}
        </p>
      ) : null}
      <p className="text-xs leading-relaxed text-ink-3">After this, add a second authenticator in My security, on another device, so a lost phone never locks you out.</p>
    </form>
  );
}
