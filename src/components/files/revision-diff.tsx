"use client";

import { ArrowCounterClockwiseIcon, WarningCircleIcon } from "@phosphor-icons/react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { restoreRevisionAction } from "@/app/app/actions";
import { buttonClasses } from "@/components/ui/button";

const Surface = dynamic(() => import("./codemirror"), {
  ssr: false,
  loading: () => (
    <div className="flex h-64 items-center justify-center rounded-md border border-line bg-surface-raised text-sm text-ink-3" role="status">
      Loading the comparison…
    </div>
  ),
});

/**
 * What changed between an earlier revision and the current file, and a
 * restore that saves the earlier content as the next revision.
 */
export function RevisionDiff({
  projectId,
  path,
  revision,
  revisionContent,
  current,
  nextRevision,
  disabledReason,
}: {
  projectId: string;
  path: string;
  revision: number;
  revisionContent: string;
  /** The current file, or null when it has been deleted. */
  current: { revision: number; content: string } | null;
  /** The revision number a restore would create. */
  nextRevision: number;
  disabledReason: string | null;
}) {
  const router = useRouter();
  const [stats, setStats] = useState<{ added: number; removed: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startRestore] = useTransition();
  const same = current !== null && current.content === revisionContent;

  useEffect(() => {
    let live = true;
    import("./codemirror").then(({ diffStats }) => live && setStats(diffStats(revisionContent, current?.content ?? "")));
    return () => {
      live = false;
    };
  }, [revisionContent, current]);

  function restore() {
    setError(null);
    startRestore(async () => {
      const r = await restoreRevisionAction({ projectId, path, revision, expectedRevision: current?.revision ?? 0 });
      if (r.status === "error") return setError(r.message);
      router.push(`/app/projects/${projectId}/files?path=${encodeURIComponent(r.path)}`);
      router.refresh();
    });
  }

  return (
    <div className="grid min-w-0 gap-3">
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <span className="font-medium">{current ? `Revision ${revision} compared with the current file (revision ${current.revision})` : `Revision ${revision}. The file has since been deleted.`}</span>
        {stats && current ? (
          <span className="font-mono text-xs">
            <span className="text-verified">+{stats.added}</span> <span className="text-failed">−{stats.removed}</span> lines since then
          </span>
        ) : null}
      </p>
      {same ? (
        <p className="text-sm text-ink-2">This revision has the same content as the current file.</p>
      ) : (
        <Surface key={`${revision}`} path={path} value={current?.content ?? ""} original={revisionContent} controls={false} label={`Changes since revision ${revision} of ${path}`} />
      )}
      {error ? (
        <p role="alert" className="flex items-start gap-2 text-sm text-failed">
          <WarningCircleIcon size={16} className="mt-0.5 shrink-0" aria-hidden />
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={restore} disabled={pending || same || Boolean(disabledReason)} className={buttonClasses("primary", "sm")}>
          <ArrowCounterClockwiseIcon size={16} aria-hidden />
          {pending ? "Restoring…" : `Restore revision ${revision}`}
        </button>
        <p className="text-xs text-ink-3">
          {disabledReason ?? `Saves this content as revision ${nextRevision}. Nothing in the history is removed.`}
        </p>
      </div>
    </div>
  );
}
