"use client";

import { CheckCircleIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { useActionState, useState } from "react";
import { removeMemberAction, setMemberRoleAction, type FormState } from "@/app/app/actions";
import { buttonClasses } from "@/components/ui/button";

type Role = "owner" | "admin" | "member" | "viewer";

const IDLE: FormState = { status: "idle" };
const LABEL: Record<Role, string> = { owner: "Owner", admin: "Admin", member: "Member", viewer: "Viewer" };

/**
 * One person's row controls (ADR 0064): change their role and remove them,
 * or, on your own row, leave. What's offered follows the rules the database
 * enforces; a refusal still comes back in words.
 */
export function MemberControls({
  userId,
  name,
  role,
  actorRole,
  isSelf,
  lastOwner,
  disabledReason,
}: {
  userId: string;
  name: string;
  role: Role;
  actorRole: Role | null;
  isSelf: boolean;
  /** This person is the workspace's only owner. */
  lastOwner: boolean;
  disabledReason: string | null;
}) {
  const [roleState, changeRole, changing] = useActionState(setMemberRoleAction, IDLE);
  const [removeState, remove, removing] = useActionState(removeMemberAction, IDLE);
  const [confirming, setConfirming] = useState(false);

  const roles: Role[] =
    actorRole === "owner" ? ["owner", "admin", "member", "viewer"] : actorRole === "admin" && (role === "member" || role === "viewer") ? ["member", "viewer"] : [];
  const canChangeRole = !isSelf && roles.length > 0;
  const canRemove = isSelf ? !lastOwner : actorRole === "owner" || (actorRole === "admin" && (role === "member" || role === "viewer"));
  const blocked = Boolean(disabledReason);
  const message = removeState.status === "error" ? removeState.message : roleState.status === "error" ? roleState.message : roleState.status === "done" ? roleState.message : null;

  if (!canChangeRole && !canRemove) {
    return isSelf && lastOwner ? <p className="text-xs text-ink-3">You&apos;re the only owner, so you can&apos;t leave.</p> : null;
  }

  return (
    <div className="grid justify-items-start gap-2 sm:justify-items-end">
      <div className="flex flex-wrap items-center gap-2">
        {canChangeRole ? (
          <form action={changeRole} className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="userId" value={userId} />
            <label className="sr-only" htmlFor={`role-${userId}`}>
              Role for {name}
            </label>
            <select
              id={`role-${userId}`}
              name="role"
              defaultValue={role}
              disabled={blocked || changing}
              className="h-11 rounded-sm border border-line-strong/60 bg-surface px-3 text-base sm:text-sm"
            >
              {roles.map((r) => (
                <option key={r} value={r}>
                  {LABEL[r]}
                </option>
              ))}
            </select>
            <button type="submit" disabled={blocked || changing} className={buttonClasses("secondary", "sm")}>
              {changing ? "Saving…" : "Change"}
            </button>
          </form>
        ) : null}
        {canRemove ? (
          confirming ? (
            <form action={remove} className="flex flex-wrap items-center gap-2">
              <input type="hidden" name="userId" value={userId} />
              <button type="submit" disabled={blocked || removing} className={buttonClasses("danger", "sm")}>
                {removing ? (isSelf ? "Leaving…" : "Removing…") : isSelf ? "Leave for good" : `Remove ${name}`}
              </button>
              <button type="button" onClick={() => setConfirming(false)} className={buttonClasses("ghost", "sm")}>
                Keep
              </button>
            </form>
          ) : (
            <button type="button" disabled={blocked} onClick={() => setConfirming(true)} className={buttonClasses("ghost", "sm")}>
              {isSelf ? "Leave" : "Remove"}
            </button>
          )
        ) : null}
      </div>
      {message ? (
        <p role={roleState.status === "done" && removeState.status !== "error" ? "status" : "alert"} className={`flex items-start gap-1.5 text-xs ${roleState.status === "done" && removeState.status !== "error" ? "text-verified" : "text-failed"}`}>
          {roleState.status === "done" && removeState.status !== "error" ? (
            <CheckCircleIcon size={16} weight="fill" className="shrink-0 text-verified" aria-hidden />
          ) : (
            <WarningCircleIcon size={16} weight="fill" className="shrink-0 text-failed" aria-hidden />
          )}
          <span>{message}</span>
        </p>
      ) : null}
    </div>
  );
}
