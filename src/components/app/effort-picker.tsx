"use client";

import { useId } from "react";
import { EFFORTS, EFFORT_LABELS, type Effort } from "@/core/agent/routing";

/**
 * Fast, Balanced or Deep (ADR 0021). A segmented control of real radio
 * buttons, so it works in forms (name "effort") and with the keyboard. The
 * server re-checks the plan and routes to the model, so this only expresses
 * a preference.
 */
export function EffortPicker({ value, onChange, disabled = false, name = "effort" }: { value: Effort; onChange: (e: Effort) => void; disabled?: boolean; name?: string }) {
  const id = useId();
  return (
    <fieldset className="grid gap-1.5" disabled={disabled}>
      <legend className="sr-only">Effort</legend>
      <div className="inline-flex w-full rounded-full border border-line bg-surface p-1 shadow-e1 sm:w-auto">
        {EFFORTS.map((e) => (
          <label key={e} className="relative flex-1 sm:flex-none">
            <input
              type="radio"
              name={name}
              value={e}
              checked={value === e}
              onChange={() => onChange(e)}
              aria-describedby={`${id}-detail`}
              className="peer sr-only"
            />
            <span className="flex min-h-11 cursor-pointer items-center justify-center rounded-full px-4 text-sm text-ink-2 transition-colors duration-[160ms] peer-checked:bg-primary peer-checked:font-medium peer-checked:text-on-primary peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent peer-disabled:cursor-not-allowed peer-disabled:opacity-50">
              {EFFORT_LABELS[e].title}
            </span>
          </label>
        ))}
      </div>
      <p id={`${id}-detail`} className="text-xs text-ink-3">
        {EFFORT_LABELS[value].detail}
      </p>
    </fieldset>
  );
}
