"use client";

import { WarningCircleIcon } from "@phosphor-icons/react";
import { useActionState, useState, type ReactNode } from "react";
import { buttonClasses, type ButtonVariant } from "@/components/ui/button";

export type ActionState = { status: "idle" } | { status: "error"; message: string } | { status: "done"; message: string };

const IDLE: ActionState = { status: "idle" };

/**
 * A control that does something hard to take back: one press shows the question
 * and the real button, and the result is said beside it (ADR 0181). The server
 * action takes the hidden fields in `fields` and answers with a message either way.
 */
export function ConfirmAction({
  action,
  fields,
  trigger,
  triggerVariant = "secondary",
  triggerClassName,
  question,
  confirmLabel,
  pendingLabel,
  keepLabel = "Keep it",
  disabledReason,
  danger = true,
  className,
}: {
  action: (previous: ActionState, form: FormData) => Promise<ActionState>;
  fields: Record<string, string | number>;
  trigger: ReactNode;
  triggerVariant?: ButtonVariant;
  /** Replaces the pill styling of the trigger, for an icon-only button. */
  triggerClassName?: string;
  /** Wraps the trigger only; the question always takes the full width. */
  question: ReactNode;
  confirmLabel: string;
  pendingLabel: string;
  keepLabel?: string;
  disabledReason?: string | null;
  danger?: boolean;
  className?: string;
}) {
  const [confirming, setConfirming] = useState(false);
  const [state, act, pending] = useActionState(action, IDLE);
  if (!confirming || disabledReason) {
    return (
      <div className={className}>
        <button type="button" onClick={() => setConfirming(true)} disabled={Boolean(disabledReason)} className={triggerClassName ?? buttonClasses(triggerVariant, "sm")}>
          {trigger}
        </button>
        {state.status === "done" ? (
          <p role="status" className="mt-1 text-sm text-verified">
            {state.message}
          </p>
        ) : null}
      </div>
    );
  }
  return (
    <form action={act} className={`grid w-full gap-3 rounded-sm border p-4 ${danger ? "border-failed/30 bg-failed/[0.04]" : "border-line bg-surface-raised/50"}`}>
      {Object.entries(fields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <p className="text-sm leading-relaxed">{question}</p>
      {state.status === "error" ? (
        <p role="alert" className="flex items-start gap-2 text-sm text-failed">
          <WarningCircleIcon size={16} className="mt-0.5 shrink-0" aria-hidden /> {state.message}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-3">
        <button type="submit" disabled={pending} className={buttonClasses(danger ? "danger" : "primary", "sm")}>
          {pending ? pendingLabel : confirmLabel}
        </button>
        <button type="button" onClick={() => setConfirming(false)} disabled={pending} className={buttonClasses("ghost", "sm")}>
          {keepLabel}
        </button>
      </div>
    </form>
  );
}
