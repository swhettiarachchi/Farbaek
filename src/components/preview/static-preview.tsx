"use client";

import { ArrowClockwiseIcon, ArrowLeftIcon, ArrowsOutIcon, CaretUpDownIcon, DesktopIcon, DeviceMobileIcon, DeviceTabletIcon, XIcon } from "@phosphor-icons/react";
import type { Icon } from "@phosphor-icons/react";
import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { PREVIEW_NAV_MESSAGE, buildStaticSrcdoc, resolveSitePath, sitePages } from "@/core/workspace/static-preview";
import { defaultDevice, frameGeometry, type PreviewDevice } from "@/core/workspace/preview-geometry";
import { PreviewFrame } from "./preview-frame";

type Device = PreviewDevice;

const DEVICES: { id: Device; label: string; icon: Icon; wideOnly?: boolean }[] = [
  { id: "phone", label: "Phone", icon: DeviceMobileIcon },
  { id: "tablet", label: "Tablet", icon: DeviceTabletIcon, wideOnly: true },
  { id: "desktop", label: "Desktop", icon: DesktopIcon },
];

export interface PreviewVersion {
  id: string;
  label: string;
  files: Record<string, string>;
  /** The project's images as data URLs, by path (ADR 0108). */
  images?: Record<string, string>;
}

/** The width (and height) of an element, kept current as it resizes. */
function useSize(ref: RefObject<HTMLElement | null>): { width: number; height: number } {
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      const box = entry!.contentRect;
      setSize((s) => (s.width === Math.round(box.width) && s.height === Math.round(box.height) ? s : { width: Math.round(box.width), height: Math.round(box.height) }));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return size;
}

/**
 * A static site, live, in a locked-down frame (ADR 0027): no same-origin
 * access and no network. It renders in the preview frame document (ADR 0169),
 * so the app's own policy doesn't reach the site's scripts.
 *
 * On a phone it fills the card from edge to edge at the phone's real width;
 * Desktop shows the real desktop layout, scaled to fit. A browser bar moves
 * between the site's pages, goes back, reloads, and opens the site full
 * screen with its controls where a thumb rests (ADR 0195).
 */
