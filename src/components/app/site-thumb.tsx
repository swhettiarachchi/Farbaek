"use client";

/**
 * A live picture of a site (a project's or a template's). It loads when it
 * comes near the screen, from a thumbnail route that returns the folded
 * document as JSON, and is drawn at desktop width in a frame that runs no
 * scripts and fetches nothing (the document carries the preview CSP). Apps
 * that need a server get a drawn cover instead, and empty projects say so.
 */
import { BracketsCurlyIcon, FileDashedIcon } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";

type Thumb = { kind: "static"; srcdoc: string } | { kind: "app" } | { kind: "empty" } | { kind: "loading" } | { kind: "error" };

export function SiteThumb({ src, name, className = "" }: { src: string; name: string; className?: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [thumb, setThumb] = useState<Thumb>({ kind: "loading" });

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    let cancelled = false;
    const load = () =>
      fetch(src, { headers: { accept: "application/json" } })
        .then((r) => (r.ok ? (r.json() as Promise<Thumb>) : Promise.reject(new Error(String(r.status)))))
        .then((t) => !cancelled && setThumb(t))
        .catch(() => !cancelled && setThumb({ kind: "error" }));
    if (!("IntersectionObserver" in window)) {
      void load();
      return () => {
        cancelled = true;
      };
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          io.disconnect();
          void load();
        }
      },
      { rootMargin: "200px 0px" },
    );
    io.observe(el);
    return () => {
      cancelled = true;
      io.disconnect();
    };
  }, [src]);

  return (
    <div ref={box} className={`relative aspect-[16/10] overflow-hidden rounded-sm bg-surface-raised ${className}`} aria-hidden>
      {thumb.kind === "static" ? (
        <iframe
          title={`${name} preview`}
          srcDoc={thumb.srcdoc}
          sandbox=""
          tabIndex={-1}
          scrolling="no"
          referrerPolicy="no-referrer"
          className="pointer-events-none absolute left-0 top-0 h-[400%] w-[400%] origin-top-left scale-25 bg-white motion-safe:animate-[usage-in_400ms_cubic-bezier(0.16,1,0.3,1)_both]"
        />
      ) : thumb.kind === "loading" ? (
        <div className="absolute inset-0 grid content-start gap-2 p-4">
          <span className="h-3 w-1/3 rounded-full bg-line motion-safe:animate-pulse" />
          <span className="mt-3 h-6 w-3/4 rounded-full bg-line motion-safe:animate-pulse" />
          <span className="h-6 w-1/2 rounded-full bg-line motion-safe:animate-pulse" />
          <span className="mt-2 h-3 w-2/3 rounded-full bg-line/70 motion-safe:animate-pulse" />
        </div>
      ) : thumb.kind === "app" ? (
        <div className="absolute inset-0 grid place-items-center bg-[radial-gradient(ellipse_at_30%_20%,rgb(36_80_240/0.10),transparent_60%),radial-gradient(ellipse_at_80%_90%,rgb(10_110_133/0.10),transparent_55%)]">
          <div aria-hidden className="dot-grid absolute inset-0" />
          <span className="relative grid justify-items-center gap-1.5 text-center">
            <span className="flex size-11 items-center justify-center rounded-full bg-surface text-accent shadow-e2">
              <BracketsCurlyIcon size={22} />
            </span>
            <span className="text-xs text-ink-2">An app with a server</span>
            <span className="text-[11px] text-ink-3">It previews in a sandbox</span>
          </span>
        </div>
      ) : (
        <div className="absolute inset-0 grid place-items-center">
          <span className="grid justify-items-center gap-1.5 text-center">
            <FileDashedIcon size={24} className="text-ink-3" />
            <span className="text-xs text-ink-3">{thumb.kind === "error" ? "The preview couldn't load" : "No page to show yet"}</span>
          </span>
        </div>
      )}
    </div>
  );
}
