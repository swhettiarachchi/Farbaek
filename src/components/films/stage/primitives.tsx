"use client";

/**
 * The film stage's set pieces (ADR 0034): a lit dark stage, a camera that
 * dollies in to what matters, Farbaek's window with its address bar, a
 * pointer with a click ripple, and frames for a phone and a live site.
 * Everything is placed from the film time; nothing animates on its own.
 */
import { ArrowClockwiseIcon, CaretLeftIcon, CaretRightIcon, CursorIcon, LockSimpleIcon } from "@phosphor-icons/react";
import { useLayoutEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { buildStaticSrcdoc } from "@/core/workspace/static-preview";
import { FILM_LABEL } from "@/content/films";
import { keys, linear, mix, progress } from "../timeline";
import { noteFrameLoaded, noteFrameMounted } from "./frames";

export interface Camera {
  /** The point of the set that sits at the centre of the frame, in set pixels. */
  x: number;
  y: number;
  /** Zoom. */
  s: number;
  /** Tilt, in degrees. */
  rx: number;
  ry: number;
}

/** A camera from keyframes per property, so moves can overlap. */
export function cameraAt(t: number, track: { x: [number, number][]; y: [number, number][]; s: [number, number][]; rx?: [number, number][]; ry?: [number, number][] }): Camera {
  return { x: keys(t, track.x), y: keys(t, track.y), s: keys(t, track.s), rx: track.rx ? keys(t, track.rx) : 0, ry: track.ry ? keys(t, track.ry) : 0 };
}

/**
 * The stage: Farbaek's own light canvas, lit the way the homepage's aurora
 * is, by a slow pool of signal blue and a cyan glint (accent-2 only lives
 * in light like this), over the hero's dot grid. The light drifts with
 * time, so a still frame never looks frozen.
 */
export function Stage({ t, width, height, children, label = true }: { t: number; width: number; height: number; children: ReactNode; label?: boolean }) {
  const drift = (t / 1000) * 0.9;
  const poolX = 30 + Math.sin(drift * 0.35) * 8;
  const poolY = 40 + Math.cos(drift * 0.27) * 6;
  const glintX = 80 - Math.sin(drift * 0.22) * 6;
  return (
    <div className="relative overflow-hidden bg-canvas" style={{ width, height }}>
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background: [
            `radial-gradient(52% 58% at ${poolX}% ${poolY}%, color-mix(in oklab, var(--color-accent) 17%, transparent) 0%, transparent 72%)`,
            `radial-gradient(40% 46% at ${glintX}% 22%, color-mix(in oklab, var(--color-accent-2) 15%, transparent) 0%, transparent 72%)`,
            "radial-gradient(80% 50% at 50% 118%, color-mix(in oklab, var(--color-accent) 10%, transparent) 0%, transparent 70%)",
          ].join(", "),
        }}
      />
      <div aria-hidden className="dot-grid absolute inset-0 opacity-70" />
      {/* A faint floor line gives the set a horizon, so depth reads. */}
      <div aria-hidden className="absolute inset-x-0 h-px" style={{ top: "88%", background: "linear-gradient(90deg, transparent, var(--color-line-strong), transparent)", opacity: 0.35 }} />
      {children}
      {label ? <p className="absolute bottom-[2.2%] left-[2.6%] z-50 rounded-full bg-surface/85 px-2.5 py-1 text-[10px] text-ink-3 ring-1 ring-line">{FILM_LABEL}</p> : null}
    </div>
  );
}

/**
 * The camera: the set's point (x, y) sits at the frame centre, zoomed by s
 * and tilted in perspective around that centre.
 */
export function Rig({ cam, width, height, setWidth, setHeight, children, opacity = 1, blur = 0 }: { cam: Camera; width: number; height: number; setWidth: number; setHeight: number; children: ReactNode; opacity?: number; blur?: number }) {
  const style: CSSProperties = {
    position: "absolute",
    left: width / 2,
    top: height / 2,
    width: setWidth,
    height: setHeight,
    transformOrigin: "0 0",
    transform: `perspective(2200px) rotateX(${cam.rx}deg) rotateY(${cam.ry}deg) scale(${cam.s}) translate(${-cam.x}px, ${-cam.y}px)`,
    opacity,
    filter: blur > 0.05 ? `blur(${blur}px)` : undefined,
  };
  return <div style={style}>{children}</div>;
}

/** Farbaek's window as a browser shows it: the address bar, then the app. Lit along its top edge. */
export function AppWindow({ width, height, address = "www.farbaek.com/app", children }: { width: number; height: number; address?: string; children: ReactNode }) {
  return (
    <div
      className="relative overflow-hidden rounded-[22px] bg-canvas ring-1 ring-line"
      style={{
        width,
        height,
        boxShadow:
          "0 50px 100px -34px color-mix(in oklab, var(--color-ink) 34%, transparent), 0 28px 60px -26px color-mix(in oklab, var(--color-accent) 30%, transparent), 0 2px 6px color-mix(in oklab, var(--color-ink) 6%, transparent)",
      }}
    >
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

/** The pointer: where it is, and a ripple when it clicks. Clicks are moments in film time. */
export function Pointer({ t, path, clicks = [], shows }: { t: number; path: [number, number, number][]; clicks?: number[]; shows?: [number, number][] }) {
  const x = keys(t, path.map(([at, px]) => [at, px] as [number, number]));
  const y = keys(t, path.map(([at, , py]) => [at, py] as [number, number]));
  const windows = shows ?? [[path[0]?.[0] ?? 0, path.at(-1)?.[0] ?? 0]];
  const opacity = Math.max(0, ...windows.map(([from, to]) => presence(t, from, to, 350)));
  const visible = opacity > 0;
  const last = [...clicks].reverse().find((c) => t >= c && t < c + 650);
  const press = last !== undefined ? 1 - Math.abs((t - last) / 650 - 0.15) * 1.2 : 0;
  if (!visible) return null;
  return (
    <div className="pointer-events-none absolute left-0 top-0 z-40" style={{ transform: `translate(${x}px, ${y}px)`, opacity }}>
      {last !== undefined ? (
        <span
          className="absolute -left-5 -top-5 size-10 rounded-full border-2 border-accent"
          style={{ opacity: 1 - progress(t, last, last + 650, linear), transform: `scale(${mix(0.4, 1.4, progress(t, last, last + 650))})` }}
        />
      ) : null}
      <span className="relative block" style={{ transform: `scale(${1 - Math.max(0, press) * 0.12})`, transformOrigin: "4px 4px" }}>
        <CursorIcon size={30} weight="fill" className="absolute -left-[3px] -top-[3px] text-surface" aria-hidden />
        <CursorIcon size={24} weight="fill" className="relative text-ink" aria-hidden />
      </span>
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
