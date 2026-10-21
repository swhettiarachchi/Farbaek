"use client";

import { PaperPlaneTiltIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { useActionState, useId } from "react";
import { openSupportAction, replySupportAction, type HelpFormState } from "@/app/app/help/actions";
import { buttonClasses } from "@/components/ui/button";
import { SUPPORT_LIMITS, SUPPORT_TOPICS, TOPIC_LABELS, type SupportTopic } from "@/core/support/support";

const IDLE: HelpFormState = { status: "idle" };
const field = "w-full rounded-sm border border-line-strong bg-canvas px-3 text-base text-ink placeholder:text-ink-3 focus-visible:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/25";

function FormError({ state, id }: { state: HelpFormState; id: string }) {
  if (state.status !== "error") return null;
  return (
    <p id={id} role="alert" className="flex items-start gap-2 text-sm text-failed">
      <WarningCircleIcon size={16} className="mt-0.5 shrink-0" aria-hidden />
      {state.message}
    </p>
  );
}

/** A new request: what it's about, a subject and the message. */
export function NewRequestForm({ topic, disabledReason }: { topic: SupportTopic | null; disabledReason: string | null }) {
  const [state, action, pending] = useActionState(openSupportAction, IDLE);
  const subjectId = useId();
  const bodyId = useId();
  const errorId = useId();
  const disabled = disabledReason !== null;

  return (
    <form action={action} className="grid gap-6">
      <fieldset className="grid gap-3" disabled={disabled}>
        <legend className="mb-3 text-sm font-medium text-ink">What&apos;s it about?</legend>
        <div className="flex flex-wrap gap-2">
          {SUPPORT_TOPICS.map((t) => (
            <label key={t} className="relative">
              <input type="radio" name="topic" value={t} defaultChecked={t === (topic ?? "not_working")} required className="peer sr-only" />
              <span className="inline-flex min-h-11 cursor-pointer items-center rounded-full border border-line bg-surface px-4 text-sm text-ink-2 shadow-e1 transition-colors duration-150 hover:text-ink peer-checked:border-primary peer-checked:bg-primary peer-checked:text-on-primary peer-focus-visible:ring-2 peer-focus-visible:ring-accent/40 peer-disabled:opacity-60">
                {TOPIC_LABELS[t]}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-2">
        <label htmlFor={subjectId} className="text-sm font-medium text-ink">
          Subject
        </label>
        <input
          id={subjectId}
          name="subject"
          required
          minLength={SUPPORT_LIMITS.subjectMin}
          maxLength={SUPPORT_LIMITS.subjectMax}
          disabled={disabled}
          placeholder="The preview of my site won't load"
          className={`${field} h-11`}
        />
      </div>

      <div className="grid gap-2">
        <label htmlFor={bodyId} className="text-sm font-medium text-ink">
          Message
        </label>
        <textarea
          id={bodyId}
          name="body"
          required
          maxLength={SUPPORT_LIMITS.bodyMax}
          disabled={disabled}
          aria-describedby={`${bodyId}-hint${state.status === "error" ? ` ${errorId}` : ""}`}
          placeholder="What happened, what you expected, and the project or site it's about."
          className={`${field} field-sizing-content min-h-40 max-h-[50dvh] py-3 leading-relaxed`}
        />
        <p id={`${bodyId}-hint`} className="text-xs text-ink-3">
          Up to {SUPPORT_LIMITS.bodyMax.toLocaleString("en-US")} characters. Never include passwords or secret keys.
        </p>
      </div>

      <FormError state={state} id={errorId} />
      {disabledReason ? <p className="text-sm text-ink-2">{disabledReason}</p> : null}
      <div>
        <button type="submit" disabled={disabled || pending} className={buttonClasses("primary", "md")}>
          <PaperPlaneTiltIcon size={17} aria-hidden /> {pending ? "Sending…" : "Send to Farbaek"}
        </button>
      </div>
    </form>
  );
}

/** A reply on an open or closed request. Writing on a closed one opens it again. */
export function ReplyForm({ threadId, closed }: { threadId: string; closed: boolean }) {
  const [state, action, pending] = useActionState(replySupportAction, IDLE);
  const bodyId = useId();
  const errorId = useId();
  return (
    <form key={state.status === "sent" ? state.at : "reply"} action={action} className="grid gap-2">
      <input type="hidden" name="threadId" value={threadId} />
      <label htmlFor={bodyId} className="sr-only">
        Your reply
      </label>
      <div className="flex items-end gap-2">
        <textarea
          id={bodyId}
          name="body"
          required
          rows={1}
          maxLength={SUPPORT_LIMITS.bodyMax}
          aria-describedby={`${bodyId}-hint${state.status === "error" ? ` ${errorId}` : ""}`}
          placeholder={closed ? "Write again to open this request" : "Write a reply"}
          className={`${field} field-sizing-content min-h-11 max-h-[35dvh] min-w-0 flex-1 py-2.5 leading-relaxed sm:min-h-24`}
        />
        <button type="submit" disabled={pending} aria-label={closed ? "Send and reopen" : "Send"} className={buttonClasses("primary", "sm", "shrink-0")}>
          <PaperPlaneTiltIcon size={16} aria-hidden />
          <span className="hidden sm:inline">{pending ? "Sending…" : closed ? "Send and reopen" : "Send"}</span>
        </button>
      </div>
      <FormError state={state} id={errorId} />
      <p id={`${bodyId}-hint`} className="hidden text-xs text-ink-3 sm:block">
        Never include passwords or secret keys.
      </p>
    </form>
  );
}