export function StaticPreview({
  versions,
  initial,
  frameClassName = "h-[min(72dvh,680px)]",
}: {
  versions: PreviewVersion[];
  initial?: string;
  /** The stage's height classes; the run page fits it to the screen so it can stay in view. */
  frameClassName?: string;
}) {
  const [versionId, setVersionId] = useState(initial ?? versions.at(-1)?.id ?? "");
  // A version that's gone (the page reloaded with new ones) falls back to the newest.
  const version = versions.find((v) => v.id === versionId) ?? versions.at(-1)!;
  const pages = useMemo(() => sitePages(version.files), [version.files]);
  // The pages visited, newest last: Back walks it.
  const [trail, setTrail] = useState<string[]>(["index.html"]);
  const chosen = trail.at(-1)!;
  const page = pages.includes(chosen) ? chosen : (pages[0] ?? "index.html");
  const [picked, setDevice] = useState<Device | null>(null);
  const [reloads, setReloads] = useState(0);
  const [full, setFull] = useState(false);

  const box = useRef<HTMLDivElement>(null);
  const space = useSize(box).width;
  // Until the person picks one, the preview matches where it's seen: a phone shows the phone layout.
  const device: Device = picked ?? defaultDevice(space);

  // Reloading sends the same document again; the counter makes it a new one, so the site starts over.
  const doc = useMemo(() => {
    const html = buildStaticSrcdoc(version.files, page, version.images);
    return html === null ? null : reloads > 0 ? `${html}\n<!-- reload ${reloads} -->` : html;
  }, [version.files, version.images, page, reloads]);

  function go(next: string) {
    if (next !== page) setTrail((t) => [...t.slice(-30), next]);
  }
  function back() {
    setTrail((t) => (t.length > 1 ? t.slice(0, -1) : t));
  }

  const bar = (
    <BrowserBar
      page={page}
      pages={pages}
      canGoBack={trail.length > 1}
      onBack={back}
      onPick={go}
      onReload={() => setReloads((n) => n + 1)}
      onFull={() => setFull(true)}
    />
  );

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {versions.length > 1 ? (
          <div className="inline-flex rounded-full border border-line bg-surface p-1 shadow-e1 max-[18em]:flex-wrap max-[18em]:rounded-md" role="group" aria-label="Version">
            {versions.map((v) => (
              <button
                key={v.id}
                type="button"
                aria-pressed={v.id === version.id}
                onClick={() => setVersionId(v.id)}
                className={`min-h-11 rounded-full px-4 text-sm transition-colors duration-150 lg:pointer-fine:min-h-9 ${v.id === version.id ? "bg-primary font-medium text-on-primary" : "text-ink-2 hover:text-ink"}`}
              >
                {v.label}
              </button>
            ))}
          </div>
        ) : (
          <span className="text-label font-medium text-ink-3">{version.label}</span>
        )}
        <DeviceSwitch device={device} onPick={setDevice} />
      </div>

      {bar}

      {/* On a phone the stage reaches the card's edges (the cards around it are p-4 there). */}
      <div ref={box} className="-mx-4 overflow-hidden border-y border-line bg-surface-sunken sm:mx-0 sm:rounded-md sm:border">
        {doc === null ? (
          <p className="grid h-72 place-items-center px-6 text-center text-sm text-ink-3">This version has no {page}, so there&apos;s nothing to show yet.</p>
        ) : full ? (
          <p className={`grid place-items-center px-6 text-center text-sm text-ink-3 ${frameClassName}`}>Showing full screen.</p>
        ) : (
          <Stage doc={doc} page={page} label={version.label} device={device} space={space} heightClass={frameClassName} files={version.files} onNavigate={go} />
        )}
      </div>

      {full && doc !== null ? (
        <FullScreen
          doc={doc}
          page={page}
          label={version.label}
          device={device}
          files={version.files}
          onNavigate={go}
          onClose={() => setFull(false)}
          controls={
            <>
              <BrowserBar page={page} pages={pages} canGoBack={trail.length > 1} onBack={back} onPick={go} onReload={() => setReloads((n) => n + 1)} />
              <DeviceSwitch device={device} onPick={setDevice} compact />
            </>
          }
        />
      ) : null}

      <p className="text-xs text-ink-3">
        Runs in a locked-down frame with no access to Farbaek, and its scripts can&apos;t reach the network. The project&apos;s own images show, and so do images and fonts
        from https addresses.
      </p>
    </div>
  );
}

function DeviceSwitch({ device, onPick, compact = false }: { device: Device; onPick: (d: Device) => void; compact?: boolean }) {
  return (
    <div className="inline-flex shrink-0 rounded-full border border-line bg-surface p-1" role="group" aria-label="Show as">
      {DEVICES.map((d) => (
        <span key={d.id} className={d.wideOnly ? "max-sm:hidden" : "contents"}>
          <button
            type="button"
            aria-pressed={device === d.id}
            aria-label={d.label}
            title={d.label}
            onClick={() => onPick(d.id)}
            className={`inline-flex h-11 min-w-11 items-center justify-center gap-1.5 rounded-full px-3 text-sm transition-colors duration-150 ${device === d.id ? "bg-surface-raised font-medium text-ink" : "text-ink-3 hover:text-ink"}`}
          >
            <d.icon size={20} weight={device === d.id ? "fill" : "regular"} aria-hidden />
            {compact ? null : <span className="max-sm:sr-only">{d.label}</span>}
          </button>
        </span>
      ))}
    </div>
  );
}

