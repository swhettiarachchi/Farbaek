"use client";

import { GithubLogoIcon, LockSimpleIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { useActionState, useId } from "react";
import { importGitHubAction, type GitHubImportState } from "@/app/app/projects/github-actions";
import { buttonClasses } from "@/components/ui/button";

const IDLE: GitHubImportState = { status: "idle" };

/** Whether this person can import private repositories here, and as whom (ADR 0144). */
export type PrivateImport = { ready: true; login: string } | { ready: false; reason: string };

/**
 * Import a GitHub repository as a new project (ADR 0074). The server
 * downloads it; this form only names it. Private ones are read with the
 * workspace's GitHub token, by owners and admins.
 */
export function GitHubImportForm({ disabledReason, privateImport }: { disabledReason: string | null; privateImport: PrivateImport }) {
  const [state, action, pending] = useActionState(importGitHubAction, IDLE);
  const id = useId();
  const error = state.status === "error" ? state.message : null;
  const disabled = Boolean(disabledReason) || pending;
  return (
    <form action={action} className="grid gap-3">
      <label htmlFor={id} className="text-sm font-medium">
        Repository
      </label>
      <div className="relative">
        <GithubLogoIcon size={16} weight="bold" className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-3" aria-hidden />
        <input
          id={id}
          name="source"
          required
          maxLength={400}
          defaultValue={state.status === "error" ? state.source : undefined}
          placeholder="github.com/owner/repo"
          autoComplete="off"
          spellCheck={false}
          inputMode="url"
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={`${id}-hint ${id}-private${error ? ` ${id}-error` : ""}`}
          className="h-11 w-full rounded-sm border border-line-strong/60 bg-surface pl-10 pr-3.5 font-mono text-base shadow-e1 transition-colors placeholder:text-ink-3 focus:border-accent disabled:bg-surface-raised"
        />
      </div>
      <p id={`${id}-hint`} className="text-xs leading-relaxed text-ink-3">
        Farbaek downloads the latest commit, leaves out secrets, binaries and dependency folders, and notes which commit it came from.
      </p>
      <p id={`${id}-private`} className="flex items-start gap-2 text-xs leading-relaxed text-ink-2">
        <LockSimpleIcon size={14} weight="bold" className="mt-0.5 shrink-0 text-ink-3" aria-hidden />
        {privateImport.ready ? (
          <span>
            Private repositories are read with the workspace&apos;s GitHub connection ({privateImport.login}), when that connection can read them. Each one is recorded in History.
          </span>
        ) : (
          <span>{privateImport.reason}</span>
        )}
      </p>
      {privateImport.ready ? (
        <label className="flex min-h-11 items-center gap-3 text-sm">
          <input type="checkbox" name="link" defaultChecked disabled={disabled} className="size-4 shrink-0 accent-[var(--color-accent)]" />
          <span>For a private repository, link the project to it so applied changes open pull requests there</span>
        </label>
      ) : null}
      {error ? (
        <p id={`${id}-error`} role="alert" className="flex items-start gap-2 text-sm text-failed">
          <WarningCircleIcon size={16} weight="fill" className="mt-0.5 shrink-0 text-failed" aria-hidden /> {error}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={disabled} className={buttonClasses("secondary")}>
          {pending ? "Downloading from GitHub…" : "Import from GitHub"}
        </button>
        {disabledReason ? <p className="text-sm text-ink-3">{disabledReason}</p> : null}
      </div>
    </form>
  );
}
