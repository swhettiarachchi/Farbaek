"use client";

import { ArrowClockwiseIcon, ArrowUpRightIcon, BrowserIcon, DeviceMobileIcon, DeviceTabletIcon, MonitorIcon, PlayIcon, ScrollIcon, StopIcon, WarningCircleIcon, XIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { buttonClasses } from "@/components/ui/button";
import { inputClasses, LABEL_CLASSES } from "@/components/ui/field";
import { APP_LOG_COMMAND, STOP_APP_COMMAND, startAppCommand } from "@/core/sandbox/app-process";
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
  const [command, setCommand] = useState("npm run dev -- --hostname 0.0.0.0 --port 3000");
  const [app, setApp] = useState<{ busy: "start" | "stop" | "log" | null; output: string | null; failed: boolean }>({ busy: null, output: null, failed: false });

  /** Start app, Stop app and its log are ordinary sandbox commands, so the guard and receipts apply. */
  async function appAction(kind: "start" | "stop" | "log") {
    setApp({ busy: kind, output: null, failed: false });
    try {
      const text = kind === "start" ? startAppCommand(command) : kind === "stop" ? STOP_APP_COMMAND : APP_LOG_COMMAND;
      const r = await client.run(sessionId, text, { timeoutSeconds: 60 });
      const output = [r.stdout, r.stderr].filter(Boolean).join("\n").trim();
      setApp({ busy: null, output: output || (kind === "stop" ? "Stopped." : "Done."), failed: r.exitCode !== 0 });
    } catch (e) {
      setApp({ busy: null, output: e instanceof FarbaekApiError ? e.message : e instanceof Error ? e.message : "That didn't work.", failed: true });
    }
  }

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
      <div className="flex flex-col items-center rounded-md border border-line bg-surface px-5 py-8 text-center">
        <span className="flex size-12 items-center justify-center rounded-full bg-surface text-ink-2 shadow-e1 ring-1 ring-line">
          <BrowserIcon size={24} aria-hidden />
        </span>
        <p className="mx-auto mt-3 max-w-[52ch] text-sm text-ink-2">{reason ?? "Previews aren't available for this session."}</p>
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      <section aria-labelledby={`app-${sessionId}`} className="grid gap-2 rounded-md border border-line bg-surface p-4">
        <h3 id={`app-${sessionId}`} className="text-sm font-medium">
          Your app
        </h3>
        <label className={`grid gap-1 ${LABEL_CLASSES}`}>
          Start command
          <input value={command} onChange={(e) => setCommand(e.target.value)} spellCheck={false} className={inputClasses("font-mono")} />
        </label>
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={app.busy !== null || !command.trim()} onClick={() => void appAction("start")} className={buttonClasses("primary", "sm")}>
            <PlayIcon size={16} weight="bold" aria-hidden /> {app.busy === "start" ? "Starting…" : "Start app"}
          </button>
          <button type="button" disabled={app.busy !== null} onClick={() => void appAction("stop")} className={buttonClasses("secondary", "sm")}>
            <StopIcon size={16} weight="bold" aria-hidden /> {app.busy === "stop" ? "Stopping…" : "Stop app"}
          </button>
          <button type="button" disabled={app.busy !== null} onClick={() => void appAction("log")} className={buttonClasses("ghost", "sm")}>
            <ScrollIcon size={16} weight="bold" aria-hidden /> {app.busy === "log" ? "Reading…" : "Show log"}
          </button>
        </div>
        {app.output ? (
          <pre role={app.failed ? "alert" : "status"} className={`max-h-60 overflow-auto rounded-sm bg-media p-3 font-mono text-xs leading-relaxed ${app.failed ? "text-media-red" : "text-media-ink"}`}>
            {app.output}
          </pre>
        ) : null}
      </section>

      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void open("frame");
        }}
      >
        <label className={`grid gap-1 ${LABEL_CLASSES}`}>
          Port
          <input
            value={port}
            onChange={(e) => setPort(e.target.value.replace(/\D/g, "").slice(0, 5))}
            inputMode="numeric"
            className={inputClasses("max-w-28 tabular")}
            aria-describedby={`port-help-${sessionId}`}
          />
        </label>
        <button type="submit" disabled={loading !== null || !port} className={buttonClasses("accent", "sm")}>
          {loading === "frame" ? "Opening…" : preview ? "Open again" : "Open preview"}
        </button>
        <button type="button" onClick={() => void open("tab")} disabled={loading !== null || !port} className={buttonClasses("secondary", "sm")}>
          <ArrowUpRightIcon size={16} weight="bold" aria-hidden /> New tab
        </button>
      </form>
      <p id={`port-help-${sessionId}`} className="-mt-2 text-xs text-ink-3">
        Start your app above (it must listen on 0.0.0.0), then open its port. Links are private to you and expire with the session.
      </p>
      {error ? (
        <p role="alert" className="flex items-start gap-2 text-sm text-failed">
          <WarningCircleIcon size={16} weight="fill" className="mt-0.5 shrink-0 text-failed" aria-hidden />
          <span>{error}</span>
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
                      className={`inline-flex size-11 items-center justify-center rounded-full ${width === k ? "bg-ink text-surface" : "text-ink-2 hover:bg-surface-raised"}`}
                      aria-label={W.label}
                    >
                      <W.icon size={16} weight="bold" aria-hidden />
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
                className="inline-flex size-11 items-center justify-center rounded-full text-ink-2 hover:bg-surface-raised"
                aria-label="Reload preview"
              >
                <ArrowClockwiseIcon size={16} weight="bold" aria-hidden />
              </button>
              <button type="button" onClick={() => void close()} className="inline-flex size-11 items-center justify-center rounded-full text-ink-2 hover:bg-surface-raised" aria-label="Close preview">
                <XIcon size={16} weight="bold" aria-hidden />
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
