"use client";

import { CheckCircleIcon, LockSimpleIcon, PaperPlaneTiltIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { useActionState, useId, useState } from "react";
import type { SupportReplyState } from "@/app/office/(console)/support/[id]/actions";
import { buttonClasses } from "@/components/ui/button";
import { textareaClasses } from "@/components/ui/field";
import { SUPPORT_LIMITS } from "@/core/support/support";

/**
 * Staff writing on a request: a reply the person sees, or an internal note
 * only staff see. The switch is a labelled pair, and a note's box is
 * shaded so the two can't be mistaken for each other.
 */
export function SupportReplyForm({ threadId, action }: { threadId: string; action: (prev: SupportReplyState, form: FormData) => Promise<SupportReplyState> }) {
  const [state, run, pending] = useActionState(action, { ok: null, message: null });
  const [mode, setMode] = useState<"reply" | "internal">("reply");
  const bodyId = useId();
  const internal = mode === "internal";

  return (
    <form key={state.sentAt ?? "compose"} action={run} className="grid gap-3">
      <input type="hidden" name="threadId" value={threadId} />
      <input type="hidden" name="mode" value={mode} />
      <div role="radiogroup" aria-label="Write a" className="inline-flex w-fit rounded-full border border-line bg-surface-raised/60 p-1">
        {(["reply", "internal"] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={mode === m}
            onClick={() => setMode(m)}
            className={`inline-flex min-h-11 items-center gap-1.5 rounded-full px-4 text-sm transition-colors duration-150 sm:min-h-9 ${mode === m ? "bg-surface font-medium text-ink shadow-e1" : "text-ink-2 hover:text-ink"}`}
          >
            {m === "reply" ? <PaperPlaneTiltIcon size={16} weight="bold" aria-hidden /> : <LockSimpleIcon size={16} weight="bold" aria-hidden />}
            {m === "reply" ? "Reply to them" : "Internal note"}
          </button>
        ))}
      </div>
      <label htmlFor={bodyId} className="sr-only">
        {internal ? "Internal note, only staff see it" : "Reply, the person sees it"}
      </label>
      <textarea
        id={bodyId}
        name="body"
        required
        maxLength={SUPPORT_LIMITS.bodyMax}
        placeholder={internal ? "Only Farbaek staff see this note" : "They'll see this under Help, signed Farbaek support"}
        className={textareaClasses(`field-sizing-content max-h-[45dvh] ${internal ? "bg-surface-raised" : ""}`)}
      />
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className={buttonClasses(internal ? "secondary" : "primary", "sm")}>
          {internal ? <LockSimpleIcon size={16} weight="bold" aria-hidden /> : <PaperPlaneTiltIcon size={16} weight="bold" aria-hidden />}
          {pending ? "Working…" : internal ? "Add note" : "Send reply"}
        </button>
        <span className="text-xs text-ink-3">{internal ? "Not shown to the person." : "Signed Farbaek support, never your name."}</span>
      </div>
      {state.message ? (
        <p role={state.ok ? "status" : "alert"} className={`flex items-start gap-2 text-sm ${state.ok ? "text-verified" : "text-failed"}`}>
          {state.ok ? <CheckCircleIcon size={16} weight="fill" className="mt-0.5 shrink-0 text-verified" aria-hidden /> : <WarningCircleIcon size={16} weight="fill" className="mt-0.5 shrink-0 text-failed" aria-hidden />}
          <span className="text-ink">{state.message}</span>
        </p>
      ) : null}
    </form>
  );
}
