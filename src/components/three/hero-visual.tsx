"use client";

import Image from "next/image";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useReducedMotion } from "motion/react";
import { LOGO } from "@/components/brand/brand-logo";
import { canRun3D, whenIdle } from "./capability";

const LoomScene = dynamic(() => import("./loom-scene"), { ssr: false });

const noSubscribe = () => () => {};

/** The rings, in the poster's 400 by 500 frame, tilted like the 3D orbit. */
const TILT = "rotate(-8 200 250)";
const INNER = { rx: 164, ry: 42 };
const OUTER = { rx: 220, ry: 58 };
const RING = "rgb(36 80 240 / 0.55)";
const FAINT_RING = "rgb(18 19 23 / 0.12)";
/** The inner ring from the left, along the near side first, then round the far side. */
const NEAR_FIRST = `M 36 268 A ${INNER.rx} ${INNER.ry} 0 0 0 364 268 A ${INNER.rx} ${INNER.ry} 0 0 0 36 268`;
/** The outer ring the other way round: the far side first. */
const FAR_FIRST = `M -20 268 A ${OUTER.rx} ${OUTER.ry} 0 0 1 420 268 A ${OUTER.rx} ${OUTER.ry} 0 0 1 -20 268`;

/**
 * A light travelling round a ring. The copy behind the knight is always
 * there; the copy in front shows only on the near half, so the knight hides
 * the light as it passes behind him. It runs on SMIL, which keeps going where
 * video can't (iOS Low Power Mode) and needs no script per frame.
 */
function Satellite({ path, dur, front, nearFirst, color, r }: { path: string; dur: string; front: boolean; nearFirst: boolean; color: string; r: number }) {
  return (
    <g>
      {/* Every light has one: Chrome stops redrawing an SVG whose only animations are animateMotion. */}
      <animate attributeName="opacity" values={front ? (nearFirst ? "1;0" : "0;1") : "1;1"} keyTimes="0;0.5" calcMode="discrete" dur={dur} repeatCount="indefinite" />
      <circle r={r * 2.6} fill={color} opacity="0.16" />
      <circle r={r} fill={color} />
      <animateMotion dur={dur} repeatCount="indefinite" path={path} />
    </g>
  );
}

function Satellites({ front }: { front: boolean }) {
  return (
    <>
      <Satellite path={NEAR_FIRST} dur="9s" front={front} nearFirst color="var(--accent)" r={3.5} />
      <Satellite path={FAR_FIRST} dur="14s" front={front} nearFirst={false} color="var(--accent-2)" r={2.5} />
    </>
  );
}

/**
 * The hero visual. The static knight renders first (it is the LCP image);
 * the 3D scene loads once the browser is idle and cross-fades in. Under
 * reduced motion, Save-Data, weak hardware, no WebGL or a slow first
 * second, the static version stays.
 *
 * The static version moves too (ADR 0056): the knight floats, and two lights
 * orbit him, passing in front on the near side of the ring. That's CSS and
 * SMIL, so phones get it without the 3D scene. It's still under reduced
 * motion and pauses off screen.
 */
