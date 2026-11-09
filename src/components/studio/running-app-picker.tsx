"use client";

import { CursorClickIcon, PlayIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import { openPickPreviewAction } from "@/app/app/projects/preview-actions";
import { buttonClasses } from "@/components/ui/button";
import { inputClasses, LABEL_CLASSES } from "@/components/ui/field";
import { readPicked, type Picked } from "@/core/studio/pick-match";

/** How long a page has to start Farbaek's picker before the editor says it didn't. */
const READY_MS = 15_000;

/**
 * The project's running app, from one of its sandbox sessions, framed in the
 * component editor (ADR 0149). With picking on, a click in the app is
 * reported by Farbaek's picker script; only messages from this preview's
 * own origin and frame are read, and only in the expected shape.
 */
export function RunningAppPicker({
  projectId,
  sessions,
  unavailable,
  onPicked,
}: {
  projectId: string;
  sessions: readonly { id: string; name: string }[];
  unavailable: string | null;
  onPicked(picked: Picked): void;
}) {
  const id = useId();
  const frame = useRef<HTMLIFrameElement>(null);
  const [sessionId, setSessionId] = useState(sessions[0]?.id ?? "");
  const [port, setPort] = useState("3000");
  const [preview, setPreview] = useState<{ url: string; origin: string; key: number } | null>(null);
  const [ready, setReady] = useState(false);
  const [late, setLate] = useState(false);
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const pickingRef = useRef(false);
  // The latest handler, without re-listening (and restarting the wait) on every render.
  const onPickedRef = useRef(onPicked);
  useEffect(() => {
    onPickedRef.current = onPicked;
  });

  useEffect(() => {
    if (!preview) return;
    const listener = (e: MessageEvent) => {
      if (e.origin !== preview.origin || e.source !== frame.current?.contentWindow) return;
      const data = e.data as { type?: unknown } | null;
      if (data?.type === "farbaek:ready") {
        setReady(true);
        setLate(false);
        // A new page in the frame starts with picking off; tell it what the editor says.
        frame.current?.contentWindow?.postMessage({ type: "farbaek:pick", on: pickingRef.current }, preview.origin);
        return;
      }
      const picked = readPicked(data);
      if (picked) onPickedRef.current(picked);
    };
    window.addEventListener("message", listener);
    const timer = window.setTimeout(() => setLate(true), READY_MS);
    return () => {
      window.removeEventListener("message", listener);
      window.clearTimeout(timer);
    };
  }, [preview]);

  function open() {
    setError(null);
    start(async () => {
      const r = await openPickPreviewAction({ projectId, sessionId, port: Number(port) });
      if (r.status === "error") return setError(r.message);
      setReady(false);
      setLate(false);
      setPicking(false);
      pickingRef.current = false;
      setPreview((p) => ({ url: r.url, origin: new URL(r.url).origin, key: (p?.key ?? 0) + 1 }));
    });
  }

  function toggle() {
    if (!preview) return;
    const next = !picking;
    setPicking(next);
    pickingRef.current = next;
    frame.current?.contentWindow?.postMessage({ type: "farbaek:pick", on: next }, preview.origin);
  }

  if (unavailable) return <p className="text-sm text-ink-3">{unavailable}</p>;
  if (sessions.length === 0) {
    return (
      <p className="text-sm leading-relaxed text-ink-2">
        No test space is running this project. Start one from the Test space page with the project&apos;s files, run the app (for example <span className="font-mono text-label">npm run dev</span>), then come back to pick elements in it.
      </p>
    );
  }
  return (
    <div className="grid gap-3">
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_8rem_auto] sm:items-end">
        <label className={`grid gap-1.5 ${LABEL_CLASSES}`} htmlFor={`${id}-session`}>
          Session
          <select id={`${id}-session`} value={sessionId} onChange={(e) => setSessionId(e.target.value)} className={inputClasses()}>
            {sessions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className={`grid gap-1.5 ${LABEL_CLASSES}`} htmlFor={`${id}-port`}>
          Port
          <input id={`${id}-port`} inputMode="numeric" value={port} onChange={(e) => setPort(e.target.value.replace(/\D/g, "").slice(0, 5))} className={inputClasses("font-mono")} />
        </label>
        <button type="button" onClick={open} disabled={pending || !sessionId} className={buttonClasses("secondary", "sm")}>
          <PlayIcon size={16} weight="bold" aria-hidden /> {pending ? "Opening…" : preview ? "Open it again" : "Open the running app"}
        </button>
      </div>
      {error ? (
        <p role="alert" className="flex items-start gap-2 text-sm text-failed">
          <WarningCircleIcon size={16} weight="fill" className="mt-0.5 shrink-0 text-failed" aria-hidden /> {error}
        </p>
      ) : null}
      {preview ? (
        <div className="grid gap-2">
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" aria-pressed={picking} onClick={toggle} disabled={!ready} className={buttonClasses(picking ? "primary" : "secondary", "sm")}>
              <CursorClickIcon size={16} weight="bold" aria-hidden /> {picking ? "Picking: click an element" : "Pick an element"}
            </button>
            <span className="text-xs text-ink-3" role="status">
              {ready ? (picking ? "Clicks in the app pick instead of acting." : "Ready to pick.") : late ? "Farbaek's picker didn't start in this page." : "Waiting for the app…"}
            </span>
          </div>
          {late && !ready ? (
            <p className="text-xs leading-relaxed text-ink-3">
              The page may not be HTML, a meta tag in it may block scripts, or your browser may block cookies in frames. The rest of the editor still works.
            </p>
          ) : null}
          <iframe
            key={preview.key}
            ref={frame}
            src={preview.url}
            title="The running app"
            referrerPolicy="no-referrer"
            sandbox="allow-scripts allow-forms allow-same-origin allow-popups allow-modals"
            className="h-[28rem] w-full rounded-md border border-line bg-surface"
          />
          <p className="text-xs text-ink-3">An element is matched to the code by its words and classes. Text or classes the app builds as it runs can&apos;t be matched.</p>
        </div>
      ) : null}
    </div>
  );
}
