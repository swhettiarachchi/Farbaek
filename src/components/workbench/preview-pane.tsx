"use client";

/**
 * The Preview pane of Build's workspace (stage 202, ADR 0219): the project's site, live, in the same locked-down frame as
 * everywhere else (`StaticPreview`, ADR 0027), and beside it the site with the agent's change while one waits for review.
 * It is read from its own route the first time the pane is seen, and again only when the files or the waiting change have
 * changed. A project that can't be shown here says exactly why, with the real way to open it instead; never a made-up frame.
 */
import { ArrowClockwiseIcon, BrowserIcon, WarningCircleIcon } from "@phosphor-icons/react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { PreviewButton } from "@/components/app/preview-button";
import { StaticPreview } from "@/components/preview/static-preview";
import { buttonClasses } from "@/components/ui/button";
import type { RunPreview } from "@/server/workspace/run-preview";

type State = { key: string; preview: RunPreview } | { key: string; error: string } | null;
/** What the preview route sends: the same as `RunPreview`, with the pictures once instead of once per version. */
type Sent = { kind: "unavailable"; reason: string } | { kind: "static"; versions: { id: string; label: string; files: Record<string, string> }[]; images: Record<string, string> };

export function PreviewPane({ projectId, taskId, previewKey, demo }: { projectId: string; taskId: string | null; previewKey: string; demo: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  // A hidden pane has no width, and the preview needs its real one: nothing is read or drawn until the pane is first seen.
  const [seen, setSeen] = useState(false);
  const [state, setState] = useState<State>(null);
  const [again, setAgain] = useState(0);

  useEffect(() => {
    const el = box.current;
    if (!el || seen) return;
    const observer = new ResizeObserver(([entry]) => {
      if ((entry?.contentRect.width ?? 0) > 0) setSeen(true);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [seen]);

  const wanted = `${previewKey}:${again}`;
  useEffect(() => {
    if (!seen) return;
    const stop = new AbortController();
    fetch(`/app/workbench/${projectId}/preview${taskId ? `?task=${taskId}` : ""}`, { cache: "no-store", signal: stop.signal })
      .then(async (res) => {
        const body = (await res.json().catch(() => null)) as { data?: Sent; error?: string } | null;
        if (!res.ok || !body?.data) setState({ key: wanted, error: body?.error ?? "The preview couldn't be read. Try again." });
        else if (body.data.kind !== "static") setState({ key: wanted, preview: body.data });
        else {
          // The site's pictures came once, shared by every version.
          const images = body.data.images;
          setState({ key: wanted, preview: { kind: "static", versions: body.data.versions.map((v) => ({ ...v, images })) } });
        }
      })
      .catch((e: unknown) => {
        if ((e as { name?: string })?.name !== "AbortError") setState({ key: wanted, error: "The preview couldn't be read. Check your connection and try again." });
      });
    return () => stop.abort();
  }, [seen, projectId, taskId, wanted]);

  const loading = state === null || state.key !== wanted;
  const shown = state && "preview" in state ? state.preview : null;

  return (
    <div ref={box} className="h-full overflow-y-auto overscroll-contain">
      <div className="mx-auto flex min-h-full w-full max-w-[90rem] flex-col p-3 sm:p-4">
        {shown?.kind === "static" ? (
          // StaticPreview bleeds to the screen's edge on a phone (-mx-4); this padding is what it bleeds into.
          <div className={`px-4 transition-opacity duration-150 sm:px-0 ${loading ? "opacity-60" : ""}`}>
            <StaticPreview versions={shown.versions} frameClassName="h-[max(20rem,calc(100dvh-18.5rem))] lg:h-[max(18rem,calc(100dvh-var(--wb-preview-chrome,20rem)))]" />
          </div>
        ) : shown?.kind === "unavailable" ? (
          <div className="m-auto grid max-w-md justify-items-center gap-3 py-10 text-center">
            <BrowserIcon size={32} className="text-ink-3" aria-hidden />
            <p className="text-title-4 font-medium tracking-[-0.02em] text-ink">Nothing to show here</p>
            <p className="text-sm leading-relaxed text-ink-2">{shown.reason}</p>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <PreviewButton projectId={projectId} disabledReason={demo ? "Previews need a real workspace." : null} />
              <Link href={`/app/projects/${projectId}`} className={buttonClasses("ghost", "sm")}>
                Open the project
              </Link>
            </div>
          </div>
        ) : state && "error" in state && !loading ? (
          <div className="m-auto grid max-w-md justify-items-center gap-3 py-10 text-center">
            <p role="alert" className="flex items-start gap-2 text-sm text-ink-2">
              <WarningCircleIcon size={16} weight="fill" className="mt-0.5 shrink-0 text-failed" aria-hidden /> {state.error}
            </p>
            <button type="button" onClick={() => setAgain((n) => n + 1)} className={buttonClasses("secondary", "sm")}>
              <ArrowClockwiseIcon size={16} weight="bold" aria-hidden /> Try again
            </button>
          </div>
        ) : (
          <div role="status" aria-label="Reading the preview" className="grid flex-1 gap-3">
            <div className="h-10 w-56 max-w-full rounded-full bg-surface-raised motion-safe:animate-pulse" />
            <div className="min-h-[18rem] flex-1 rounded-md bg-surface-raised motion-safe:animate-pulse" />
          </div>
        )}
      </div>
    </div>
  );
}