function BrowserBar({
  page,
  pages,
  canGoBack,
  onBack,
  onPick,
  onReload,
  onFull,
}: {
  page: string;
  pages: string[];
  canGoBack: boolean;
  onBack: () => void;
  onPick: (page: string) => void;
  onReload: () => void;
  onFull?: () => void;
}) {
  const round = "inline-flex size-11 shrink-0 items-center justify-center rounded-full text-ink-2 transition-colors duration-150 hover:bg-surface-raised hover:text-ink disabled:text-ink-3/50 disabled:hover:bg-transparent";
  return (
    <div className="flex min-w-0 flex-1 items-center gap-1 rounded-full border border-line bg-surface p-1 shadow-e1">
      <button type="button" onClick={onBack} disabled={!canGoBack} aria-label="Back to the page before" title="Back" className={round}>
        <ArrowLeftIcon size={20} aria-hidden />
      </button>
      <label className="relative flex min-w-0 flex-1 items-center">
        <span className="sr-only">Page</span>
        {/* The page's name, as an address bar shows it; with more than one page, choosing another goes there. */}
        <select
          value={page}
          onChange={(e) => onPick(e.target.value)}
          disabled={pages.length < 2}
          className="h-11 w-full min-w-0 cursor-pointer appearance-none truncate rounded-full bg-surface-raised pl-4 pr-9 font-mono text-sm text-ink outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-default"
        >
          {(pages.length > 0 ? pages : [page]).map((p) => (
            <option key={p} value={p}>
              /{p === "index.html" ? "" : p}
            </option>
          ))}
        </select>
        {pages.length > 1 ? <CaretUpDownIcon size={16} weight="bold" className="pointer-events-none absolute right-3 text-ink-3" aria-hidden /> : null}
      </label>
      <button type="button" onClick={onReload} aria-label="Reload the page" title="Reload" className={round}>
        <ArrowClockwiseIcon size={20} aria-hidden />
      </button>
      {onFull ? (
        <button type="button" onClick={onFull} aria-label="Show full screen" title="Full screen" className={round}>
          <ArrowsOutIcon size={20} aria-hidden />
        </button>
      ) : null}
    </div>
  );
}

/** The site in its frame, at the device's real width, scaled to the space, with a skeleton until it has drawn. */
function Stage({
  doc,
  page,
  label,
  device,
  space,
  heightClass,
  files,
  onNavigate,
  fill = false,
}: {
  doc: string;
  page: string;
  label: string;
  device: Device;
  space: number;
  heightClass?: string;
  files: Record<string, string>;
  onNavigate: (page: string) => void;
  /** Full screen: the stage takes the height it's given. */
  fill?: boolean;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const area = useRef<HTMLDivElement>(null);
  const height = useSize(area).height;
  const { width, scale } = frameGeometry(device, space);

  // The skeleton shows until this document has drawn; the frame says so after each load.
  const current = useRef(doc);
  useEffect(() => {
    current.current = doc;
  });
  const [drawn, setDrawn] = useState<string | null>(null);
  // A frame that never says it drew must not leave the skeleton over a site that did.
  useEffect(() => {
    const timer = setTimeout(() => setDrawn(doc), 4000);
    return () => clearTimeout(timer);
  }, [doc]);

  // Same-site links inside the preview arrive here; only messages from this frame count.
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.source !== frame.current?.contentWindow) return;
      const data = e.data as { type?: unknown; href?: unknown } | null;
      if (data?.type !== PREVIEW_NAV_MESSAGE || typeof data.href !== "string") return;
      const target = resolveSitePath(page, data.href);
      if (target && files[target] !== undefined) onNavigate(target);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [page, files, onNavigate]);

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

  const shown = width * scale;
  const left = Math.max(0, (space - shown) / 2);
  // A phone preview on a phone is the screen itself, edge to edge; anything narrower than its space sits on the stage like a device.
  const framed = shown < space;

  return (
    <div ref={area} className={`relative ${fill ? "h-full" : (heightClass ?? "")}`}>
      {width > 0 && height > 0 ? (
        <div
          className={`absolute top-0 origin-top-left overflow-hidden bg-white ${framed ? "shadow-e2" : ""} ${frameFocused ? "ring-2 ring-accent ring-inset" : ""}`}
          style={{ left, width, height: height / scale, transform: scale === 1 ? undefined : `scale(${scale})` }}
        >
          {/* bg-white on purpose: it's the browser's own canvas a site draws on when it sets no background, not Farbaek's surface. */}
          <PreviewFrame frameRef={frame} html={doc} title={`Preview of ${page} (${label})`} className="block size-full bg-white" onLoad={() => setDrawn(current.current)} />
        </div>
      ) : null}
      {drawn !== doc ? (
        <div aria-hidden className="pointer-events-none absolute inset-0 grid content-start gap-3 bg-surface p-5 motion-safe:animate-pulse">
          <div className="h-10 w-2/3 rounded-sm bg-surface-sunken" />
          <div className="h-40 rounded-sm bg-surface-sunken" />
          <div className="h-4 w-5/6 rounded-full bg-surface-sunken" />
          <div className="h-4 w-3/5 rounded-full bg-surface-sunken" />
        </div>
      ) : null}
      {scale < 1 ? (
        <p className="pointer-events-none absolute bottom-2 right-2 rounded-full border border-line bg-surface/90 px-2.5 py-1 text-xs text-ink-2 backdrop-blur">
          {device === "desktop" ? "Desktop" : "Tablet"} at <span className="tabular">{Math.round(scale * 100)}%</span>
        </p>
      ) : null}
    </div>
  );
}

