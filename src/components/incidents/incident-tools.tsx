"use client";

import { CheckCircleIcon, NotePencilIcon, ShieldCheckIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { useId, useState, useTransition } from "react";
import { addIncidentNoteAction, changeIncidentAction, resolveIncidentAction, type IncidentActionState } from "@/app/app/incidents/actions";
import { buttonClasses } from "@/components/ui/button";
import { SEVERITIES, SEVERITY_WORDS, type IncidentStatus, type Severity } from "@/core/trust/incidents";

/**
 * Working an open incident (ADR 0083). Resolving, with what happened and
 * what was done, works on every plan; notes, severity and status are the
 * incident response tools.
 */
export function IncidentTools({
  number,
  severity,
  status,
  toolsReason,
  resolveReason,
}: {
  number: number;
  severity: Severity;
  status: IncidentStatus;
  /** Why notes, severity and status are off here, or null. */
  toolsReason: string | null;
  /** Why resolving is off here, or null. */
  resolveReason: string | null;
}) {
  const noteId = useId();
  const severityId = useId();
  const outcomeId = useId();
  const [note, setNote] = useState("");
  const [outcome, setOutcome] = useState("");
  const [state, setState] = useState<IncidentActionState>({ status: "idle" });
  const [pending, start] = useTransition();
  const run = (action: () => Promise<IncidentActionState>, after?: () => void) =>
    start(async () => {
      const r = await action();
      setState(r);
      if (r.status === "done") after?.();
    });

  return (
    <div className="grid gap-6">
      <div className="grid gap-1.5">
        <label htmlFor={noteId} className="text-sm font-medium">
          Add a note
        </label>
        <textarea
          id={noteId}
          rows={3}
          value={note}
          maxLength={2000}
          onChange={(e) => setNote(e.target.value)}
          disabled={Boolean(toolsReason)}
          placeholder="What you found, what you tried, who you told."
          className="rounded-sm border border-line bg-surface px-3 py-2 text-base sm:text-sm"
        />
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => run(() => addIncidentNoteAction({ number, text: note }), () => setNote(""))}
            disabled={pending || Boolean(toolsReason) || note.trim().length === 0}
            className={buttonClasses("secondary", "sm")}
          >
            <NotePencilIcon size={16} aria-hidden /> Add the note
          </button>
          {toolsReason ? <span className="text-xs text-ink-3">{toolsReason}</span> : null}
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <div className="grid gap-1.5">
          <label htmlFor={severityId} className="text-sm font-medium">
            Severity
          </label>
          <select
            id={severityId}
            value={severity}
            onChange={(e) => run(() => changeIncidentAction({ number, severity: e.target.value }))}
            disabled={pending || Boolean(toolsReason)}
            className="min-h-11 rounded-sm border border-line bg-surface px-3 text-base sm:text-sm"
          >
            {SEVERITIES.map((s) => (
              <option key={s} value={s}>
                {SEVERITY_WORDS[s]}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          onClick={() => run(() => changeIncidentAction({ number, status: status === "contained" ? "open" : "contained" }))}
          disabled={pending || Boolean(toolsReason)}
          className={buttonClasses("secondary", "sm")}
        >
          <ShieldCheckIcon size={16} aria-hidden /> {status === "contained" ? "Mark as open again" : "Mark as contained"}
        </button>
      </div>

      <div className="grid gap-1.5 border-t border-line pt-5">
        <label htmlFor={outcomeId} className="text-sm font-medium">
          Resolve: what happened, and what was done
        </label>
        <textarea
          id={outcomeId}
          rows={3}
          value={outcome}
          maxLength={2000}
          onChange={(e) => setOutcome(e.target.value)}
          disabled={Boolean(resolveReason)}
          placeholder="For example: the cart rounded prices wrongly after an automatic change. Undone, and a rule now holds src/lib/ for a person."
          className="rounded-sm border border-line bg-surface px-3 py-2 text-base sm:text-sm"
        />
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => run(() => resolveIncidentAction({ number, outcome }))}
            disabled={pending || Boolean(resolveReason) || outcome.trim().length < 10}
            className={buttonClasses("primary", "sm")}
          >
            <CheckCircleIcon size={16} aria-hidden /> Resolve the incident
          </button>
          <span className="text-xs text-ink-3">{resolveReason ?? "Resolving is final. Open a new incident if something else goes wrong."}</span>
        </div>
      </div>

      {state.status === "error" ? (
        <p role="alert" className="flex items-start gap-2 text-sm text-failed">
          <WarningCircleIcon size={16} className="mt-0.5 shrink-0" aria-hidden /> {state.message}
        </p>
      ) : state.status === "done" ? (
        <p role="status" className="flex items-start gap-2 text-sm text-verified">
          <CheckCircleIcon size={16} className="mt-0.5 shrink-0" aria-hidden /> {state.message}
        </p>
      ) : null}
    </div>
  );
}
