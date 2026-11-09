"use client";

import { CheckCircleIcon, CloudArrowUpIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { useActionState, useId, useState } from "react";
import { connectProviderAction, launchProviderAction, type LaunchState } from "@/app/app/projects/[projectId]/launch/launch-actions";
import { buttonClasses } from "@/components/ui/button";
import type { LaunchProvider } from "@/core/launch/providers";
import { PROVIDER_COPY } from "./provider-copy";

const IDLE: LaunchState = { status: "idle" };
const input = "w-full rounded-sm border border-line-strong/60 bg-surface px-3.5 text-base shadow-e1 transition-colors focus:border-accent disabled:bg-surface-raised";

function Result({ state }: { state: LaunchState }) {
  if (state.status === "error")
    return (
      <p role="alert" className="flex items-start gap-2 text-sm text-failed">
        <WarningCircleIcon size={16} weight="fill" className="mt-0.5 shrink-0" aria-hidden /> {state.message}
      </p>
    );
  if (state.status === "done")
    return (
      <p role="status" className="flex items-start gap-2 text-sm text-verified">
        <CheckCircleIcon size={16} weight="fill" className="mt-0.5 shrink-0" aria-hidden /> {state.message}
      </p>
    );
  return null;
}

/** Connect the workspace's own account with a hosting provider (ADR 0078, ADR 0093). */
export function ConnectProvider({ provider, projectId, disabledReason }: { provider: LaunchProvider; projectId: string; disabledReason: string | null }) {
  const [state, action, pending] = useActionState(connectProviderAction, IDLE);
  const id = useId();
  const copy = PROVIDER_COPY[provider];
  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="provider" value={provider} />
      <input type="hidden" name="projectId" value={projectId} />
      <label htmlFor={`${id}-token`} className="grid gap-2 text-sm">
        <span className="font-medium">{copy.tokenLabel}</span>
        <input id={`${id}-token`} name="token" type="password" required autoComplete="off" spellCheck={false} disabled={Boolean(disabledReason) || pending} className={`${input} h-11 font-mono`} />
        <span className="text-xs leading-relaxed text-ink-3">{copy.tokenHelp}</span>
      </label>
      <label htmlFor={`${id}-team`} className="grid gap-2 text-sm">
        <span className="font-medium">
          {copy.teamLabel} <span className="font-normal text-ink-3">(optional)</span>
        </span>
        <input id={`${id}-team`} name="teamId" autoComplete="off" spellCheck={false} placeholder={copy.teamPlaceholder} disabled={Boolean(disabledReason) || pending} className={`${input} h-11 font-mono`} />
        <span className="text-xs leading-relaxed text-ink-3">{copy.teamHelp}</span>
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending || Boolean(disabledReason)} className={buttonClasses("primary", "sm")}>
          {pending ? `Checking with ${copy.name}…` : `Connect ${copy.name}`}
        </button>
        {disabledReason ? <span className="text-sm text-ink-3">{disabledReason}</span> : null}
      </div>
      <Result state={state} />
    </form>
  );
}

/**
 * The launch authorization (ADR 0078): the name typed to confirm, and a
 * reason when the evidence isn't verified. The server makes its key once
 * per page, so a second press returns the same launch.
 */
export function LaunchToProvider({
  provider,
  projectId,
  launchKey,
  target,
  needsReason,
  disabledReason,
}: {
  provider: LaunchProvider;
  projectId: string;
  launchKey: string;
  target: string;
  needsReason: boolean;
  disabledReason: string | null;
}) {
  const [state, action, pending] = useActionState(launchProviderAction, IDLE);
  const [name, setName] = useState(target);
  const id = useId();
  const copy = PROVIDER_COPY[provider];
  const locked = Boolean(disabledReason) || pending || state.status === "done";
  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="provider" value={provider} />
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="key" value={launchKey} />
      <label htmlFor={`${id}-target`} className="grid gap-2 text-sm">
        <span className="font-medium">{copy.targetLabel}</span>
        <input
          id={`${id}-target`}
          name="target"
          value={name}
          onChange={(e) => setName(e.target.value.toLowerCase())}
          required
          maxLength={copy.targetMax}
          pattern={copy.targetPattern}
          autoComplete="off"
          spellCheck={false}
          disabled={locked}
          className={`${input} h-11 font-mono`}
        />
        <span className="text-xs leading-relaxed text-ink-3">{copy.targetHelp}</span>
      </label>
      {needsReason ? (
        <label htmlFor={`${id}-reason`} className="grid gap-2 text-sm">
          <span className="font-medium">Why launch before the checks have passed</span>
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
          <CloudArrowUpIcon size={16} weight="bold" aria-hidden />
          {pending ? "Authorizing…" : state.status === "done" ? "Launch started" : `Launch to ${copy.name}`}
        </button>
        {disabledReason ? <span className="text-sm text-ink-3">{disabledReason}</span> : null}
      </div>
      <Result state={state} />
    </form>
  );
}
