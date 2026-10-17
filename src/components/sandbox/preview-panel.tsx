"use client";

import { ArrowClockwiseIcon, ArrowSquareOutIcon, DeviceMobileIcon, DeviceTabletIcon, GlobeIcon, MonitorIcon, XIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { buttonClasses } from "@/components/ui/button";
import { FarbaekApiError, type FarbaekSandboxClient } from "@/sdk/sandbox-client";

const WIDTHS = { desktop: { label: "Desktop", icon: MonitorIcon, width: "100%" }, tablet: { label: "Tablet", icon: DeviceTabletIcon, width: "768px" }, phone: { label: "Phone", icon: DeviceMobileIcon, width: "375px" } } as const;

/**
 * Private preview of an app running inside the sandbox. The page loads from
 * its own preview host (never Farbaek's origin), through a one-use link
 * that only works in this browser, and can't navigate the Farbaek tab.
 */
export function PreviewPanel({ client, sessionId, available, reason }: { client: FarbaekSandboxClient; sessionId: string; available: boolean; reason: string | null }) {
  const [port, setPort] = useState("3000");
  const [preview, setPreview] = useState<{ id: string; origin: string; src: string; expiresAt: string } | null>(null);
  const [frameKey, setFrameKey] = useState(0);
  const [loading, setLoading] = useState<"frame" | "tab" | null>(null);
  const [frameReady, setFrameReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [width, setWidth] = useState<keyof typeof WIDTHS>("desktop");

  async function open(target: "frame" | "tab") {
    setError(null);
    const n = Number(port);
    setLoading(target);
    // Open the tab first, synchronously, so popup blockers allow it; point it at the link once issued.
    const tab = target === "tab" ? window.open("about:blank", "_blank") : null;
    try {
      const p = await client.openPreview(sessionId, n);
      const url = new URL(p.url);
      if (target === "tab") {
        if (tab) {
          tab.opener = null;
          tab.location.href = p.url;
        } else setError("Your browser blocked the new tab. Allow pop-ups for Farbaek, or use the preview here.");
      } else {
        setFrameReady(false);
        setPreview({ id: p.previewId, origin: url.origin, src: p.url, expiresAt: p.expiresAt });
        setFrameKey((k) => k + 1);
      }
    } catch (e) {
      tab?.close();
      setError(e instanceof FarbaekApiError ? e.message : "The preview couldn't be opened.");
    } finally {
      setLoading(null);
    }
  }

  async function close() {
    if (!preview) return;
    try {
      await client.closePreview(sessionId, preview.id);
    } catch {
      // Closing is best effort; the link expires on its own.
    }
    setPreview(null);
  }

  if (!available) {
    return (
      <div className="rounded-md border border-dashed border-line-strong/40 bg-surface px-5 py-8 text-center">
        <GlobeIcon size={24} className="mx-auto text-ink-3" aria-hidden />
        <p className="mx-auto mt-3 max-w-[52ch] text-sm text-ink-2">{reason ?? "Previews aren't available for this session."}</p>
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void open("frame");
        }}
      >
        <label className="grid gap-1 text-sm font-medium">
          Port
          <input
            value={port}
            onChange={(e) => setPort(e.target.value.replace(/\D/g, "").slice(0, 5))}
            inputMode="numeric"
            className="h-11 w-28 rounded-sm border border-line bg-surface px-3 text-base tabular"
            aria-describedby={`port-help-${sessionId}`}
          />
        </label>
        <button type="submit" disabled={loading !== null || !port} className={buttonClasses("accent", "sm", "h-11")}>
          {loading === "frame" ? "Opening…" : preview ? "Open again" : "Open preview"}
        </button>
        <button type="button" onClick={() => void open("tab")} disabled={loading !== null || !port} className={buttonClasses("secondary", "sm", "h-11")}>
          <ArrowSquareOutIcon size={16} aria-hidden /> New tab
        </button>
      </form>
      <p id={`port-help-${sessionId}`} className="-mt-2 text-xs text-ink-3">
        Start your app in the console first and make it listen on 0.0.0.0, for example: npm run dev -- --hostname 0.0.0.0 --port 3000. Links are private to you and expire with the session.
      </p>
      {error ? (
        <p role="alert" className="text-sm text-failed">
          {error}
        </p>
      ) : null}

      {preview ? (
        <div className="overflow-hidden rounded-lg border border-line bg-canvas-2">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-surface px-3 py-2">
            <span className="min-w-0 truncate font-mono text-xs text-ink-2" title={preview.origin}>
              {preview.origin}
            </span>
            <div className="flex items-center gap-1">
              <div role="group" aria-label="Preview width" className="mr-1 flex rounded-full border border-line p-0.5">
                {(Object.keys(WIDTHS) as (keyof typeof WIDTHS)[]).map((k) => {
                  const W = WIDTHS[k];
                  return (
                    <button
                      key={k}
                      type="button"
                      aria-pressed={width === k}
                      onClick={() => setWidth(k)}
                      className={`inline-flex size-9 items-center justify-center rounded-full ${width === k ? "bg-ink text-surface" : "text-ink-2 hover:bg-surface-raised"}`}
                      aria-label={W.label}
                    >
                      <W.icon size={16} aria-hidden />
                    </button>
                  );
                })}
              </div>
              <button
                type="button"
                onClick={() => {
                  setFrameReady(false);
                  setPreview((p) => (p ? { ...p, src: `${p.origin}/` } : p));
                  setFrameKey((k) => k + 1);
                }}
                className="inline-flex size-9 items-center justify-center rounded-full text-ink-2 hover:bg-surface-raised"
                aria-label="Reload preview"
              >
                <ArrowClockwiseIcon size={16} aria-hidden />
              </button>
              <button type="button" onClick={() => void close()} className="inline-flex size-9 items-center justify-center rounded-full text-ink-2 hover:bg-surface-raised" aria-label="Close preview">
                <XIcon size={16} aria-hidden />
              </button>
            </div>
          </div>
          <div className="relative flex justify-center overflow-x-auto p-3">
            {!frameReady ? (
              <p className="absolute inset-x-0 top-10 text-center text-sm text-ink-3" role="status">
                Loading the preview…
              </p>
            ) : null}
            <iframe
              key={frameKey}
              src={preview.src}
              title="App preview"
              onLoad={() => setFrameReady(true)}
              referrerPolicy="no-referrer"
              sandbox="allow-scripts allow-forms allow-same-origin allow-popups allow-modals"
              className="h-[32rem] max-w-full rounded-md border border-line bg-surface"
              style={{ width: WIDTHS[width].width }}
            />
          </div>
          <p className="border-t border-line bg-surface px-3 py-2 text-xs text-ink-3">
            If the frame stays blank, your browser may block cookies in frames; use New tab. Hot reload over WebSockets isn&apos;t forwarded, so reload to see changes.
          </p>
        </div>
      ) : null}
    </div>
  );
}
