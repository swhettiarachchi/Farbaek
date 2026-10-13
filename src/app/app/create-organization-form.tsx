"use client";

import { useActionState, useId } from "react";
import { buttonClasses } from "@/components/ui/button";
import { createOrganization, type CreateOrganizationState } from "./actions";

export function CreateOrganizationForm() {
  const [state, action, pending] = useActionState<CreateOrganizationState, FormData>(createOrganization, { status: "idle" });
  const nameId = useId();
  const errorId = useId();
  const error = state.status === "error" ? state.message : null;

  return (
    <form action={action} className="grid gap-5">
      <div className="grid gap-2">
        <label htmlFor={nameId} className="text-sm font-medium">
          Workspace name
        </label>
        <input
          id={nameId}
          name="name"
          required
          maxLength={80}
          autoComplete="organization"
          defaultValue={state.status === "error" ? state.name : undefined}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          className="h-11 rounded-sm border border-line-strong bg-canvas px-3 text-base"
        />
        {error ? (
          <p id={errorId} role="alert" className="text-sm text-failed">
            {error}
          </p>
        ) : null}
      </div>
      <button type="submit" disabled={pending} className={buttonClasses("primary", "md", "w-full sm:w-auto")}>
        {pending ? "Creating…" : "Create workspace"}
      </button>
    </form>
  );
}
