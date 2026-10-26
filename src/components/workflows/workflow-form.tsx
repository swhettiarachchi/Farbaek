"use client";

import { MinusCircleIcon, PlusIcon } from "@phosphor-icons/react";
import { useActionState, useState } from "react";
import { createWorkflowAction, type WorkflowState } from "@/app/app/workflows/actions";
import { buttonClasses } from "@/components/ui/button";

const IDLE: WorkflowState = { status: "idle" };
const MAX_STEPS = 8;
const input = "h-11 w-full rounded-sm border border-line-strong/60 bg-surface px-3 text-base sm:text-sm";

interface Step {
  key: number;
  title: string;
  notes: string;
  checkpoint: boolean;
}

/**
 * A new governed workflow (ADR 0092): its steps in order, which ones stop
 * for a person afterwards, and each step's run cap. Every step becomes a
 * task whose contract is drafted and approved before the workflow can be.
 */
export function WorkflowForm({
  projects,
  defaultProject,
  caps,
  disabledReason,
}: {
  projects: { id: string; name: string }[];
  defaultProject: string | null;
  caps: { choice: "top" | "double"; title: string; detail: string }[];
  disabledReason: string | null;
}) {
  const [state, action, pending] = useActionState(createWorkflowAction, IDLE);
  const [steps, setSteps] = useState<Step[]>([
    { key: 1, title: "", notes: "", checkpoint: false },
    { key: 2, title: "", notes: "", checkpoint: false },
  ]);
  const [next, setNext] = useState(3);
  const blocked = Boolean(disabledReason) || pending;
  const update = (key: number, patch: Partial<Step>) => setSteps((s) => s.map((x) => (x.key === key ? { ...x, ...patch } : x)));

  return (
    <form action={action} className="grid gap-6">
      <input type="hidden" name="steps" value={JSON.stringify(steps.map(({ title, notes, checkpoint }) => ({ title, notes, checkpoint })))} />
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-1.5">
          <span className="text-sm font-medium">Title</span>
          <input name="title" required minLength={3} maxLength={120} placeholder="Harden the cart and checkout" className={input} disabled={blocked} />
        </label>
        <label className="grid gap-1.5">
          <span className="text-sm font-medium">Project</span>
          <select name="projectId" required defaultValue={defaultProject ?? projects[0]?.id} className={input} disabled={blocked}>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <fieldset className="grid gap-3" disabled={blocked}>
        <legend className="text-sm font-medium">Steps, in the order they run</legend>
        <ol className="grid gap-3">
          {steps.map((s, i) => (
            <li key={s.key} className="grid gap-3 rounded-md border border-line bg-surface p-4">
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-medium text-ink-3">Step {i + 1}</span>
                {steps.length > 2 ? (
                  <button type="button" onClick={() => setSteps((all) => all.filter((x) => x.key !== s.key))} className={buttonClasses("ghost", "sm")}>
                    <MinusCircleIcon size={16} aria-hidden /> Remove step {i + 1}
                  </button>
                ) : null}
              </div>
              <label className="grid gap-1.5">
                <span className="sr-only">Step {i + 1} title</span>
                <input value={s.title} onChange={(e) => update(s.key, { title: e.target.value })} required minLength={3} maxLength={200} placeholder="What this step changes" className={input} />
              </label>
              <label className="grid gap-1.5">
                <span className="text-xs text-ink-3">Notes for the contract (optional)</span>
                <textarea value={s.notes} onChange={(e) => update(s.key, { notes: e.target.value })} maxLength={2000} rows={2} className={`${input} h-auto min-h-16 py-2`} />
              </label>
              <label className="flex min-h-11 cursor-pointer items-center gap-3">
                <input type="checkbox" checked={s.checkpoint} onChange={(e) => update(s.key, { checkpoint: e.target.checked })} className="size-4 accent-[var(--color-accent)]" />
                <span className="text-sm">Stop for a person after this step</span>
              </label>
            </li>
          ))}
        </ol>
        {steps.length < MAX_STEPS ? (
          <button
            type="button"
            onClick={() => {
              setSteps((s) => [...s, { key: next, title: "", notes: "", checkpoint: false }]);
              setNext((n) => n + 1);
            }}
            className={buttonClasses("secondary", "sm", "justify-self-start")}
          >
            <PlusIcon size={16} aria-hidden /> Add a step
          </button>
        ) : (
          <p className="text-xs text-ink-3">A workflow has at most {MAX_STEPS} steps.</p>
        )}
      </fieldset>

      <fieldset className="grid gap-2" disabled={blocked}>
        <legend className="text-sm font-medium">Each step&apos;s run stops at</legend>
        {caps.map((c, i) => (
          <label key={c.choice} className="flex min-h-11 cursor-pointer items-start gap-3 py-1">
            <input type="radio" name="cap" value={c.choice} defaultChecked={i === 0} className="mt-1 size-4 accent-[var(--color-accent)]" />
            <span className="grid gap-0.5">
              <span className="text-[15px] font-medium">{c.title}</span>
              <span className="text-sm text-ink-2">{c.detail}</span>
            </span>
          </label>
        ))}
      </fieldset>

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={blocked} className={buttonClasses("primary", "md")}>
          {pending ? "Creating…" : "Create the workflow"}
        </button>
        {disabledReason ? <p className="text-sm text-ink-3">{disabledReason}</p> : null}
        {state.status === "error" ? (
          <p role="alert" className="text-sm text-failed">
            {state.message}
          </p>
        ) : null}
      </div>
    </form>
  );
}