export function HeroVisual() {
  const reduce = useReducedMotion();
  const box = useRef<HTMLDivElement>(null);
  const back = useRef<SVGSVGElement>(null);
  const front = useRef<SVGSVGElement>(null);
  const [want3D, setWant3D] = useState(false);
  const [ready, setReady] = useState(false);
  const [visible, setVisible] = useState(true);
  const mounted = useSyncExternalStore(noSubscribe, () => true, () => false);

  useEffect(() => {
    if (reduce) return;
    return whenIdle(() => {
      if (canRun3D()) setWant3D(true);
    });
  }, [reduce]);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => setVisible(Boolean(entry?.isIntersecting) && !document.hidden), { threshold: 0.05 });
    io.observe(el);
    const onVis = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  const onReady = useCallback(() => setReady(true), []);
  const onSlow = useCallback(() => {
    setWant3D(false);
    setReady(false);
  }, []);
  const show3D = want3D && !reduce;
  // The orbiting lights: after hydration, without reduced motion, until the 3D scene takes over.
  const orbit = mounted && reduce === false && !ready;
  const fade = (on: boolean) => `transition-opacity duration-700 ${on ? "opacity-100" : "opacity-0"}`;

  // The lights' clock stops off screen and in a background tab; both rings stop and start together.
  useEffect(() => {
    if (!orbit) return;
    for (const svg of [back.current, front.current]) {
      if (!svg || svg.animationsPaused() === !visible) continue;
      // Only on a real change: resuming a clock that isn't paused can stall it in Chrome.
      if (visible) svg.unpauseAnimations();
      else svg.pauseAnimations();
    }
  }, [visible, orbit]);

  return (
    <div ref={box} data-paused={visible ? undefined : ""} className="relative mx-auto aspect-[4/5] w-full max-w-[440px] lg:max-w-none">
      {/* Soft light pool and contact shadow: page lighting around the figure, not a plate. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-[-12%]"
        style={{
          background:
            "radial-gradient(42% 38% at 50% 42%, rgb(36 80 240 / 0.10) 0%, rgb(10 110 133 / 0.05) 45%, transparent 72%)",
        }}
      />
      <div
        aria-hidden
        className="hero-shadow pointer-events-none absolute bottom-[6%] left-1/2 h-[6%] w-[46%] -translate-x-1/2 rounded-[50%]"
        style={{ background: "radial-gradient(50% 50% at 50% 50%, rgb(18 19 23 / 0.16), transparent 70%)" }}
      />

      {/* The orbit for the poster state: both rings, and each light on the far side, behind the knight. */}
      <svg ref={back} aria-hidden viewBox="0 0 400 500" className={`absolute inset-0 h-full w-full overflow-visible ${fade(!ready)}`}>
        <g fill="none" transform={TILT}>
          <ellipse cx="200" cy="268" rx={INNER.rx} ry={INNER.ry} stroke={RING} strokeWidth="1.2" />
          <ellipse cx="200" cy="268" rx={OUTER.rx} ry={OUTER.ry} stroke={FAINT_RING} strokeWidth="0.9" />
        </g>
        {orbit ? (
          <g transform={TILT}>
            <Satellites front={false} />
          </g>
        ) : null}
      </svg>

      <div className="hero-float absolute inset-0">
        <Image
          src={LOGO.src}
          alt="Farbaek"
          fill
          preload
          // The largest paint on phones: ahead of the scripts (ADR 0052).
          fetchPriority="high"
          sizes="(min-width: 1024px) 44vw, (min-width: 640px) 440px, 92vw"
          className={`object-contain p-[10%] ${fade(!ready)}`}
        />
      </div>

      {/* The near side of each ring and its light, in front of the knight, so he stands inside the orbit. */}
      <svg ref={front} aria-hidden viewBox="0 0 400 500" className={`pointer-events-none absolute inset-0 h-full w-full overflow-visible ${fade(!ready)}`}>
        <g fill="none" transform={TILT}>
          <path d={`M 36 268 A ${INNER.rx} ${INNER.ry} 0 0 0 364 268`} stroke={RING} strokeWidth="1.2" />
          <path d={`M -20 268 A ${OUTER.rx} ${OUTER.ry} 0 0 0 420 268`} stroke={FAINT_RING} strokeWidth="0.9" />
        </g>
        {orbit ? (
          <g transform={TILT}>
            <Satellites front />
          </g>
        ) : null}
      </svg>

      {show3D ? (
        // Wider than its column so the orbit is never cropped; it never receives pointer events.
        <div className={`pointer-events-none absolute -inset-x-[40%] -inset-y-[6%] ${fade(ready)}`}>
          <LoomScene active={visible} onReady={onReady} onSlow={onSlow} />
        </div>
      ) : null}
    </div>
  );
}
