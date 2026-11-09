"use client";

import { CheckCircleIcon, LockSimpleIcon, LockSimpleOpenIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { useActionState, useState } from "react";
import { setMemberPermissionsAction, type FormState } from "@/app/app/actions";
import { buttonClasses } from "@/components/ui/button";
import { PERMISSIONS, PERMISSION_LABELS, withheldSummary, type WithheldPermissions } from "@/core/workspace/permissions";

const IDLE: FormState = { status: "idle" };

/**
 * A member's permissions on the People list (ADR 0087). Everyone sees what's
 * turned off; owners and admins can change it. Off a plan that includes it,
 * what's on stays on, and what's off can still be turned back on.
 */
export function MemberPermissions({
  userId,
  name,
  permissions,
  canManage,
  isSelf,
  planReason,
  disabledReason,
}: {
  userId: string;
  name: string;
  permissions: WithheldPermissions;
  canManage: boolean;
  isSelf: boolean;
  /** Set when the plan doesn't include permissions per person. */
  planReason: string | null;
  disabledReason: string | null;
}) {
  const [state, save, saving] = useActionState(setMemberPermissionsAction, IDLE);
  const [open, setOpen] = useState(false);
  const summary = withheldSummary(permissions);
  if (!canManage && !summary) return null;

  const blocked = Boolean(disabledReason) || saving;
  const panelId = `permissions-${userId}`;

  return (
    <div className="grid gap-3 sm:col-span-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {/* A plain line, with a lock that names it (ADR 0183): closed when something is off, open when everything is on. */}
        <p className="flex items-start gap-1.5 text-xs text-ink-2">
          {summary ? <LockSimpleIcon size={14} weight="bold" className="mt-px shrink-0 text-ink-3" aria-hidden /> : <LockSimpleOpenIcon size={14} weight="bold" className="mt-px shrink-0 text-ink-3" aria-hidden />}
          <span>{summary ? `${isSelf ? "For you here: " : ""}${summary}` : "Every permission is on."}</span>
        </p>
        {canManage ? (
          <button type="button" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen((o) => !o)} className={buttonClasses("ghost", "sm")}>
            {open ? "Close permissions" : "Permissions"}
          </button>
        ) : null}
      </div>
      {canManage && open ? (
        <form id={panelId} action={save} className="grid gap-3 rounded-md border border-line bg-surface-sunken/60 p-4">
          <input type="hidden" name="userId" value={userId} />
          <fieldset className="grid gap-1" disabled={blocked}>
            <legend className="sr-only">Permissions for {name}</legend>
            {PERMISSIONS.map((p) => {
              const on = permissions[p] !== false;
              // Without the plan, what's on can't be turned off. A disabled box isn't sent, so it's kept on here.
              const locked = Boolean(planReason) && on;
              return (
                <label key={p} className={`flex min-h-11 items-start gap-3 py-1.5 ${blocked || locked ? "" : "cursor-pointer"}`}>
                  <input type="checkbox" name={p} defaultChecked={on} disabled={locked} className="mt-1 size-4 shrink-0 accent-[var(--color-accent)]" />
                  {locked ? <input type="hidden" name={p} value="on" /> : null}
                  <span className="grid gap-0.5">
                    <span className="text-body font-medium">{PERMISSION_LABELS[p].title}</span>
                    <span className="text-sm text-ink-2">{PERMISSION_LABELS[p].detail}</span>
                  </span>
                </label>
              );
            })}
          </fieldset>
          {planReason ? <p className="text-sm text-ink-3">{planReason} What&apos;s turned off can still be turned back on.</p> : null}
          <div className="flex flex-wrap items-center gap-3">
            <button type="submit" disabled={blocked} className={buttonClasses("secondary", "sm")}>
              {saving ? "Saving…" : "Save permissions"}
            </button>
            {disabledReason ? <p className="text-sm text-ink-3">{disabledReason}</p> : null}
          </div>
        </form>
      ) : null}
      {state.status === "done" ? (
        <p role="status" className="flex items-start gap-1.5 text-xs text-verified">
          <CheckCircleIcon size={16} weight="fill" className="shrink-0 text-verified" aria-hidden />
          <span>{state.message}</span>
        </p>
      ) : null}
      {state.status === "error" ? (
        <p role="alert" className="flex items-start gap-1.5 text-xs text-failed">
          <WarningCircleIcon size={16} weight="fill" className="shrink-0 text-failed" aria-hidden />
          <span>{state.message}</span>
        </p>
      ) : null}
    </div>
  );
}