/**
 * The site on the whole screen, as visitors see it, with the controls in a
 * bar at the bottom where a thumb rests. A native dialog, so Escape closes it
 * and focus stays inside while it's open.
 */
function FullScreen({
  doc,
  page,
  label,
  device,
  files,
  onNavigate,
  onClose,
  controls,
}: {
  doc: string;
  page: string;
  label: string;
  device: Device;
  files: Record<string, string>;
  onNavigate: (page: string) => void;
  onClose: () => void;
  controls: React.ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const area = useRef<HTMLDivElement>(null);
  const space = useSize(area).width;

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    d.showModal();
    // The page behind stays where it was.
    const root = document.documentElement;
    const before = root.style.overflow;
    root.style.overflow = "hidden";
    return () => {
      root.style.overflow = before;
      if (d.open) d.close();
    };
  }, []);

  return (
    <dialog
      ref={dialog}
      aria-label={`${page}, full screen`}
      onClose={onClose}
      className="fixed inset-0 m-0 h-[100dvh] max-h-none w-full max-w-none bg-canvas p-0 backdrop:bg-ink/40 motion-safe:animate-[sheet-in_200ms_cubic-bezier(0.16,1,0.3,1)]"
    >
      <div className="flex h-full flex-col">
        <div ref={area} className="min-h-0 flex-1 overflow-hidden pt-[env(safe-area-inset-top)]">
          <Stage doc={doc} page={page} label={label} device={device} space={space} files={files} onNavigate={onNavigate} fill />
        </div>
        <div className="border-t border-line bg-surface/85 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur motion-safe:animate-[sheet-up_240ms_cubic-bezier(0.16,1,0.3,1)]">
          <div className="mx-auto flex max-w-3xl items-center gap-2">
            <button
              type="button"
              onClick={() => dialog.current?.close()}
              aria-label="Close full screen"
              title="Close"
              className="inline-flex size-11 shrink-0 items-center justify-center rounded-full border border-line bg-surface text-ink shadow-e1 transition-colors duration-150 hover:bg-surface-raised"
            >
              <XIcon size={20} weight="bold" aria-hidden />
            </button>
            {controls}
          </div>
        </div>
      </div>
    </dialog>
  );
}
