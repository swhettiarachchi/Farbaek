"use client";

import { useActionState, useId, useState } from "react";
import {
  cancelTaskAction,
  createOrganization,
  createProjectAction,
  createTaskAction,
  renameWorkspaceAction,
  type FormState,
} from "@/app/app/actions";
import { buttonClasses } from "@/components/ui/button";

const IDLE: FormState = { status: "idle" };

function Field({
  label,
  name,
  defaultValue,
  maxLength,
  required,
  error,
  multiline,
  hint,
  disabled,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  maxLength: number;
  required?: boolean;
  error?: string | null;
  multiline?: boolean;
  hint?: string;
  disabled?: boolean;
}) {
  const id = useId();
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const described = [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(" ") || undefined;
  const cls = "w-full rounded-sm border border-line-strong/60 bg-surface px-3.5 text-base shadow-e1 transition-colors focus:border-accent disabled:bg-surface-raised";
  return (
    <div className="grid gap-2">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
        {!required ? <span className="font-normal text-ink-3"> (optional)</span> : null}
      </label>
      {multiline ? (
        <textarea id={id} name={name} rows={3} maxLength={maxLength} defaultValue={defaultValue} disabled={disabled} aria-invalid={error ? true : undefined} aria-describedby={described} className={`${cls} py-2.5`} />
      ) : (
        <input id={id} name={name} required={required} maxLength={maxLength} defaultValue={defaultValue} disabled={disabled} aria-invalid={error ? true : undefined} aria-describedby={described} className={`${cls} h-11`} />
      )}
      {hint ? (
        <p id={hintId} className="text-xs text-ink-3">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} role="alert" className="text-sm text-failed">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function DisabledReason({ reason }: { reason: string | null }) {
  return reason ? <p className="text-sm text-ink-3">{reason}</p> : null;
}

export function CreateOrganizationForm() {
  const [state, action, pending] = useActionState(createOrganization, IDLE);
  const error = state.status === "error" ? state.message : null;
  return (
    <form action={action} className="grid gap-5">
      <Field label="Workspace name" name="name" maxLength={80} required error={error} defaultValue={state.status === "error" ? state.values?.name : undefined} />
      <button type="submit" disabled={pending} className={buttonClasses("primary", "md", "w-full sm:w-auto")}>
        {pending ? "Creating…" : "Create workspace"}
      </button>
    </form>
  );
}

export function CreateProjectForm({ disabledReason }: { disabledReason: string | null }) {
  const [state, action, pending] = useActionState(createProjectAction, IDLE);
  const error = state.status === "error" ? state.message : null;
  const values = state.status === "error" ? state.values : undefined;
  return (
    <form action={action} className="grid gap-5">
      <Field label="Project name" name="name" maxLength={80} required error={error} defaultValue={values?.name} disabled={Boolean(disabledReason)} />
      <Field label="Description" name="description" maxLength={500} multiline defaultValue={values?.description} disabled={Boolean(disabledReason)} />
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending || Boolean(disabledReason)} className={buttonClasses("primary")}>
          {pending ? "Creating…" : "Create project"}
        </button>
        <DisabledReason reason={disabledReason} />
      </div>
    </form>
  );
}

export function CreateTaskForm({ projectId, disabledReason }: { projectId: string; disabledReason: string | null }) {
  const [state, action, pending] = useActionState(createTaskAction, IDLE);
  const error = state.status === "error" ? state.message : null;
  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="projectId" value={projectId} />
      <Field
        label="Describe the task"
        name="title"
        maxLength={200}
        required
        error={error}
        defaultValue={state.status === "error" ? state.values?.title : undefined}
        hint="One clear outcome, for example: Rewrite 100 product descriptions without changing prices."
        disabled={Boolean(disabledReason)}
      />
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending || Boolean(disabledReason)} className={buttonClasses("primary")}>
          {pending ? "Adding…" : "Add task"}
        </button>
        <DisabledReason reason={disabledReason} />
      </div>
    </form>
  );
}

export function CancelTaskControl({ taskId, version, disabledReason }: { taskId: string; version: number; disabledReason: string | null }) {
  const [state, action, pending] = useActionState(cancelTaskAction, IDLE);
  const [confirming, setConfirming] = useState(false);

  if (state.status === "done") {
    return (
      <p role="status" className="text-sm text-ink-2">
        {state.message}
      </p>
    );
  }
  if (!confirming) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" disabled={Boolean(disabledReason)} onClick={() => setConfirming(true)} className={buttonClasses("secondary", "sm")}>
          Cancel task
        </button>
        <DisabledReason reason={disabledReason} />
      </div>
    );
  }
  return (
    <form action={action} className="grid gap-3 rounded-sm border border-failed/30 bg-failed/[0.04] p-4">
      <input type="hidden" name="taskId" value={taskId} />
      <input type="hidden" name="expectedVersion" value={version} />
      <p className="text-sm">Cancel this task? A cancelled task can&apos;t be resumed. Its history is kept.</p>
      {state.status === "error" ? (
        <p role="alert" className="text-sm text-failed">
          {state.message}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => setConfirming(false)} className={buttonClasses("secondary", "sm")}>
          Keep task
        </button>
        <button type="submit" disabled={pending} className={buttonClasses("danger", "sm")}>
          {pending ? "Cancelling…" : "Cancel task"}
        </button>
      </div>
    </form>
  );
}

export function RenameWorkspaceForm({ name, disabledReason }: { name: string; disabledReason: string | null }) {
  const [state, action, pending] = useActionState(renameWorkspaceAction, IDLE);
  const error = state.status === "error" ? state.message : null;
  return (
    <form action={action} className="grid gap-4">
      <Field label="Workspace name" name="name" maxLength={80} required error={error} defaultValue={state.status === "error" ? state.values?.name : name} disabled={Boolean(disabledReason)} />
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending || Boolean(disabledReason)} className={buttonClasses("secondary", "sm")}>
          {pending ? "Saving…" : "Save name"}
        </button>
        {state.status === "done" ? (
          <p role="status" className="text-sm text-verified">
            {state.message}
          </p>
        ) : null}
        <DisabledReason reason={disabledReason} />
      </div>
    </form>
  );
}
