"use client";

import { useCallback, useEffect, useRef, type RefObject } from "react";
import { PREVIEW_DOC_MESSAGE, PREVIEW_FRAME_PATH, PREVIEW_LOADED_MESSAGE, PREVIEW_READY_MESSAGE } from "@/core/workspace/preview-frame";

/**
 * A preview of a person's site (ADR 0169): the preview frame document from
 * Farbaek's own host, which has its own locked-down policy, given the site's
 * HTML once it's listening and again whenever the HTML changes. Messages the
 * site sends arrive from this iframe's window, and messages posted to that
 * window reach the site, so callers keep their `e.source` checks and
 * `contentWindow.postMessage` calls.
 */
export function PreviewFrame({
  html,
  frameRef,
  title,
  className,
  onLoad,
}: {
  html: string;
  frameRef: RefObject<HTMLIFrameElement | null>;
  title: string;
  className?: string;
  /** After each load of the site's document. */
  onLoad?: () => void;
}) {
  const ready = useRef(false);
  const latest = useRef(html);
  const onLoadRef = useRef(onLoad);
  useEffect(() => {
    onLoadRef.current = onLoad;
  });

  // The frame is an opaque origin, so "*" is the only target that reaches it; it accepts a document only from this page's origin.
  const send = useCallback((doc: string) => frameRef.current?.contentWindow?.postMessage({ type: PREVIEW_DOC_MESSAGE, html: doc }, "*"), [frameRef]);

  useEffect(() => {
    latest.current = html;
    if (ready.current) send(html);
  }, [html, send]);

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.source !== frameRef.current?.contentWindow) return;
      const type = (e.data as { type?: unknown } | null)?.type;
      if (type === PREVIEW_READY_MESSAGE) {
        ready.current = true;
        send(latest.current);
      } else if (type === PREVIEW_LOADED_MESSAGE) {
        onLoadRef.current?.();
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [frameRef, send]);

  return <iframe ref={frameRef} src={PREVIEW_FRAME_PATH} title={title} sandbox="allow-scripts" referrerPolicy="no-referrer" className={className} />;
}
