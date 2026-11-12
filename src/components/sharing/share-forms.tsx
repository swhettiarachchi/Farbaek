"use client";

import { CheckCircleIcon, CheckIcon, CopyIcon, LinkSimpleIcon, UserPlusIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { useActionState, useId, useState } from "react";
import {
  changeGuestAccessAction,
  createShareLinkAction,
  inviteGuestAction,
  type GuestInviteState,
  type ShareLinkState,
} from "@/app/app/projects/[projectId]/share/actions";
import type { ActionState } from "@/components/ui/confirm-action";
import { buttonClasses } from "@/components/ui/button";
import { inputClasses, LABEL_CLASSES } from "@/components/ui/field";
import { LocalTime } from "@/components/ui/local-time";
import { GUEST_ACCESS, GUEST_ACCESS_LABELS, LINK_LIFETIMES, LINK_LIFETIME_LABELS, type GuestAccess } from "@/core/workspace/sharing";

function ErrorLine({ id, message }: { id?: string; message: string }) {
  return (
    <p id={id} role="alert" className="flex items-start gap-2 text-sm text-failed">
      <WarningCircleIcon size={16} weight="fill" className="mt-0.5 shrink-0 text-failed" aria-hidden />
      <span>{message}</span>
    </p>
  );
}

/** A link shown once, with a copy button. */
function OnceLink({ link, children }: { link: string; children: React.ReactNode }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }
  return (
    <div role="status" className="grid gap-3 rounded-md border border-line bg-surface-raised/70 p-4">
      <p className="flex items-start gap-2 text-sm">
        <CheckCircleIcon size={16} weight="fill" className="mt-0.5 shrink-0 text-verified" aria-hidden />
        <span>{children}</span>
      </p>
      <code className="block rounded-sm border border-line bg-surface px-3 py-2 font-mono text-label break-all">{link}</code>
      <div>
        <button type="button" onClick={() => void copy()} className={buttonClasses("secondary", "sm")}>
          {copied ? <CheckIcon size={16} weight="bold" aria-hidden /> : <CopyIcon size={16} weight="bold" aria-hidden />} {copied ? "Copied" : "Copy link"}
        </button>
      </div>
    </div>
  );
}

const IDLE_INVITE: GuestInviteState = { status: "idle" };

/** Invite someone to this one project. The one-time link is shown here once. */
export function GuestInviteForm({ projectId, disabledReason }: { projectId: string; disabledReason: string | null }) {
  const [state, action, pending] = useActionState(inviteGuestAction, IDLE_INVITE);
  const emailId = useId();
  const accessId = useId();
  const errorId = useId();
  const disabled = disabledReason !== null;
  return (
    <div className="grid gap-4">
      <form action={action} className="grid gap-4">
        <input type="hidden" name="projectId" value={projectId} />
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto]">
          <div className="grid gap-2">
            <label htmlFor={emailId} className={LABEL_CLASSES}>
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
              className={inputClasses()}
            />
          </div>
          <div className="grid gap-2">
            <label htmlFor={accessId} className={LABEL_CLASSES}>
              Access
            </label>
            <select id={accessId} name="access" defaultValue="view" disabled={disabled} className={inputClasses()}>
              {GUEST_ACCESS.map((a) => (
                <option key={a} value={a}>
                  {GUEST_ACCESS_LABELS[a].title}
                </option>
              ))}
            </select>
          </div>
        </div>
        <ul className="grid gap-1 text-xs text-ink-3">
          {GUEST_ACCESS.map((a) => (
            <li key={a}>
              <span className="font-medium text-ink-2">{GUEST_ACCESS_LABELS[a].title}:</span> {GUEST_ACCESS_LABELS[a].detail}
            </li>
          ))}
        </ul>
        {state.status === "error" ? <ErrorLine id={errorId} message={state.message} /> : null}
        <div>
          <button type="submit" disabled={disabled || pending} className={buttonClasses("primary", "sm")}>
            <UserPlusIcon size={16} weight="bold" aria-hidden /> {pending ? "Creating…" : "Create invite link"}
          </button>
        </div>
        {disabledReason ? <p className="text-sm text-ink-3">{disabledReason}</p> : null}
      </form>
      {state.status === "created" ? (
        <OnceLink link={state.link}>
          Send this link to <span className="font-medium">{state.email}</span> yourself. It works once, only for that address, until <LocalTime iso={state.expiresAt} />. It
          isn&apos;t shown again.
        </OnceLink>
      ) : null}
    </div>
  );
}

