"use client";

import { CheckCircleIcon, SignOutIcon, TrashIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { useActionState, useState } from "react";
import { deleteAccountAction, type FormState } from "@/app/app/actions";
import { buttonClasses } from "@/components/ui/button";

const IDLE: FormState = { status: "idle" };

export type DeletionRow = { orgId: string; orgName: string; outcome: "deleted" | "left" | "blocked_last_owner" | "blocked_paid" | "blocked_review"; words: string };

const ICON = {
  deleted: <TrashIcon size={16} weight="bold" className="mt-1 shrink-0 text-failed" aria-hidden />,
  left: <SignOutIcon size={16} weight="bold" className="mt-1 shrink-0 text-ink-3" aria-hidden />,
  // Each one has to be sorted out before the account can go: a look first, so burnt orange (ADR 0183).
  blocked_last_owner: <WarningCircleIcon size={16} weight="fill" className="mt-1 shrink-0 text-caution" aria-hidden />,
  blocked_paid: <WarningCircleIcon size={16} weight="fill" className="mt-1 shrink-0 text-caution" aria-hidden />,
  blocked_review: <WarningCircleIcon size={16} weight="fill" className="mt-1 shrink-0 text-caution" aria-hidden />,
};

/**
 * Deleting your account (ADR 0064): every workspace and what happens to it,
 * first. Anything blocked says what to do; the button stays off until it's
 * sorted and the person types their address.
 */
export function DeleteAccount({ email, rows, disabledReason }: { email: string; rows: DeletionRow[] | null; disabledReason: string | null }) {
  const [state, action, pending] = useActionState(deleteAccountAction, IDLE);
  const [typed, setTyped] = useState("");
  const blocked = (rows ?? []).some((r) => r.outcome.startsWith("blocked"));
  const reason = disabledReason ?? (blocked ? "Sort out the workspaces marked above first. Nothing is deleted until then." : null);
  const matches = typed.trim().toLowerCase() === email.toLowerCase();

  return (
    <div className="grid gap-5">
      {/* Unknown (the demo, or the check failed): no list, only the reason below. */}
      {rows === null ? null : rows.length ? (
        <ul className="grid gap-3">
          {rows.map((r) => (
            <li key={r.orgId} className="flex items-start gap-2.5">
              {ICON[r.outcome]}
              <span className="min-w-0">
                <span className="block text-[0.9375rem] font-medium break-words">{r.orgName}</span>
                <span className="block text-sm text-ink-2">{r.words}</span>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="flex items-start gap-2.5 text-sm text-ink-2">
          <CheckCircleIcon size={16} weight="fill" className="mt-0.5 shrink-0 text-verified" aria-hidden /> You&apos;re not in any workspace.
        </p>
      )}
      <p className="text-sm leading-relaxed text-ink-2">
        Your sign-in, email choices and support requests go too. Nightly backups that still hold them are overwritten within 14 days. This can&apos;t be undone.
      </p>
      <form action={action} className="grid gap-3">
        <label htmlFor="delete-confirm" className="text-sm font-medium">
          Type <span className="break-all font-mono text-[0.8125rem]">{email}</span> to confirm
        </label>
        <input
          id="delete-confirm"
          name="confirm"
          autoComplete="off"
          spellCheck={false}
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          disabled={Boolean(reason) || pending}
          className="h-11 w-full max-w-md rounded-sm border border-line-strong/60 bg-surface px-3.5 text-base shadow-e1 focus:border-accent disabled:bg-surface-raised"
        />
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" disabled={Boolean(reason) || pending || !matches} className={buttonClasses("danger", "sm")}>
            {pending ? "Deleting…" : "Delete my account"}
          </button>
          {state.status === "error" ? (
            <p role="alert" className="flex items-start gap-2 text-sm text-failed">
              <WarningCircleIcon size={16} weight="fill" className="mt-0.5 shrink-0 text-failed" aria-hidden />
              <span>{state.message}</span>
            </p>
          ) : null}
          {reason ? <p className="text-sm text-ink-3">{reason}</p> : null}
        </div>
      </form>
    </div>
  );
}
