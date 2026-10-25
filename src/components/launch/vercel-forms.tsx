"use client";

import { RocketLaunchIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { useActionState, useId, useState } from "react";
import { connectVercelAction, launchVercelAction, type VercelState } from "@/app/app/projects/[projectId]/launch/vercel-actions";
import { buttonClasses } from "@/components/ui/button";

const IDLE: VercelState = { status: "idle" };
const input = "w-full rounded-sm border border-line-strong/60 bg-surface px-3.5 text-base shadow-e1 transition-colors focus:border-accent disabled:bg-surface-raised";

function Result({ state }: { state: VercelState }) {
  if (state.status === "error")
    return (
      <p role="alert" className="flex items-start gap-2 text-sm text-failed">
        <WarningCircleIcon size={16} className="mt-0.5 shrink-0" aria-hidden /> {state.message}
      </p>
    );
  if (state.status === "done")
    return (
      <p role="status" className="text-sm text-verified">
        {state.message}
      </p>
    );
  return null;
}

/** Connect the workspace's own Vercel account (ADR 0078). */
export function ConnectVercel({ projectId, disabledReason }: { projectId: string; disabledReason: string | null }) {
  const [state, action, pending] = useActionState(connectVercelAction, IDLE);
  const id = useId();
  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="projectId" value={projectId} />
      <label htmlFor={`${id}-token`} className="grid gap-2 text-sm">
        <span className="font-medium">Vercel token</span>
        <input id={`${id}-token`} name="token" type="password" required autoComplete="off" spellCheck={false} disabled={Boolean(disabledReason) || pending} className={`${input} h-11 font-mono`} />
        <span className="text-xs leading-relaxed text-ink-3">
          Create one in Vercel under Account settings, then Tokens. Give it an end date and only the scope this needs. Farbaek checks it with Vercel, stores it encrypted, and never shows it again.
        </span>
      </label>
      <label htmlFor={`${id}-team`} className="grid gap-2 text-sm">
        <span className="font-medium">
          Team ID <span className="font-normal text-ink-3">(optional)</span>
        </span>
        <input id={`${id}-team`} name="teamId" autoComplete="off" spellCheck={false} placeholder="team_…" disabled={Boolean(disabledReason) || pending} className={`${input} h-11 font-mono`} />
        <span className="text-xs leading-relaxed text-ink-3">For a Vercel team. Leave it empty to use your personal account.</span>
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending || Boolean(disabledReason)} className={buttonClasses("primary", "sm")}>
          {pending ? "Checking with Vercel…" : "Connect Vercel"}
        </button>
        {disabledReason ? <span className="text-sm text-ink-3">{disabledReason}</span> : null}
      </div>
      <Result state={state} />
    </form>
  );
}

/**
 * The launch authorization (ADR 0078): the project name typed to confirm,
 * and a reason when the evidence isn't verified. The server makes its key
 * once per page, so a second press returns the same launch.
 */
export function LaunchVercel({ projectId, launchKey, target, needsReason, disabledReason }: { projectId: string; launchKey: string; target: string; needsReason: boolean; disabledReason: string | null }) {
  const [state, action, pending] = useActionState(launchVercelAction, IDLE);
  const [name, setName] = useState(target);
  const id = useId();
  const locked = Boolean(disabledReason) || pending || state.status === "done";
  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="key" value={launchKey} />
      <label htmlFor={`${id}-target`} className="grid gap-2 text-sm">
        <span className="font-medium">Vercel project name</span>
        <input
          id={`${id}-target`}
          name="target"
          value={name}
          onChange={(e) => setName(e.target.value.toLowerCase())}
          required
          maxLength={100}
          pattern="[a-z0-9]([a-z0-9-]{0,98}[a-z0-9])?"
          autoComplete="off"
          spellCheck={false}
          disabled={locked}
          className={`${input} h-11 font-mono`}
        />
        <span className="text-xs text-ink-3">Lowercase letters, numbers and hyphens. Vercel makes the project if it doesn&apos;t exist yet.</span>
      </label>
      {needsReason ? (
        <label htmlFor={`${id}-reason`} className="grid gap-2 text-sm">
          <span className="font-medium">Why launch without verified evidence</span>
          <textarea id={`${id}-reason`} name="reason" required minLength={10} maxLength={500} rows={3} disabled={locked} className={`${input} py-2.5`} />
          <span className="text-xs text-ink-3">Recorded with the launch and in the audit log.</span>
        </label>
      ) : null}
      <label htmlFor={`${id}-confirm`} className="grid gap-2 text-sm">
        <span className="font-medium">
          Type <span className="font-mono">{name || "the name"}</span> to confirm
        </span>
        <input id={`${id}-confirm`} name="confirm" required autoComplete="off" spellCheck={false} disabled={locked} className={`${input} h-11 font-mono`} />
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={locked} className={buttonClasses("primary")}>
          <RocketLaunchIcon size={18} weight="bold" aria-hidden />
          {pending ? "Authorizing…" : state.status === "done" ? "Launch started" : "Launch to Vercel"}
        </button>
        {disabledReason ? <span className="text-sm text-ink-3">{disabledReason}</span> : null}
      </div>
      <Result state={state} />
    </form>
  );
}