const IDLE_LINK: ShareLinkState = { status: "idle" };

/** A read-only link anyone can open, until it expires or someone turns it off. */
export function ShareLinkForm({ projectId, disabledReason }: { projectId: string; disabledReason: string | null }) {
  const [state, action, pending] = useActionState(createShareLinkAction, IDLE_LINK);
  const lifetimeId = useId();
  const downloadId = useId();
  const disabled = disabledReason !== null;
  return (
    <div className="grid gap-4">
      <form action={action} className="grid gap-4">
        <input type="hidden" name="projectId" value={projectId} />
        <div className="grid gap-2 sm:max-w-xs">
          <label htmlFor={lifetimeId} className={LABEL_CLASSES}>
            How long it works
          </label>
          <select id={lifetimeId} name="lifetime" defaultValue="7" disabled={disabled} className={inputClasses()}>
            {LINK_LIFETIMES.map((l) => (
              <option key={l} value={l}>
                {LINK_LIFETIME_LABELS[l]}
              </option>
            ))}
          </select>
        </div>
        <label htmlFor={downloadId} className="flex min-h-11 items-center gap-3 text-sm text-ink-2">
          <input id={downloadId} name="allowDownload" type="checkbox" disabled={disabled} className="size-5 accent-[var(--color-accent)]" />
          Let them download the files as a .zip
        </label>
        <p className="text-sm text-ink-2">
          Anyone with the link can read this project&apos;s current files without signing in. Files that hold keys or passwords, and text that looks like a key, are never shown.
          Older versions and your tasks stay private.
        </p>
        {state.status === "error" ? <ErrorLine message={state.message} /> : null}
        <div>
          <button type="submit" disabled={disabled || pending} className={buttonClasses("primary", "sm")}>
            <LinkSimpleIcon size={16} weight="bold" aria-hidden /> {pending ? "Creating…" : "Create read-only link"}
          </button>
        </div>
        {disabledReason ? <p className="text-sm text-ink-3">{disabledReason}</p> : null}
      </form>
      {state.status === "created" ? (
        <OnceLink link={state.link}>
          {state.expiresAt ? (
            <>
              It works until <LocalTime iso={state.expiresAt} />, or until you turn it off.
            </>
          ) : (
            <>It works until you turn it off.</>
          )}{" "}
          Copy it now: it isn&apos;t shown again.
        </OnceLink>
      ) : null}
    </div>
  );
}

const IDLE: ActionState = { status: "idle" };

/** Switches a guest between view and edit. */
export function GuestAccessForm({ projectId, guestId, email, access, disabledReason }: { projectId: string; guestId: string; email: string; access: GuestAccess; disabledReason: string | null }) {
  const [state, action, pending] = useActionState(changeGuestAccessAction, IDLE);
  const id = useId();
  return (
    <form action={action} className="grid gap-2">
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="guestId" value={guestId} />
      <div className="flex flex-wrap items-end gap-2">
        <div className="grid gap-1">
          <label htmlFor={id} className="sr-only">
            Access for {email}
          </label>
          <select id={id} name="access" defaultValue={access} disabled={disabledReason !== null} className={inputClasses("min-w-36")}>
            {GUEST_ACCESS.map((a) => (
              <option key={a} value={a}>
                {GUEST_ACCESS_LABELS[a].title}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" disabled={disabledReason !== null || pending} className={buttonClasses("secondary", "sm")}>
          {pending ? "Saving…" : "Save"}
        </button>
      </div>
      {state.status === "error" ? <ErrorLine message={state.message} /> : null}
      {state.status === "done" ? (
        <p role="status" className="flex items-start gap-2 text-sm text-verified">
          <CheckCircleIcon size={16} weight="fill" className="mt-0.5 shrink-0 text-verified" aria-hidden />
          <span>{state.message}</span>
        </p>
      ) : null}
    </form>
  );
}
