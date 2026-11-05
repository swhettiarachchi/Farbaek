"use client";

import { CheckIcon, CopyIcon, LinkSimpleIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { useActionState, useId, useState } from "react";
import { inviteMemberAction, type InviteState } from "@/app/app/actions";
import { buttonClasses } from "@/components/ui/button";
import { LocalTime } from "@/components/ui/local-time";
import { INVITE_ROLE_LABELS, type InviteRole } from "@/core/workspace/invitations";

const IDLE: InviteState = { status: "idle" };

/**
 * Invite someone by email and role. Farbaek doesn't send email yet, so the
 * one-time link is shown here once, to copy and send yourself.
 */
export function InvitePeople({ roles, seats, disabledReason }: { roles: InviteRole[]; seats: string; disabledReason: string | null }) {
  const [state, action, pending] = useActionState(inviteMemberAction, IDLE);
  const [copied, setCopied] = useState(false);
  const emailId = useId();
  const roleId = useId();
  const errorId = useId();
  const disabled = disabledReason !== null || roles.length === 0;

  async function copy(link: string) {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="grid gap-4">
      <form action={action} className="grid gap-4" onSubmit={() => setCopied(false)}>
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto]">
          <div className="grid gap-2">
            <label htmlFor={emailId} className="text-sm font-medium">
              Email address
            </label>
            <input
              id={emailId}
              name="email"
              type="email"
              inputMode="email"
              autoComplete="off"
              required
              disabled={disabled}
              aria-invalid={state.status === "error" ? true : undefined}
              aria-describedby={state.status === "error" ? errorId : undefined}
              className="h-11 rounded-sm border border-line-strong bg-canvas px-3 text-base disabled:opacity-60"
            />
          </div>
          <div className="grid gap-2">
            <label htmlFor={roleId} className="text-sm font-medium">
              Role
            </label>
            <select id={roleId} name="role" defaultValue={roles.includes("member") ? "member" : roles[0]} disabled={disabled} className="h-11 rounded-sm border border-line-strong bg-canvas px-3 text-base disabled:opacity-60">
              {roles.map((r) => (
                <option key={r} value={r}>
                  {INVITE_ROLE_LABELS[r].title}
                </option>
              ))}
            </select>
          </div>
        </div>
        <p className="text-xs text-ink-3">
          {roles.map((r) => `${INVITE_ROLE_LABELS[r].title}: ${INVITE_ROLE_LABELS[r].detail}`).join(" ")} {seats}
        </p>
        {state.status === "error" ? (
          <p id={errorId} role="alert" className="flex items-start gap-2 text-sm text-failed">
            <WarningCircleIcon size={16} className="mt-0.5 shrink-0" aria-hidden />
            {state.message}
          </p>
        ) : null}
        <div>
          <button type="submit" disabled={disabled || pending} className={buttonClasses("primary", "sm")}>
            <LinkSimpleIcon size={16} aria-hidden /> {pending ? "Creating…" : "Create invite link"}
          </button>
        </div>
        {disabledReason ? <p className="text-sm text-ink-3">{disabledReason}</p> : null}
      </form>

      {state.status === "created" ? (
        <div role="status" className="grid gap-3 rounded-md border border-accent/30 bg-accent/[0.04] p-4">
          <p className="text-sm">
            Send this link to <span className="font-medium">{state.email}</span> yourself; Farbaek doesn&apos;t send email yet. It works once, only for that address, until{" "}
            <LocalTime iso={state.expiresAt} />. It isn&apos;t shown again.
          </p>
          <code className="block rounded-sm border border-line bg-surface px-3 py-2 font-mono text-[0.8125rem] break-all">{state.link}</code>
          <div>
            <button type="button" onClick={() => void copy(state.link)} className={buttonClasses("secondary", "sm")}>
              {copied ? <CheckIcon size={16} aria-hidden /> : <CopyIcon size={16} aria-hidden />} {copied ? "Copied" : "Copy link"}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
