"use client";

import { FingerprintIcon, InfoIcon, SparkleIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { useActionState, useId, useRef, useState, useTransition } from "react";
import { approveContractAction, draftContractWithAiAction, saveContractAction, type AiDraftState, type FormState } from "@/app/app/actions";
import { EffortPicker } from "@/components/app/effort-picker";
import type { Effort } from "@/core/agent/routing";
import { buttonClasses } from "@/components/ui/button";
import { AiUsageNote } from "@/components/app/usage-meters";
import type { ContractFormValues } from "@/core/realityloop/contract-form";
import type { AiAvailability } from "@/server/workspace/ai-drafting";

const IDLE: FormState = { status: "idle" };

const FIELDS: { name: keyof ContractFormValues; label: string; hint?: string; rows?: number; required?: boolean; short?: boolean }[] = [
  { name: "outcome", label: "Outcome", hint: "What should be true when the task is done.", rows: 2, required: true },
  { name: "resources", label: "Resources in scope", hint: "Comma-separated, for example: products", short: true, required: true },
  { name: "allowed", label: "Allowed operations", hint: "One per line, for example: products.update", rows: 2, required: true },
  { name: "forbidden", label: "Forbidden operations", hint: "One per line.", rows: 2 },
  { name: "protectedFields", label: "Protected fields", hint: "Comma-separated fields that must not change, for example: price, stock", short: true },
  { name: "invariants", label: "Protected invariants", hint: "One per line, for example: No orders are created or edited.", rows: 2 },
  {
    name: "acceptance",
    label: "Acceptance criteria",
    hint: 'One per line. Start a line with "read_back:", "assertion:" or "manual:" to change how it is verified (default: test).',
    rows: 3,
    required: true,
  },
  { name: "checks", label: "Required checks", hint: "Commands that must pass, one per line, for example: pnpm test", rows: 2 },
  { name: "assumptions", label: "Assumptions", hint: "One per line.", rows: 2 },
  { name: "questions", label: "Open questions", hint: "One per line.", rows: 2 },
  { name: "recovery", label: "Recovery", hint: "How to undo the change if needed.", rows: 2, required: true },
  { name: "maxRecords", label: "Record limit", hint: "Most records the task may change.", short: true },
  { name: "maxRetries", label: "Retry limit", short: true },
];

export function ContractEditor({
  taskId,
  taskVersion,
  basedOn,
  initial,
  disabledReason,
  ai,
  submitLabel,
  onCancel,
}: {
  taskId: string;
  taskVersion: number;
  basedOn: number;
  initial: ContractFormValues;
  disabledReason: string | null;
  ai: AiAvailability;
  submitLabel: string;
  onCancel?: () => void;
}) {
  const [state, action, pending] = useActionState(saveContractAction, IDLE);
  const base = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const [aiPending, startAi] = useTransition();
  const [effort, setEffort] = useState<Effort>("balanced");
  // `after` is the save state when the draft arrived: a later save error shows what was submitted instead.
  const [aiDraft, setAiDraft] = useState<{ result: AiDraftState; after: FormState; key: number } | null>(null);
  const drafted = aiDraft?.result.status === "done" && aiDraft.after === state ? aiDraft.result : null;
  const values = drafted?.values ?? (state.status === "error" ? state.values : undefined) ?? initial;

  function draftWithAi() {
    if (!formRef.current) return;
    const data = new FormData(formRef.current);
    startAi(async () => {
      const result = await draftContractWithAiAction(data);
      setAiDraft((prev) => ({ result, after: state, key: (prev?.key ?? 0) + (result.status === "done" ? 1 : 0) }));
    });
  }

  if (state.status === "done") {
    return (
      <p role="status" className="rounded-sm border border-verified/30 bg-verified/[0.05] px-4 py-3 text-sm">
        {state.message}
      </p>
    );
  }

  return (
    <form ref={formRef} key={aiDraft?.key ?? 0} action={action} className="grid gap-5">
      <input type="hidden" name="taskId" value={taskId} />
      <input type="hidden" name="expectedTaskVersion" value={taskVersion} />
      <input type="hidden" name="basedOn" value={basedOn} />
      <AiDraftPanel ai={ai} pending={aiPending} disabled={pending || Boolean(disabledReason)} formReason={disabledReason} result={aiDraft?.result ?? null} onDraft={draftWithAi} effort={effort} onEffort={setEffort} />
      <div className="grid gap-5 md:grid-cols-2">
        {FIELDS.map((f) => {
          const id = `${base}-${f.name}`;
          const cls =
            "w-full rounded-sm border border-line-strong/60 bg-surface px-3.5 text-base shadow-e1 transition-colors focus:border-accent disabled:bg-surface-raised";
          return (
            <div key={f.name} className={`grid content-start gap-2 ${f.short ? "" : "md:col-span-2"}`}>
              <label htmlFor={id} className="text-sm font-medium">
                {f.label}
                {!f.required ? <span className="font-normal text-ink-3"> (optional)</span> : null}
              </label>
              {f.short ? (
                <input id={id} name={f.name} defaultValue={values[f.name] ?? ""} disabled={Boolean(disabledReason)} aria-describedby={f.hint ? `${id}-hint` : undefined} className={`${cls} h-11`} />
              ) : (
                <textarea
                  id={id}
                  name={f.name}
                  rows={f.rows ?? 2}
                  defaultValue={values[f.name] ?? ""}
                  disabled={Boolean(disabledReason)}
                  aria-describedby={f.hint ? `${id}-hint` : undefined}
                  className={`${cls} py-2.5`}
                />
              )}
              {f.hint ? (
                <p id={`${id}-hint`} className="text-xs text-ink-3">
                  {f.hint}
                </p>
              ) : null}
            </div>
          );
        })}
      </div>
      {state.status === "error" ? (
        <p role="alert" className="text-sm text-failed">
          {state.message}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending || aiPending || Boolean(disabledReason)} className={buttonClasses("primary")}>
          {pending ? "Saving…" : submitLabel}
        </button>
        {onCancel ? (
          <button type="button" onClick={onCancel} className={buttonClasses("ghost")}>
            Cancel
          </button>
        ) : null}
        {disabledReason ? <p className="text-sm text-ink-3">{disabledReason}</p> : null}
      </div>
    </form>
  );
}

function AiDraftPanel({
  ai,
  pending,
  disabled,
  formReason,
  result,
  onDraft,
  effort,
  onEffort,
}: {
  ai: AiAvailability;
  effort: Effort;
  onEffort: (e: Effort) => void;
  pending: boolean;
  disabled: boolean;
  /** Already shown under the form, so not repeated here. */
  formReason: string | null;
  result: AiDraftState | null;
  onDraft: () => void;
}) {
  const percent = result?.status === "done" ? result.usage.percent : ai.percent;
  const reached = percent !== null && percent >= 100;
  const limitText = ai.period === "trial" ? "You've reached the AI usage included in the trial." : "You've reached your AI usage limit for this month.";
  const reason = ai.disabledReason ?? (reached ? `${limitText} You can still write the contract yourself.` : null);
  return (
    <div className="grid gap-3 rounded-sm border border-line bg-surface-raised/60 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-medium">
            <SparkleIcon size={16} weight="fill" className="text-accent" aria-hidden /> Draft with AI
          </p>
          <p className="mt-1 text-xs leading-relaxed text-ink-3">
            {ai.provider ?? "The AI"} reads the task, the project and anything you&apos;ve typed below, then fills in the fields.{" "}
            {reached ? null : <AiUsageNote percent={percent} resetsAt={ai.resetsAt} period={ai.period} />}
          </p>
        </div>
        <span className="shrink-0">
          <button type="button" onClick={onDraft} disabled={pending || disabled || Boolean(reason)} className={buttonClasses("secondary", "sm")}>
            <SparkleIcon size={16} aria-hidden />
            {pending ? "Drafting…" : result?.status === "done" ? "Draft again" : "Draft with AI"}
          </button>
        </span>
      </div>
      <EffortPicker value={effort} onChange={onEffort} disabled={pending || disabled || Boolean(reason)} />
      <div aria-live="polite" className="empty:hidden">
        {pending ? <p className="text-xs text-ink-2">Drafting. This can take up to a minute.</p> : null}
        {!pending && result?.status === "done" ? (
          <p role="status" className="flex items-start gap-2 text-sm text-ink-2">
            <InfoIcon size={16} className="mt-0.5 shrink-0 text-info" aria-hidden />
            <span>
              Drafted by <span className="font-mono text-xs">{result.model}</span>. Nothing is saved yet: check every field, fix what&apos;s wrong, then save.
              {result.routeNote ? ` ${result.routeNote}` : null}
            </span>
          </p>
        ) : null}
        {!pending && result?.status === "error" ? (
          <p role="alert" className="flex items-start gap-2 text-sm text-failed">
            <WarningCircleIcon size={16} className="mt-0.5 shrink-0" aria-hidden />
            <span>{result.message}</span>
          </p>
        ) : null}
        {reason && reason !== formReason && !pending && result?.status !== "error" ? <p className="text-xs text-ink-2">{reason}</p> : null}
      </div>
    </div>
  );
}

/**
 * Revise button that reveals the editor prefilled with the current version.
 * It opens even when changes aren't allowed, so the editor can be seen; its
 * fields and buttons are then disabled with the reason.
 */
export function ReviseContract(props: Omit<Parameters<typeof ContractEditor>[0], "submitLabel" | "onCancel">) {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => setOpen(true)} className={buttonClasses("secondary", "sm")}>
          {props.disabledReason ? "View the editor" : "Revise contract"}
        </button>
        {props.disabledReason ? <p className="text-sm text-ink-3">{props.disabledReason}</p> : null}
      </div>
    );
  }
  return <ContractEditor {...props} submitLabel={`Save as version ${props.basedOn + 1}`} onCancel={() => setOpen(false)} />;
}

