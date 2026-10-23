"use client";

import { ArrowLeftIcon, CheckCircleIcon, GitDiffIcon, WarningCircleIcon } from "@phosphor-icons/react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { saveFileAction } from "@/app/app/actions";
import { buttonClasses } from "@/components/ui/button";
import { WORKSPACE_LIMITS } from "@/config/workspace";
import { SKIP_LABELS, containsSecret, formatBytes, screenPath } from "@/core/workspace/files";

const Surface = dynamic(() => import("./codemirror"), {
  ssr: false,
  loading: () => (
    <div className="flex h-64 items-center justify-center rounded-md border border-line bg-surface-raised text-sm text-ink-3" role="status">
      Loading the editor…
    </div>
  ),
});

const fileHref = (projectId: string, path: string) => `/app/projects/${projectId}/files?path=${encodeURIComponent(path)}`;

/**
 * Edit, then review the exact change as a diff (accepting or rejecting each
 * chunk), then save it as a new revision. A new file starts empty at
 * revision 0. The server checks paths, size, secrets and the revision again.
 */
export function FileEditor({
  projectId,
  path: initialPath,
  initialContent,
  revision,
  disabledReason,
}: {
  projectId: string;
  /** Null for a new file. */
  path: string | null;
  initialContent: string;
  revision: number;
  disabledReason: string | null;
}) {
  const router = useRouter();
  const isNew = initialPath === null;
  const [path, setPath] = useState(initialPath ?? "");
  const [draft, setDraft] = useState(initialContent);
  const [reviewed, setReviewed] = useState(initialContent);
  const [mode, setMode] = useState<"edit" | "review">("edit");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<number | null>(null);
  const [stats, setStats] = useState<{ added: number; removed: number } | null>(null);
  const [pending, startSave] = useTransition();

  const dirty = draft !== initialContent || (isNew && path.trim() !== "");
  const bytes = new TextEncoder().encode(mode === "review" ? reviewed : draft).length;
  const pathCheck = isNew ? (path.trim() ? screenPath(path.trim()) : null) : null;
  const pathError =
    pathCheck && !pathCheck.ok
      ? pathCheck.reason === "invalid_path"
        ? (pathCheck.detail ?? SKIP_LABELS.invalid_path)
        : pathCheck.reason === "secret_file"
          ? "Credentials files such as .env or private keys can't be stored in a project. Keep secrets in environment variables."
          : pathCheck.reason === "ignored_folder"
            ? "Files can't go inside dependency or build folders."
            : SKIP_LABELS[pathCheck.reason]
      : null;

  // Warn before leaving with unsaved changes.
  useEffect(() => {
    if (!dirty || saved !== null) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty, saved]);

  // Diff stats for the review step, computed with the same diff the view uses.
  useEffect(() => {
    if (mode !== "review") return;
    let live = true;
    import("./codemirror").then(({ diffStats }) => live && setStats(diffStats(initialContent, reviewed)));
    return () => {
      live = false;
    };
  }, [mode, reviewed, initialContent]);

  function startReview() {
    setError(null);
    if (isNew && (!path.trim() || pathError)) return setError(pathError ?? "Give the file a path, for example src/lib/new-file.ts.");
    if (bytes > WORKSPACE_LIMITS.maxFileBytes) return setError(`Files can be up to ${formatBytes(WORKSPACE_LIMITS.maxFileBytes)}.`);
    if (containsSecret(draft)) return setError("This looks like it contains a secret, such as a private key or an API token. Remove it first. Keep secrets in environment variables.");
    setReviewed(draft);
    setMode("review");
  }

  function save() {
    setError(null);
    startSave(async () => {
      const r = await saveFileAction({ projectId, path: isNew ? path.trim() : initialPath!, content: reviewed, expectedRevision: revision });
      if (r.status === "error") return setError(r.message);
      setSaved(r.revision);
      router.push(fileHref(projectId, r.path));
      router.refresh();
    });
  }

  const cancelHref = isNew ? `/app/projects/${projectId}/files` : fileHref(projectId, initialPath!);
  const unchanged = mode === "review" && reviewed === initialContent && !isNew;

  return (
    <div className="grid min-w-0 gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <Link href={cancelHref} className="inline-flex items-center gap-1.5 text-sm text-ink-2 hover:text-ink">
            <ArrowLeftIcon size={14} aria-hidden /> {isNew ? "All files" : "Back to the file"}
          </Link>
          {isNew ? (
            <div className="mt-2 grid gap-1.5">
              <label htmlFor="new-file-path" className="text-sm font-medium">
                File path
              </label>
              <input
                id="new-file-path"
                value={path}
                onChange={(e) => setPath(e.target.value)}
                disabled={mode === "review"}
                placeholder="src/lib/new-file.ts"
                spellCheck={false}
                autoCapitalize="off"
                aria-invalid={pathError ? true : undefined}
                aria-describedby="new-file-path-hint"
                className="h-11 w-full max-w-md rounded-sm border border-line-strong/60 bg-surface px-3.5 font-mono text-base shadow-e1 focus:border-accent sm:text-sm"
              />
              <p id="new-file-path-hint" className={`text-xs ${pathError ? "text-failed" : "text-ink-3"}`}>
                {pathError ?? "Relative to the project root."}
              </p>
            </div>
          ) : (
            <h2 className="mt-2 font-mono text-[15px] font-medium break-all">{initialPath}</h2>
          )}
        </div>
        <p className="shrink-0 text-xs text-ink-3" aria-live="polite">
          {mode === "edit" ? (dirty ? "Unsaved changes" : "No changes yet") : "Reviewing changes"}. {formatBytes(bytes)}
          {isNew ? null : <>, from revision {revision}</>}
        </p>
      </div>

      {mode === "edit" ? (
        <Surface key="edit" path={isNew ? path || "untitled.txt" : initialPath!} value={draft} label={`Editing ${isNew ? "a new file" : initialPath}`} onChange={setDraft} />
      ) : (
        <div className="grid gap-3">
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            <span className="inline-flex items-center gap-1.5 font-medium">
              <GitDiffIcon size={18} className="text-accent" aria-hidden /> Review the change
            </span>
            {stats ? (
              <span className="font-mono text-xs">
                <span className="text-verified">+{stats.added}</span> <span className="text-failed">−{stats.removed}</span> lines
              </span>
            ) : null}
            <span className="text-xs text-ink-3">Reject a chunk to put the saved text back. What you see here is exactly what gets saved.</span>
          </p>
          <Surface key="review" path={isNew ? path : initialPath!} value={draft} original={initialContent} label={`Changes to ${isNew ? path : initialPath}`} onChange={setReviewed} />
        </div>
      )}

      <div aria-live="polite" className="empty:hidden">
        {error ? (
          <p role="alert" className="flex items-start gap-2 text-sm text-failed">
            <WarningCircleIcon size={16} className="mt-0.5 shrink-0" aria-hidden />
            {error}
          </p>
        ) : null}
        {saved !== null ? (
          <p role="status" className="flex items-center gap-2 text-sm text-verified">
            <CheckCircleIcon size={16} weight="fill" aria-hidden /> Saved as revision {saved}.
          </p>
        ) : null}
        {unchanged ? <p className="text-sm text-ink-2">Every change was rejected, so there&apos;s nothing to save.</p> : null}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {mode === "edit" ? (
          <button type="button" onClick={startReview} disabled={!dirty && !isNew} className={buttonClasses("primary", "sm")}>
            <GitDiffIcon size={16} aria-hidden /> Review changes
          </button>
        ) : (
          <>
            <button type="button" onClick={save} disabled={pending || Boolean(disabledReason) || unchanged || saved !== null} className={buttonClasses("primary", "sm")}>
              {pending ? "Saving…" : isNew ? "Create file" : `Save as revision ${revision + 1}`}
            </button>
            <button
              type="button"
              onClick={() => {
                // Rejected chunks stay rejected when going back to editing.
                setDraft(reviewed);
                setMode("edit");
              }}
              disabled={pending}
              className={buttonClasses("secondary", "sm")}
            >
              Keep editing
            </button>
          </>
        )}
        <Link href={cancelHref} className={buttonClasses("ghost", "sm")}>
          Cancel
        </Link>
        {disabledReason ? <p className="text-sm text-ink-3">{disabledReason}</p> : null}
      </div>
    </div>
  );
}
