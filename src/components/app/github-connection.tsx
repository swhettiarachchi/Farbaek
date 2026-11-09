"use client";

import { ArrowUpRightIcon, CheckCircleIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { useActionState } from "react";
import { removeGitHubTokenAction, setGitHubTokenAction, type GitHubTokenState } from "@/app/app/settings/github-actions";
import { TOKEN_CREATION_URL } from "@/core/github/pull-request";
import { buttonClasses } from "@/components/ui/button";
import { inputClasses, LABEL_CLASSES } from "@/components/ui/field";
import { LocalTime } from "@/components/ui/local-time";
import { StatusGlyph } from "@/components/ui/status-badge";

const IDLE: GitHubTokenState = { status: "idle" };

/**
 * The workspace's GitHub connection in Settings (ADR 0126). Everyone sees
 * whether it's connected and as whom; owners and admins connect a
 * fine-grained token or disconnect it. The token is checked and sealed on
 * the server and never comes back to the browser.
 */
export function GitHubConnectionCard({
  current,
  canManage,
  disabledReason,
}: {
  current: { login: string; tokenHint: string; expiresAt: string | null; setAt: string; lastUsedAt: string | null } | null;
  canManage: boolean;
  disabledReason: string | null;
}) {
  const [saveState, save, saving] = useActionState(setGitHubTokenAction, IDLE);
  const [removeState, remove, removing] = useActionState(removeGitHubTokenAction, IDLE);
  const busy = saving || removing || Boolean(disabledReason);
  const message = saveState.status === "error" ? saveState.message : removeState.status === "error" ? removeState.message : null;

  return (
    <div className="grid gap-4">
      <p className="flex items-start gap-2 text-sm leading-relaxed">
        {/* Connected is verified, not connected is off (ADR 0183). */}
        <StatusGlyph status={current ? "verified" : "off"} className="mt-0.5" />
        <span>
          {current ? (
            <>
              Connected as <span className="font-medium">{current.login}</span>, with the token ending <span className="font-mono">{current.tokenHint}</span>
              {current.expiresAt ? (
                <>
                  , which expires <LocalTime iso={current.expiresAt} />
                </>
              ) : null}
              . {current.lastUsedAt ? <>Last used <LocalTime iso={current.lastUsedAt} />.</> : "Not used yet."}
            </>
          ) : (
            "Not connected. Farbaek can import public repositories without it."
          )}
        </span>
      </p>
      <ul className="grid gap-1 text-sm leading-relaxed text-ink-2">
        <li>With a token, a project linked to a repository can open a pull request for each applied change, with a Farbaek ProofPack status on it.</li>
        <li>Pull requests are opened as the person whose token it is. Anyone here who may publish can open them.</li>
        <li>Farbaek accepts only fine-grained tokens, limited to the repositories you choose.</li>
      </ul>

      {canManage ? (
        <form action={save} className="grid gap-3 rounded-md border border-line bg-surface-sunken/60 p-4">
          <ol className="grid list-decimal gap-1 pl-5 text-sm leading-relaxed text-ink-2">
            <li>
              Open{" "}
              <a href={TOKEN_CREATION_URL} target="_blank" rel="noopener noreferrer" className="font-medium text-accent hover:underline">
                GitHub&apos;s token form
                <ArrowUpRightIcon size={14} weight="bold" className="ml-1 inline align-[-2px]" aria-hidden />
                <span className="sr-only">(opens in a new tab)</span>
              </a>
              , already filled in for Farbaek.
            </li>
            <li>Under Repository access, choose only the repositories Farbaek should change.</li>
            <li>Generate the token and paste it here.</li>
          </ol>
          <label className="grid gap-1.5">
            <span className={LABEL_CLASSES}>Fine-grained token</span>
            <input name="token" type="password" autoComplete="off" spellCheck={false} required minLength={40} maxLength={300} placeholder="github_pat_…" disabled={busy} className={inputClasses("font-mono")} />
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <button type="submit" disabled={busy} className={buttonClasses("secondary", "sm")}>
              {saving ? "Checking…" : current ? "Check and replace" : "Check and save"}
            </button>
            {disabledReason ? <span className="text-sm text-ink-3">{disabledReason}</span> : <span className="text-xs text-ink-3">Farbaek asks GitHub whose token it is before saving it.</span>}
          </div>
        </form>
      ) : (
        <p className="text-sm text-ink-3">Owners and admins can connect GitHub.</p>
      )}

      {canManage && current ? (
        <form action={remove}>
          <button type="submit" disabled={busy} className={buttonClasses("ghost", "sm")}>
            {removing ? "Disconnecting…" : "Disconnect GitHub"}
          </button>
        </form>
      ) : null}

      <div aria-live="polite" className="empty:hidden">
        {message ? (
          <p role="alert" className="flex items-start gap-2 text-sm text-failed">
            <WarningCircleIcon size={16} weight="fill" className="mt-0.5 shrink-0 text-failed" aria-hidden />
            <span>{message}</span>
          </p>
        ) : saveState.status === "saved" ? (
          <p role="status" className="flex items-start gap-2 text-sm text-ink-2">
            <CheckCircleIcon size={16} weight="fill" className="mt-0.5 shrink-0 text-verified" aria-hidden />
            <span>
              Connected as {saveState.login}, with the token ending <span className="font-mono">{saveState.hint}</span>.
            </span>
          </p>
        ) : null}
      </div>
    </div>
  );
}