export function ApproveContractControl({
  taskId,
  taskVersion,
  version,
  sha256,
  disabledReason,
}: {
  taskId: string;
  taskVersion: number;
  version: number;
  sha256: string;
  disabledReason: string | null;
}) {
  const [state, action, pending] = useActionState(approveContractAction, IDLE);
  if (state.status === "done") {
    return (
      <p role="status" className="text-sm text-verified">
        {state.message}
      </p>
    );
  }
  return (
    <form action={action} className="grid gap-3 rounded-sm border border-approval/30 bg-approval/[0.05] p-4">
      <input type="hidden" name="taskId" value={taskId} />
      <input type="hidden" name="expectedTaskVersion" value={taskVersion} />
      <input type="hidden" name="version" value={version} />
      <input type="hidden" name="sha256" value={sha256} />
      <p className="text-sm">
        You are approving <span className="font-medium">version {version}</span>, exactly as shown above.
      </p>
      <p className="font-mono text-xs break-all text-ink-2">sha256:{sha256}</p>
      {state.status === "error" ? (
        <p role="alert" className="text-sm text-failed">
          {state.message}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending || Boolean(disabledReason)} className={buttonClasses("primary", "sm")}>
          <FingerprintIcon size={16} weight="bold" aria-hidden />
          {pending ? "Approving…" : `Approve version ${version}`}
        </button>
        {disabledReason ? <p className="text-sm text-ink-3">{disabledReason}</p> : null}
      </div>
    </form>
  );
}
