"use client";

import { ArrowUpRightIcon } from "@phosphor-icons/react";
import { useId } from "react";
import { useFormStatus } from "react-dom";
import { buttonClasses } from "@/components/ui/button";

/**
 * A billing form's button. It says what happens and, while the server talks
 * to Dodo Payments, what's happening, so nobody presses twice. The arrow
 * marks a button that leaves Farbaek for the provider's own page.
 */
export function BillingSubmit({
  label,
  pending,
  tone = "primary",
  leaves = false,
  disabledReason,
}: {
  label: string;
  pending: string;
  tone?: "primary" | "secondary" | "danger";
  leaves?: boolean;
  disabledReason?: string | null;
}) {
  const status = useFormStatus();
  const busy = status.pending;
  const reasonId = useId();
  // Why the button is off, said beside it where everyone can read it, not only in a tooltip.
  const reason = disabledReason ? (
    <span id={reasonId} className="text-sm text-ink-3">
      {disabledReason}
    </span>
  ) : null;
  const describedBy = disabledReason ? reasonId : undefined;
  if (leaves && tone === "primary") {
    return (
      <>
        <button
          type="submit"
          disabled={busy || Boolean(disabledReason)}
          aria-describedby={describedBy}
          className="group inline-flex h-12 items-center gap-2 rounded-full bg-primary pl-5 pr-2 text-body font-medium text-on-primary shadow-e1 transition-[transform,background-color] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-primary/90 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? pending : label}
          <span className="flex size-8 items-center justify-center rounded-full bg-on-primary/15 transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:-translate-y-px group-hover:translate-x-0.5">
            <ArrowUpRightIcon size={16} weight="bold" aria-hidden />
          </span>
        </button>
        {reason}
      </>
    );
  }
  return (
    <>
      <button type="submit" disabled={busy || Boolean(disabledReason)} aria-describedby={describedBy} className={buttonClasses(tone, "sm")}>
        {busy ? pending : label}
      </button>
      {reason}
    </>
  );
}
