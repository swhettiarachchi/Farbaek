"use client";

import { CheckCircleIcon, PenNibIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { useState, useTransition } from "react";
import { writeTaskNoteAction } from "@/app/app/actions";
import { buttonClasses } from "@/components/ui/button";
import { RelativeTime } from "@/components/ui/local-time";
import { modelName } from "@/core/billing/model-names";
import type { TaskNoteView } from "@/core/realityloop/modes";

/**
 * Notes for Learn and Audit tasks (ADR 0131): an AI explanation or audit
 * report of the task's contract and files, labelled as AI-written. Writing
 * one is metered; it changes nothing in the project.
 */
export function TaskNotesCard({ taskId, kind, notes, disabledReason }: { taskId: string; kind: "explanation" | "audit"; notes: TaskNoteView[]; disabledReason: string | null }) {
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, start] = useTransition();
  const label = kind === "explanation" ? "Write an explanation" : "Write an audit report";

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={pending || Boolean(disabledReason)}
          onClick={() => {
            setError(null);
            setDone(false);
            start(async () => {
              const r = await writeTaskNoteAction({ taskId });
              if (r.status === "error") setError(r.message);
              else setDone(true);
            });
          }}
          className={buttonClasses("primary", "sm")}
        >
          <PenNibIcon size={16} weight="bold" aria-hidden /> {pending ? "Writing…" : label}
        </button>
        {disabledReason ? <span className="text-sm text-ink-3">{disabledReason}</span> : <span className="text-xs text-ink-3">Uses AI from this workspace&apos;s usage. Nothing in the project changes.</span>}
      </div>
      <div aria-live="polite" className="empty:hidden">
        {error ? (
          <p role="alert" className="flex items-start gap-2 text-sm text-failed">
            <WarningCircleIcon size={16} weight="fill" className="mt-0.5 shrink-0 text-failed" aria-hidden />
            {error}
          </p>
        ) : done ? (
          <p role="status" className="flex items-start gap-2 text-sm text-ink-2">
            <CheckCircleIcon size={16} weight="fill" className="mt-0.5 shrink-0 text-verified" aria-hidden />
            Written. It&apos;s the first note below.
          </p>
        ) : null}
      </div>
      {notes.length ? (
        <ol className="grid gap-4">
          {notes.map((n) => (
            <li key={n.id} className="grid gap-3 rounded-md border border-line bg-surface-sunken/50 p-4">
              <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-3">
                <span className="inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded-full border border-line-2 bg-surface px-2.5 font-medium text-ink-2">
                  <PenNibIcon size={14} weight="bold" className="shrink-0 text-ink-3" aria-hidden /> AI-written
                </span>
                <span>
                  Written by {modelName(n.model)}, <RelativeTime iso={n.createdAt} />.
                </span>
              </p>
              {n.summary ? <p className="text-body leading-relaxed text-ink">{n.summary}</p> : null}
              {n.points.length ? (
                <ul className="grid gap-3">
                  {n.points.map((p, i) => (
                    <li key={i} className="grid gap-1">
                      <p className="text-sm font-medium text-ink">
                        {p.title}
                        {p.path ? <span className="ml-2 break-all font-mono text-xs font-normal text-ink-3">{p.path}</span> : null}
                      </p>
                      <p className="text-sm leading-relaxed text-ink-2">{p.body}</p>
                    </li>
                  ))}
                </ul>
              ) : null}
              {n.uncertainty || n.left.length ? (
                <p className="text-xs leading-relaxed text-ink-3">
                  {n.uncertainty}
                  {n.left.length ? ` Not read: ${n.left.slice(0, 6).join(", ")}${n.left.length > 6 ? ` and ${n.left.length - 6} more` : ""}.` : ""}
                </p>
              ) : null}
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-sm text-ink-2">No notes yet.</p>
      )}
    </div>
  );
}
