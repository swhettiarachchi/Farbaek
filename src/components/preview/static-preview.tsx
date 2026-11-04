"use client";

import { DesktopIcon, DeviceMobileIcon, DeviceTabletIcon } from "@phosphor-icons/react";
import type { Icon } from "@phosphor-icons/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { PREVIEW_NAV_MESSAGE, buildStaticSrcdoc, resolveSitePath, sitePages } from "@/core/workspace/static-preview";

const DEVICES: { id: "phone" | "tablet" | "desktop"; label: string; icon: Icon; width: number | null }[] = [
  { id: "phone", label: "Phone", icon: DeviceMobileIcon, width: 390 },
  { id: "tablet", label: "Tablet", icon: DeviceTabletIcon, width: 820 },
  { id: "desktop", label: "Desktop", icon: DesktopIcon, width: null },
];

export interface PreviewVersion {
  id: string;
  label: string;
  files: Record<string, string>;
  /** The project's images as data URLs, by path (ADR 0108). */
  images?: Record<string, string>;
}

/**
 * A static site, live, in a locked-down frame (ADR 0027): no same-origin
 * access and no network. Switch between versions (before and after a change),
 * pages and device widths.
 */
export function StaticPreview({
  versions,
  initial,
  frameClassName = "h-[min(70dvh,640px)]",
}: {
  versions: PreviewVersion[];
  initial?: string;
  /** The frame's height classes; the run page fits it to the screen so it can stay in view. */
  frameClassName?: string;
}) {
  const [versionId, setVersionId] = useState(initial ?? versions.at(-1)?.id ?? "");
  // A version that's gone (the page reloaded with new ones) falls back to the newest.
  const version = versions.find((v) => v.id === versionId) ?? versions.at(-1)!;
  const pages = useMemo(() => sitePages(version.files), [version.files]);
  const [chosen, setPage] = useState("index.html");
  const page = pages.includes(chosen) ? chosen : (pages[0] ?? "index.html");
  const [device, setDevice] = useState<(typeof DEVICES)[number]["id"]>("desktop");
  const frame = useRef<HTMLIFrameElement>(null);
  const doc = useMemo(() => buildStaticSrcdoc(version.files, page, version.images), [version.files, version.images, page]);

  // Same-site links inside the preview arrive here; only messages from this frame count.
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.source !== frame.current?.contentWindow) return;
      const data = e.data as { type?: unknown; href?: unknown } | null;
      if (data?.type !== PREVIEW_NAV_MESSAGE || typeof data.href !== "string") return;
      const target = resolveSitePath(page, data.href);
      if (target && version.files[target] !== undefined) setPage(target);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [page, version.files]);

  // Focus inside the frame is invisible to CSS (no :focus or :focus-within reaches the page), so the
  // ring is drawn from script: the page's window blurs and the frame becomes the active element (ADR 0053).
  const [frameFocused, setFrameFocused] = useState(false);
  useEffect(() => {
    const onBlur = () => setTimeout(() => setFrameFocused(document.activeElement === frame.current));
    const onFocus = () => setFrameFocused(false);
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);
    document.addEventListener("focusin", onFocus);
    return () => {
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("focusin", onFocus);
    };
  }, []);

  const width = DEVICES.find((d) => d.id === device)!.width;

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {versions.length > 1 ? (
          <div className="inline-flex rounded-full border border-line bg-surface p-1 shadow-e1" role="group" aria-label="Version">
            {versions.map((v) => (
              <button
                key={v.id}
                type="button"
                aria-pressed={v.id === version.id}
                onClick={() => setVersionId(v.id)}
                className={`min-h-9 rounded-full px-4 text-sm transition-colors duration-150 ${v.id === version.id ? "bg-primary font-medium text-on-primary" : "text-ink-2 hover:text-ink"}`}
              >
                {v.label}
              </button>
            ))}
          </div>
        ) : (
          <span className="text-[13px] font-medium text-ink-3">{version.label}</span>
        )}
        <div className="flex items-center gap-2">
          {pages.length > 1 ? (
            <label className="flex items-center gap-2 text-sm text-ink-2">
              <span className="sr-only">Page</span>
              <select value={page} onChange={(e) => setPage(e.target.value)} className="h-11 rounded-full border border-line bg-surface px-3 text-base text-ink sm:text-sm">
                {pages.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <div className="inline-flex rounded-full border border-line bg-surface p-1" role="group" aria-label="Device width">
            {DEVICES.map((d) => (
              <button
                key={d.id}
                type="button"
                aria-pressed={device === d.id}
                aria-label={d.label}
                title={d.label}
                onClick={() => setDevice(d.id)}
                className={`inline-flex size-11 items-center justify-center rounded-full transition-colors duration-150 ${device === d.id ? "bg-surface-raised text-ink" : "text-ink-3 hover:text-ink"}`}
              >
                <d.icon size={17} weight={device === d.id ? "fill" : "regular"} aria-hidden />
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-md border border-line bg-surface-sunken p-2 sm:p-3">
        {doc === null ? (
          <p className="grid h-72 place-items-center px-6 text-center text-sm text-ink-3">This version has no {page}, so there&apos;s nothing to show yet.</p>
        ) : (
          <div
            className={`mx-auto overflow-hidden rounded-sm bg-surface shadow-e1 motion-safe:transition-[max-width] motion-safe:duration-300 ${frameFocused ? "ring-2 ring-accent" : ""}`}
            style={{ maxWidth: width ?? "100%" }}
          >
            <iframe
              ref={frame}
              key={`${version.id}:${page}`}
              title={`Preview of ${page} (${version.label})`}
              sandbox="allow-scripts"
              referrerPolicy="no-referrer"
              srcDoc={doc}
              className={`block w-full bg-white ${frameClassName}`}
            />
          </div>
        )}
      </div>
      <p className="text-xs text-ink-3">
        Runs in a locked-down frame with no access to Farbaek, and its scripts can&apos;t reach the network. The project&apos;s own images show, and so do images and fonts
        from https addresses.
      </p>
    </div>
  );
}
