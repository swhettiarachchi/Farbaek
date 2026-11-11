"use client";

import { CheckCircleIcon, CopyIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { useActionState, useEffect, useRef, useState } from "react";
import { createApiKeyAction, revokeApiKeyAction, type CreateApiKeyState } from "@/app/app/settings/api-key-actions";
import { buttonClasses } from "@/components/ui/button";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { inputClasses, LABEL_CLASSES } from "@/components/ui/field";
import { LocalTime, RelativeTime } from "@/components/ui/local-time";
import { StatusBadge } from "@/components/ui/status-badge";
import { API_KEY_DAYS, DEFAULT_API_KEY_DAYS, MAX_API_KEYS, apiKeyState, type ApiKeyView } from "@/core/workspace/api-keys";

const IDLE: CreateApiKeyState = { status: "idle" };

const STATE_BADGE = {
  working: { status: "done", label: "Works" },
  expired: { status: "off", label: "Expired" },
  revoked: { status: "off", label: "Revoked" },
} as const;

/**
 * Developer API keys in Settings (ADR 0187). Owners and admins make a key, see it once with a way to copy it, and
 * revoke it when it's no longer used. Nobody, Farbaek included, can show a key again later.
 */
export function ApiKeysPanel({
  keys,
  me,
  now,
  createReason,
  canRevoke,
}: {
  keys: ApiKeyView[];
  me: string;
  now: string;
  /** Why no key can be made now (the plan, a read-only workspace), or null. */
  createReason: string | null;
  /** Revoking still works when the plan no longer includes the API, so old keys can be turned off. */
  canRevoke: boolean;
}) {
  const [state, create, creating] = useActionState(createApiKeyAction, IDLE);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const shown = state.status === "created" && dismissed !== state.key ? state : null;
  const reveal = useRef<HTMLDivElement>(null);
  const at = new Date(now);
  const working = keys.filter((k) => apiKeyState(k, at) === "working").length;
  const full = working >= MAX_API_KEYS;
  const busy = creating || Boolean(createReason);

  // The new key is the one thing to do next: bring it into view and read it out.
  useEffect(() => {
    if (shown) reveal.current?.focus();
  }, [shown]);

  return (
    <div className="grid gap-5">
      {shown ? (
        <div ref={reveal} tabIndex={-1} role="status" className="grid gap-3 rounded-md border border-accent/30 bg-accent/[0.04] p-4 outline-none">
          <p className="text-sm font-medium text-ink">
            Copy &ldquo;{shown.name}&rdquo; now. Farbaek shows a key only once, and can&apos;t show it again.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <input
              readOnly
              value={shown.key}
              aria-label={`The new API key, ${shown.name}`}
              onFocus={(e) => e.currentTarget.select()}
              className={inputClasses("min-w-0 flex-1 font-mono")}
            />
            <CopyKey value={shown.key} />
          </div>
          <p className="text-sm text-ink-2">
            It works for {shown.days} days. Keep it in a secret store, such as your CI&apos;s secrets, never in a project&apos;s files. Farbaek flags keys it finds in imported files.
          </p>
          <div>
            <button type="button" onClick={() => setDismissed(shown.key)} className={buttonClasses("secondary", "sm")}>
              I&apos;ve saved it
            </button>
          </div>
        </div>
      ) : null}

      {createReason ? (
        <p className="text-sm text-ink-2">{createReason}</p>
      ) : (
        <form action={create} className="grid gap-3 rounded-md border border-line bg-surface-sunken/60 p-4 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-end">
          <label className="grid gap-1.5">
            <span className={LABEL_CLASSES}>Key name</span>
            <input name="name" required maxLength={60} autoComplete="off" placeholder="For example: GitHub Actions" disabled={busy || full} className={inputClasses()} />
          </label>
          <label className="grid gap-1.5">
            <span className={LABEL_CLASSES}>Works for</span>
            <select name="days" defaultValue={DEFAULT_API_KEY_DAYS} disabled={busy || full} className={inputClasses("sm:w-36")}>
              {API_KEY_DAYS.map((d) => (
                <option key={d} value={d}>
                  {d} days
                </option>
              ))}
            </select>
          </label>
          <button type="submit" disabled={busy || full} className={buttonClasses("primary", "sm")}>
            {creating ? "Making the key…" : "Make key"}
          </button>
          {full ? <p className="text-sm text-ink-2 sm:col-span-3">This workspace has {MAX_API_KEYS} working keys, the most it can have. Revoke one you no longer use to make another.</p> : null}
        </form>
      )}

      <div aria-live="polite" className="empty:hidden">
        {state.status === "error" ? (
          <p role="alert" className="flex items-start gap-2 text-sm text-failed">
            <WarningCircleIcon size={16} weight="fill" className="mt-0.5 shrink-0" aria-hidden />
            <span>{state.message}</span>
          </p>
        ) : null}
      </div>

      {keys.length === 0 ? (
        <p className="text-sm text-ink-3">No keys yet. A key you make shows here, with when it was last used.</p>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-md border border-line">
          {keys.map((k) => {
            const s = apiKeyState(k, at);
            return (
              <li key={k.id} className="grid gap-2 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                <div className="grid min-w-0 gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-medium text-ink">{k.name}</span>
                    <span className="font-mono text-xs text-ink-3">{k.hint}…</span>
                    <StatusBadge status={STATE_BADGE[s].status} label={STATE_BADGE[s].label} />
                  </div>
                  <p className="text-xs leading-relaxed text-ink-3">
                    Made {k.createdBy === me ? "by you" : "by another owner or admin"} on <LocalTime iso={k.createdAt} />.{" "}
                    {k.lastUsedAt ? (
                      <>
                        Last used <RelativeTime iso={k.lastUsedAt} />.
                      </>
                    ) : (
                      "Not used yet."
                    )}{" "}
                    {s === "revoked" && k.revokedAt ? (
                      <>
                        Revoked on <LocalTime iso={k.revokedAt} />.
                      </>
                    ) : s === "expired" ? (
                      <>
                        Ended on <LocalTime iso={k.expiresAt} />.
                      </>
                    ) : (
                      <>
                        Works until <LocalTime iso={k.expiresAt} />.
                      </>
                    )}
                  </p>
                </div>
                {s === "working" && canRevoke ? (
                  <ConfirmAction
                    action={revokeApiKeyAction}
                    fields={{ id: k.id }}
                    trigger="Revoke"
                    triggerVariant="ghost"
                    question={<>Revoke &ldquo;{k.name}&rdquo;? Anything using it stops at once, and it can&apos;t be turned back on.</>}
                    confirmLabel="Revoke key"
                    pendingLabel="Revoking…"
                  />
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function CopyKey({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard?.writeText(value).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 2_000);
        });
      }}
      className={buttonClasses("primary", "sm")}
    >
      {copied ? <CheckCircleIcon size={16} weight="fill" aria-hidden /> : <CopyIcon size={16} weight="bold" aria-hidden />}
      {copied ? "Copied" : "Copy key"}
    </button>
  );
}
