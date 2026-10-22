"use client";

import { CheckCircleIcon, DownloadSimpleIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { useId, useRef, useState, useTransition } from "react";
import { previewCapsuleAction, type CapsulePreview } from "@/app/app/mesh/actions";
import { buttonClasses } from "@/components/ui/button";
import { SKIP_LABELS, formatBytes, type SkipReason } from "@/core/workspace/files";

export interface SendableProject {
  id: string;
  name: string;
  archived: boolean;
}

const reasonLabel = (reason: string) => (reason in SKIP_LABELS ? SKIP_LABELS[reason as SkipReason] : "Left out");

/**
 * Send a Capsule: pick a project, see what it holds and what's left out, then
 * download it. The preview packs on the server exactly as the download does.
 */
export function CapsuleSend({ projects }: { projects: SendableProject[] }) {
  const id = useId();
  const [projectId, setProjectId] = useState("");
  const [preview, setPreview] = useState<CapsulePreview | null>(null);
  const [pending, startTransition] = useTransition();
  // Only the latest choice may set the preview, however the replies arrive.
  const latest = useRef("");

  function choose(next: string) {
    setProjectId(next);
    setPreview(null);
    latest.current = next;
    if (!next) return;
    startTransition(async () => {
      const result = await previewCapsuleAction(next);
      if (latest.current === next) setPreview(result);
    });
  }

  if (projects.length === 0) {
    return <p className="text-sm leading-relaxed text-ink-2">There are no projects in this workspace yet. Create one, or open a Capsule here as a new project.</p>;
  }

  const byReason = new Map<string, string[]>();
  if (preview?.status === "ok") for (const e of preview.excluded) byReason.set(e.reason, [...(byReason.get(e.reason) ?? []), e.path]);

  return (
    <div className="grid gap-4">
      <label className="grid gap-1.5" htmlFor={`${id}-project`}>
        <span className="text-sm font-medium">Project</span>
        <select
          id={`${id}-project`}
          value={projectId}
          onChange={(e) => choose(e.target.value)}
          className="h-11 w-full min-w-0 rounded-sm border border-line bg-surface px-3 text-base text-ink outline-none focus:border-accent/60"
        >
          <option value="">Choose a project</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.archived ? `${p.name} (archived)` : p.name}
            </option>
          ))}
        </select>
      </label>

      <div aria-live="polite" className="grid gap-4">
        {pending ? (
          <div className="grid gap-2" role="status">
            <span className="sr-only">Packing the project to preview it…</span>
            <span className="h-4 w-2/3 animate-pulse rounded-full bg-surface-raised motion-reduce:animate-none" />
            <span className="h-4 w-1/2 animate-pulse rounded-full bg-surface-raised motion-reduce:animate-none" />
          </div>
        ) : null}

        {preview?.status === "error" ? (
          <p role="alert" className="flex items-start gap-2 text-sm text-failed">
            <WarningCircleIcon size={16} className="mt-0.5 shrink-0" aria-hidden /> {preview.message}
          </p>
        ) : null}

        {preview?.status === "ok" ? (
          <div className="grid gap-4 motion-safe:animate-[usage-in_220ms_cubic-bezier(0.16,1,0.3,1)_both]">
            <p className="flex items-start gap-2 text-[15px]">
              <CheckCircleIcon size={18} weight="fill" className="mt-0.5 shrink-0 text-verified" aria-hidden />
              <span>
                <span className="font-medium">
                  {preview.files.toLocaleString("en-US")} {preview.files === 1 ? "file" : "files"}
                </span>
                , {formatBytes(preview.bytes)}. Each one gets a BLAKE3 hash, so the person who opens it can check that nothing changed on the way.
              </span>
            </p>

            {preview.excludedCount > 0 ? (
              <details className="rounded-sm border border-line bg-surface-raised/50 px-4 py-3 text-sm">
                <summary className="cursor-pointer font-medium">
                  {preview.excludedCount.toLocaleString("en-US")} {preview.excludedCount === 1 ? "file stays" : "files stay"} behind
                </summary>
                <ul className="mt-3 grid gap-3">
                  {[...byReason].map(([reason, paths]) => (
                    <li key={reason}>
                      <p className="text-ink-2">
                        {reasonLabel(reason)} <span className="text-ink-3 tabular">({paths.length.toLocaleString("en-US")})</span>
                      </p>
                      <ul className="mt-1 grid gap-0.5 font-mono text-xs text-ink-3">
                        {paths.slice(0, 8).map((p) => (
                          <li key={p} className="truncate">
                            {p}
                          </li>
                        ))}
                        {paths.length > 8 ? <li>and {(paths.length - 8).toLocaleString("en-US")} more</li> : null}
                      </ul>
                    </li>
                  ))}
                  {preview.excludedCount > preview.excluded.length ? <li className="text-ink-3">The first {preview.excluded.length} are listed here; the Capsule names them all.</li> : null}
                </ul>
              </details>
            ) : (
              <p className="text-sm text-ink-2">Nothing was left out: no credentials, dependency folders or binary files were found.</p>
            )}

            <p className="text-xs leading-relaxed text-ink-3">
              Credentials, <span className="font-mono">.env</span> files, keys and anything that looks like a secret stay behind. Detection is pattern-based and not guaranteed, so check what you share.
            </p>

            <div>
              <a href={`/app/projects/${encodeURIComponent(projectId)}/capsule`} download className={buttonClasses("primary", "sm")}>
                <DownloadSimpleIcon size={16} weight="bold" aria-hidden />
                Download Capsule
              </a>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
