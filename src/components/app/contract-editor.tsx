"use client";

import { FingerprintIcon } from "@phosphor-icons/react";
import { useActionState, useId, useState } from "react";
import { approveContractAction, saveContractAction, type FormState } from "@/app/app/actions";
import { buttonClasses } from "@/components/ui/button";
import type { ContractFormValues } from "@/core/realityloop/contract-form";

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
  submitLabel,
  onCancel,
}: {
  taskId: string;
  taskVersion: number;
  basedOn: number;
  initial: ContractFormValues;
  disabledReason: string | null;
  submitLabel: string;
  onCancel?: () => void;
}) {
  const [state, action, pending] = useActionState(saveContractAction, IDLE);
  const base = useId();
  const values = (state.status === "error" ? state.values : undefined) ?? initial;

  if (state.status === "done") {
    return (
      <p role="status" className="rounded-sm border border-verified/30 bg-verified/[0.05] px-4 py-3 text-sm">
        {state.message}
      </p>
    );
  }

  return (
    <form action={action} className="grid gap-5">
      <input type="hidden" name="taskId" value={taskId} />
      <input type="hidden" name="expectedTaskVersion" value={taskVersion} />
      <input type="hidden" name="basedOn" value={basedOn} />
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
        <button type="submit" disabled={pending || Boolean(disabledReason)} className={buttonClasses("primary")}>
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

/** Revise button that reveals the editor prefilled with the current version. */
export function ReviseContract(props: Omit<Parameters<typeof ContractEditor>[0], "submitLabel" | "onCancel">) {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} disabled={Boolean(props.disabledReason)} className={buttonClasses("secondary", "sm")}>
        Revise contract
      </button>
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
