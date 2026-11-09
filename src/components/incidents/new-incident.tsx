"use client";

import { PlusIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { openIncidentAction } from "@/app/app/incidents/actions";
import { buttonClasses } from "@/components/ui/button";
import { inputClasses, LABEL_CLASSES, textareaClasses } from "@/components/ui/field";
import { SEVERITIES, SEVERITY_WORDS } from "@/core/trust/incidents";

/** Opening an incident by hand (ADR 0083), an incident response tool. */
export function NewIncident({ projects, disabledReason }: { projects: { id: string; name: string }[]; disabledReason: string | null }) {
  const id = useId();
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [severity, setSeverity] = useState("medium");
  const [projectId, setProjectId] = useState("");
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const locked = Boolean(disabledReason);

  const submit = () =>
    start(async () => {
      const r = await openIncidentAction({ title, severity, projectId, text });
      if (r.status === "done" && r.number) router.push(`/app/incidents/${r.number}`);
      else if (r.status === "error") setError(r.message);
    });

  return (
    <div className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto]">
        <div className="grid gap-1.5">
          <label htmlFor={`${id}-title`} className={LABEL_CLASSES}>
            What went wrong
          </label>
          <input
            id={`${id}-title`}
            value={title}
            maxLength={120}
            onChange={(e) => setTitle(e.target.value)}
            disabled={locked}
            placeholder="For example: prices on the shop are wrong"
            className={inputClasses()}
          />
        </div>
        <div className="grid gap-1.5">
          <label htmlFor={`${id}-severity`} className={LABEL_CLASSES}>
            Severity
          </label>
          <select
            id={`${id}-severity`}
            value={severity}
            onChange={(e) => setSeverity(e.target.value)}
            disabled={locked}
            className={inputClasses()}
          >
            {SEVERITIES.map((s) => (
              <option key={s} value={s}>
                {SEVERITY_WORDS[s]}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="grid gap-1.5">
        <label htmlFor={`${id}-project`} className={LABEL_CLASSES}>
          Project <span className="font-normal text-ink-3">(optional)</span>
        </label>
        <select
          id={`${id}-project`}
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          disabled={locked}
          className={inputClasses()}
        >
          <option value="">The whole workspace</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>
      <div className="grid gap-1.5">
        <label htmlFor={`${id}-text`} className={LABEL_CLASSES}>
          What you know so far <span className="font-normal text-ink-3">(optional)</span>
        </label>
        <textarea
          id={`${id}-text`}
          rows={2}
          value={text}
          maxLength={2000}
          onChange={(e) => setText(e.target.value)}
          disabled={locked}
          className={textareaClasses()}
        />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={submit} disabled={pending || locked || title.trim().length < 3} className={buttonClasses("secondary", "sm")}>
          <PlusIcon size={16} weight="bold" aria-hidden /> {pending ? "Reporting…" : "Report the problem"}
        </button>
        {disabledReason ? <span className="text-xs text-ink-3">{disabledReason}</span> : null}
      </div>
      {error ? (
        <p role="alert" className="flex items-start gap-2 text-sm text-failed">
          <WarningCircleIcon size={16} weight="fill" className="mt-0.5 shrink-0 text-failed" aria-hidden />
          <span>{error}</span>
        </p>
      ) : null}
    </div>
  );
}
