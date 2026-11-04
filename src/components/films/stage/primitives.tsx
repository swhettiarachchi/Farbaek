"use client";

/**
 * The film stage's set pieces (ADR 0034): Farbaek's window with its address
 * bar, frames for a phone and a live site, and a sandboxed preview whose
 * scroll is film time. The studio (studio.tsx) places them; nothing here
 * animates on its own.
 */
import { ArrowClockwiseIcon, CaretLeftIcon, CaretRightIcon, LockSimpleIcon } from "@phosphor-icons/react";
import { useLayoutEffect, useRef, type ReactNode } from "react";
import { buildStaticSrcdoc } from "@/core/workspace/static-preview";
import { linear, progress } from "../timeline";
import { noteFrameLoaded, noteFrameMounted } from "./frames";

/** Farbaek's window as a browser shows it: the address bar, then the app. */
export function AppWindow({ width, height, address = "www.farbaek.com/app", children }: { width: number; height: number; address?: string; children: ReactNode }) {
  return (
    <div className="relative overflow-hidden rounded-[22px] bg-canvas ring-1 ring-line" style={{ width, height }}>
      <div className="flex h-11 items-center gap-3 border-b border-line bg-surface px-4">
        <span className="flex items-center gap-1 text-ink-3">
          <CaretLeftIcon size={15} weight="bold" aria-hidden />
          <CaretRightIcon size={15} weight="bold" aria-hidden />
          <ArrowClockwiseIcon size={14} weight="bold" className="ml-1" aria-hidden />
        </span>
        <span className="mx-auto flex h-7 w-[46%] items-center justify-center gap-1.5 rounded-full bg-surface-raised px-3 text-[12.5px] text-ink-2">
          <LockSimpleIcon size={12} weight="bold" aria-hidden /> {address}
        </span>
        <span className="w-[54px]" />
      </div>
      <div className="relative" style={{ height: height - 44 }}>
        {children}
      </div>
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-[linear-gradient(180deg,var(--color-surface),transparent)] opacity-30" />
    </div>
  );
}

/** A phone, for the portrait films. The screen is the app at a phone's width. */
export function PhoneFrame({ width, height, children }: { width: number; height: number; children: ReactNode }) {
  return (
    <div
      className="relative rounded-[44px] bg-ink p-[9px] ring-1 ring-line-strong/40"
      style={{ width, height, boxShadow: "0 44px 80px -30px color-mix(in oklab, var(--color-ink) 40%, transparent), 0 22px 50px -24px color-mix(in oklab, var(--color-accent) 34%, transparent)" }}
    >
      <div className="relative h-full overflow-hidden rounded-[36px] bg-canvas">
        <div aria-hidden className="absolute left-1/2 top-2 z-20 h-[22px] w-[86px] -translate-x-1/2 rounded-full bg-ink" />
        {children}
      </div>
    </div>
  );
}

/** Lets the film scroll a sandboxed preview: the page listens for one message, and jumps without smoothing. */
const SCROLL_LISTENER = "<script>addEventListener(\"message\",function(e){var y=e.data&&e.data.__filmScroll;if(typeof y===\"number\")window.scrollTo({top:y,behavior:\"instant\"});});</script>";

/**
 * A static site rendered by Farbaek's own preview builder, in a locked-down
 * frame exactly as tall as what shows, so a site sized to the screen looks
 * right. Scrolling is film time too: the frame is told where to be.
 */
export function SiteFrame({ files, scrollY = 0, height, className = "", phone }: { files: Record<string, string>; scrollY?: number; height: number; className?: string; phone?: { width: number } }) {
  // On a phone, the site is laid out at a real phone's width (375px) and drawn smaller, so its mobile layout shows.
  const scale = phone ? phone.width / 375 : 1;
  const doc = (buildStaticSrcdoc(files, "index.html") ?? "") + SCROLL_LISTENER;
  const frame = useRef<HTMLIFrameElement | null>(null);
  const latest = useRef(scrollY);
  useLayoutEffect(() => {
    latest.current = scrollY;
    frame.current?.contentWindow?.postMessage({ __filmScroll: scrollY }, "*");
  }, [scrollY]);
  return (
    <div className={`relative overflow-hidden bg-surface ${className}`} style={{ height }}>
      <iframe
        title="Sample site preview"
        srcDoc={doc}
        sandbox="allow-scripts"
        ref={(el) => {
          frame.current = el;
          if (el) noteFrameMounted(el);
        }}
        onLoad={(e) => {
          e.currentTarget.contentWindow?.postMessage({ __filmScroll: latest.current }, "*");
          noteFrameLoaded(e.currentTarget);
        }}
        className={phone ? "absolute left-0 top-0 border-0" : "absolute inset-0 h-full w-full border-0"}
        style={phone ? { width: 375, height: height / scale, transform: `scale(${scale})`, transformOrigin: "0 0" } : undefined}
      />
    </div>
  );
}

/** A browser window around a live site, for the final reveal. */
export function SiteWindow({ width, height, address, children }: { width: number; height: number; address: string; children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-[18px] bg-surface ring-1 ring-line" style={{ width, height, boxShadow: "0 50px 100px -34px color-mix(in oklab, var(--color-ink) 38%, transparent), 0 26px 56px -26px color-mix(in oklab, var(--color-accent) 30%, transparent)" }}>
      <div className="flex h-10 items-center gap-2 border-b border-line bg-surface px-3">
        <span className="mx-auto flex h-6 items-center gap-1.5 rounded-full bg-surface-raised px-3 text-[12px] text-ink-2">
          <LockSimpleIcon size={11} weight="bold" aria-hidden /> {address}
        </span>
      </div>
      <div style={{ height: height - 40 }}>{children}</div>
    </div>
  );
}

/** How much of a scene shows at a moment: in over `fade`, out over `fade`. */
export function presence(t: number, from: number, to: number, fade = 450): number {
  if (t < from - fade || t > to + fade) return 0;
  return Math.min(progress(t, from - fade, from, linear), 1 - progress(t, to, to + fade, linear));
}
