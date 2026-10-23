"use client";

/**
 * The Loom drawn in 2D (ADR 0056): the 3D hero scene's rings, stage nodes,
 * evidence packets and motes, from the same geometry (loom-geometry.ts), on
 * two canvases either side of the knight. The far half goes behind him and
 * the near half in front. It costs a few hundred canvas calls a frame and no
 * 3D library, so phones get it, Low Power Mode included.
 *
 * It starts once the browser is idle, so it never competes with the page
 * starting up. Under reduced motion it draws one still frame. It stops off
 * screen and in a background tab, and fades out when the 3D scene takes over.
 */
import { useEffect, useRef, type ReactNode, type RefObject } from "react";
import { whenIdle } from "./capability";
import { LOOM, loomFrame, motes, type LoomShape, type LoomView } from "./loom-geometry";

/** A moment where the stages are spread round the ring, for the first frame and the still one. */
const START_SECONDS = 4;
/** About 60 frames a second at most, so 120 Hz screens don't draw twice as often. */
const MIN_FRAME_MS = 15;
/** On narrow screens the rings sit a little tighter round the knight, so the stages stay on screen. */
const NARROW_RING_SCALE = 0.78;
const WIDE_QUERY = "(min-width: 1024px)";
/** The knight artwork's proportions (1024 by 1536). */
const ART = { w: 2, h: 3 };

/** Where the canvas puts the knight: as tall as the poster's knight (object-contain inside 10% padding) and at the box's centre. */
function viewFor(canvas: HTMLCanvasElement, box: HTMLElement, dpr: number): LoomView {
  const c = canvas.getBoundingClientRect();
  const b = box.getBoundingClientRect();
  const knightPx = Math.min((b.width * 0.8 * ART.h) / ART.w, b.height - b.width * 0.2);
  return {
    scale: (knightPx / LOOM.knight.height) * dpr,
    knightX: (b.left + b.width / 2 - c.left) * dpr,
    knightY: (b.top + b.height / 2 - c.top) * dpr,
  };
}

function paint(ctx: CanvasRenderingContext2D, shapes: LoomShape[], width: number, height: number) {
  ctx.clearRect(0, 0, width, height);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const s of shapes) {
    ctx.globalAlpha = s.alpha;
    if (s.kind === "line") {
      ctx.strokeStyle = s.color;
      ctx.lineWidth = Math.max(1, s.width);
      ctx.beginPath();
      s.points.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
      ctx.stroke();
    } else {
      if (s.x < -s.r || s.y < -s.r || s.x > width + s.r || s.y > height + s.r) continue;
      ctx.fillStyle = s.color;
      ctx.beginPath();
      ctx.arc(s.x, s.y, Math.max(0.5, s.r), 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}

export function LoomCanvas({ boxRef, still, paused, hidden, children }: { boxRef: RefObject<HTMLDivElement | null>; still: boolean; paused: boolean; hidden: boolean; children: ReactNode }) {
  const back = useRef<HTMLCanvasElement>(null);
  const front = useRef<HTMLCanvasElement>(null);
  // The scene's clock carries on from where it stopped when it comes back on screen.
  const clock = useRef(START_SECONDS);

  useEffect(() => {
    const box = boxRef.current;
    const layers = [back.current, front.current];
    const [b, f] = layers;
    if (!box || !b || !f) return;
    if (hidden) {
      layers.forEach((c) => c && (c.style.opacity = "0"));
      return;
    }
    const bctx = b.getContext("2d");
    const fctx = f.getContext("2d");
    if (!bctx || !fctx) return;

    const field = motes();
    const wide = window.matchMedia(WIDE_QUERY);
    let view: LoomView = { scale: 1, knightX: 0, knightY: 0 };
    const size = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      for (const c of [b, f]) {
        const r = c.getBoundingClientRect();
        c.width = Math.max(1, Math.round(r.width * dpr));
        c.height = Math.max(1, Math.round(r.height * dpr));
      }
      view = viewFor(b, box, dpr);
    };
    const draw = () => {
      const frame = loomFrame(clock.current, view, { field, ringScale: wide.matches ? 1 : NARROW_RING_SCALE });
      paint(bctx, frame.back, b.width, b.height);
      paint(fctx, frame.front, f.width, f.height);
    };

    let raf = 0;
    let last = 0;
    let ro: ResizeObserver | null = null;
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      if (last === 0) last = now;
      const dt = now - last;
      if (dt < MIN_FRAME_MS) return;
      // A long gap (a stalled tab) doesn't jump the scene forward.
      clock.current += Math.min(dt, 100) / 1000;
      last = now;
      draw();
    };
    const cancelIdle = whenIdle(() => {
      size();
      draw();
      b.style.opacity = "1";
      f.style.opacity = "1";
      if (!still && !paused) raf = requestAnimationFrame(tick);
      ro = new ResizeObserver(() => {
        size();
        draw();
      });
      ro.observe(box);
    });
    return () => {
      cancelIdle();
      cancelAnimationFrame(raf);
      ro?.disconnect();
    };
  }, [boxRef, still, paused, hidden]);

  // Wider than the box, so the rings can pass beyond it; replaced elements don't stretch, so the size is explicit.
  const layer = "pointer-events-none absolute left-[-12%] top-[-6%] h-[112%] w-[124%] opacity-0 transition-opacity duration-700 lg:left-[-40%] lg:w-[180%]";
  return (
    <>
      <canvas ref={back} aria-hidden className={layer} />
      {children}
      <canvas ref={front} aria-hidden className={layer} />
    </>
  );
}
