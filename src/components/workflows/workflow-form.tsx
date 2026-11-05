"use client";

import { MinusCircleIcon, PlusIcon, UsersThreeIcon } from "@phosphor-icons/react";
import { useActionState, useState } from "react";
import { createWorkflowAction, type WorkflowState } from "@/app/app/workflows/actions";
import { buttonClasses } from "@/components/ui/button";

const IDLE: WorkflowState = { status: "idle" };
const MAX_STEPS = 8;
/** Agent teams (ADR 0128): at most this many steps run at the same time. */
const MAX_TEAM = 3;
const input = "h-11 w-full rounded-sm border border-line-strong/60 bg-surface px-3 text-base sm:text-sm";

interface Step {
  key: number;
  title: string;
  notes: string;
  checkpoint: boolean;
  /** Runs at the same time as the step before, as a team (ADR 0128). */
  together: boolean;
}

/**
 * A new governed workflow (ADR 0092): its steps in order, which ones stop
 * for a person afterwards, which run at the same time as a team of agents
 * (ADR 0128), and each step's run cap. Every step becomes a task whose
 * contract is drafted and approved before the workflow can be.
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
    { key: 1, title: "", notes: "", checkpoint: false, together: false },
    { key: 2, title: "", notes: "", checkpoint: false, together: false },
  ]);
  const [next, setNext] = useState(3);
  const blocked = Boolean(disabledReason) || pending;
  const update = (key: number, patch: Partial<Step>) => setSteps((s) => s.map((x) => (x.key === key ? { ...x, ...patch } : x)));
  // How many steps already work together in the stage of the step before index i.
  const teamBefore = (i: number) => {
    let n = 1;
    for (let j = i - 1; j > 0 && steps[j]!.together; j--) n++;
    return n;
  };

  return (
    <form action={action} className="grid gap-6">
      <input type="hidden" name="steps" value={JSON.stringify(steps.map(({ title, notes, checkpoint, together }, i) => ({ title, notes, checkpoint, together: i > 0 && together })))} />
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
            <li key={s.key} className={`grid gap-3 rounded-md border bg-surface p-4 ${i > 0 && s.together ? "border-accent/45 shadow-[inset_3px_0_0_var(--color-accent)]" : "border-line"}`}>
              <div className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2 text-xs font-medium text-ink-3">
                  Step {i + 1}
                  {i > 0 && s.together ? (
                    <span className="inline-flex items-center gap-1 rounded-full border border-accent/40 bg-accent/[0.07] px-2 py-0.5 text-xs text-accent">
                      <UsersThreeIcon size={12} aria-hidden /> With step {i}
                    </span>
                  ) : null}
                </span>
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
                <span className="text-xs text-ink-3">Notes for the plan (optional)</span>
                <textarea value={s.notes} onChange={(e) => update(s.key, { notes: e.target.value })} maxLength={2000} rows={2} className={`${input} h-auto min-h-16 py-2`} />
              </label>
              <label className="flex min-h-11 cursor-pointer items-center gap-3">
                <input type="checkbox" checked={s.checkpoint} onChange={(e) => update(s.key, { checkpoint: e.target.checked })} className="size-4 accent-[var(--color-accent)]" />
                <span className="text-sm">Stop for a person after this step</span>
              </label>
              {i > 0 ? (
                <label className={`flex min-h-11 items-start gap-3 py-1 ${!s.together && teamBefore(i) >= MAX_TEAM ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}>
                  <input
                    type="checkbox"
                    checked={s.together}
                    disabled={!s.together && teamBefore(i) >= MAX_TEAM}
                    onChange={(e) => update(s.key, { together: e.target.checked })}
                    className="mt-1 size-4 accent-[var(--color-accent)]"
                  />
                  <span className="grid gap-0.5">
                    <span className="text-sm">Run at the same time as step {i}</span>
                    <span className="text-xs text-ink-3">
                      {!s.together && teamBefore(i) >= MAX_TEAM
                        ? `At most ${MAX_TEAM} steps run at the same time.`
                        : "Another agent works on it at once. Its plan must name files separate from the steps it runs with."}
                    </span>
                  </span>
                </label>
              ) : null}
            </li>
          ))}
        </ol>
        {steps.length < MAX_STEPS ? (
          <button
            type="button"
            onClick={() => {
              setSteps((s) => [...s, { key: next, title: "", notes: "", checkpoint: false, together: false }]);
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
