"use client";

import { CheckCircleIcon, KeyIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { useActionState } from "react";
import { removeModelKeyAction, setModelKeyAction, type ModelKeyState } from "@/app/app/settings/model-key-actions";
import { buttonClasses } from "@/components/ui/button";
import { LocalTime } from "@/components/ui/local-time";

const IDLE: ModelKeyState = { status: "idle" };

const field = "min-h-11 w-full rounded-sm border border-line bg-surface px-3 text-base focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

/**
 * The workspace's own AI key in Settings (ADR 0125). Everyone sees whether
 * one is set and which (its last characters); owners and admins can set or
 * remove it. The key is checked and sealed on the server and never comes
 * back to the browser.
 */
export function ModelKeyCard({
  current,
  canManage,
  disabledReason,
}: {
  current: { hint: string; gateway: string | null; setAt: string; lastUsedAt: string | null } | null;
  canManage: boolean;
  disabledReason: string | null;
}) {
  const [saveState, save, saving] = useActionState(setModelKeyAction, IDLE);
  const [removeState, remove, removing] = useActionState(removeModelKeyAction, IDLE);
  const busy = saving || removing || Boolean(disabledReason);
  const message = saveState.status === "error" ? saveState.message : removeState.status === "error" ? removeState.message : null;

  return (
    <div className="grid gap-4">
      <p className="flex items-start gap-2 text-sm leading-relaxed">
        {current ? (
          <CheckCircleIcon size={18} weight="bold" className="mt-0.5 shrink-0 text-verified" aria-hidden />
        ) : (
          <KeyIcon size={18} className="mt-0.5 shrink-0 text-ink-3" aria-hidden />
        )}
        <span>
          {current ? (
            <>
              Using this workspace&apos;s own Anthropic key, ending <span className="font-mono">{current.hint}</span>
              {current.gateway ? (
                <>
                  , through <span className="font-mono break-all">{current.gateway}</span>
                </>
              ) : null}
              . Set <LocalTime iso={current.setAt} />
              {current.lastUsedAt ? (
                <>
                  , last used <LocalTime iso={current.lastUsedAt} />
                </>
              ) : (
                ", not used yet"
              )}
              .
            </>
          ) : (
            "Using Farbaek's AI, counted against this workspace's AI usage."
          )}
        </span>
      </p>
      <ul className="grid gap-1 text-sm leading-relaxed text-ink-2">
        <li>With your own key, contract drafting, change proposals, rule drafting, AI mapping, security reviews, failure trials, notes and agent runs use it, and don&apos;t count against your plan&apos;s AI usage.</li>
        <li>The second check and image generation still use Farbaek&apos;s AI.</li>
        <li>Your code goes to Anthropic, or your gateway, under your own account&apos;s terms.</li>
      </ul>

      {canManage ? (
        <form action={save} className="grid gap-3 rounded-md border border-line bg-surface-sunken/60 p-4">
          <label className="grid gap-1.5 text-sm font-medium">
            Anthropic API key
            <input name="key" type="password" autoComplete="off" spellCheck={false} required minLength={20} maxLength={300} disabled={busy} className={`${field} font-mono`} />
          </label>
          <label className="grid gap-1.5 text-sm font-medium">
            Company gateway (optional)
            <input name="gateway" type="url" inputMode="url" autoComplete="off" spellCheck={false} placeholder="https://ai-gateway.example.com" disabled={busy} className={`${field} font-mono`} />
            <span className="text-xs font-normal text-ink-3">An Anthropic-compatible address on https. Leave it empty to call Anthropic directly.</span>
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <button type="submit" disabled={busy} className={buttonClasses("secondary", "sm")}>
              {saving ? "Checking…" : current ? "Check and replace" : "Check and save"}
            </button>
            {disabledReason ? <span className="text-sm text-ink-3">{disabledReason}</span> : <span className="text-xs text-ink-3">Farbaek checks the key with a free call before saving it.</span>}
          </div>
        </form>
      ) : (
        <p className="text-sm text-ink-3">Owners and admins can set the workspace&apos;s AI key.</p>
      )}

      {canManage && current ? (
        <form action={remove}>
          <button type="submit" disabled={busy} className={buttonClasses("ghost", "sm")}>
            {removing ? "Removing…" : "Remove key and use Farbaek's AI"}
          </button>
        </form>
      ) : null}

      <div aria-live="polite" className="empty:hidden">
        {message ? (
          <p role="alert" className="flex items-start gap-2 text-sm text-failed">
            <WarningCircleIcon size={16} className="mt-0.5 shrink-0" aria-hidden />
            {message}
          </p>
        ) : saveState.status === "saved" ? (
          <p role="status" className="flex items-start gap-2 text-sm text-ink-2">
            <CheckCircleIcon size={16} weight="bold" className="mt-0.5 shrink-0 text-verified" aria-hidden />
            Saved. Anthropic accepted the key ending <span className="font-mono">{saveState.hint}</span>
            {saveState.gateway ? ` through ${saveState.gateway}` : ""}.
          </p>
        ) : null}
      </div>
    </div>
  );
}
