"use client";

import Image from "next/image";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { useReducedMotion } from "motion/react";
import { LOGO } from "@/components/brand/brand-logo";
import { canRun3D, whenIdle } from "./capability";

const LoomScene = dynamic(() => import("./loom-scene"), { ssr: false });

/**
 * The hero visual. The static knight renders first (it is the LCP image);
 * the 3D scene loads once the browser is idle and cross-fades in. Under
 * reduced motion, Save-Data, weak hardware, no WebGL or a slow first
 * second, the static version stays.
 */
export function HeroVisual() {
  const reduce = useReducedMotion();
  const box = useRef<HTMLDivElement>(null);
  const [want3D, setWant3D] = useState(false);
  const [ready, setReady] = useState(false);
  const [visible, setVisible] = useState(true);

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
  const fade = (on: boolean) => `transition-opacity duration-700 ${on ? "opacity-100" : "opacity-0"}`;

  return (
    <div ref={box} className="relative mx-auto aspect-[4/5] w-full max-w-[440px] lg:max-w-none">
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
        className="pointer-events-none absolute bottom-[6%] left-1/2 h-[6%] w-[46%] -translate-x-1/2 rounded-[50%]"
        style={{ background: "radial-gradient(50% 50% at 50% 50%, rgb(18 19 23 / 0.16), transparent 70%)" }}
      />

      {/* Static orbit for the poster state. */}
      <svg aria-hidden viewBox="0 0 400 500" className={`absolute inset-0 h-full w-full ${fade(!ready)}`}>
        <g fill="none" transform="rotate(-8 200 250)">
          <ellipse cx="200" cy="268" rx="164" ry="42" stroke="rgb(36 80 240 / 0.55)" strokeWidth="1.2" />
          <ellipse cx="200" cy="268" rx="220" ry="58" stroke="rgb(18 19 23 / 0.12)" strokeWidth="0.9" />
        </g>
      </svg>

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

      {show3D ? (
        // Wider than its column so the orbit is never cropped; it never receives pointer events.
        <div className={`pointer-events-none absolute -inset-x-[40%] -inset-y-[6%] ${fade(ready)}`}>
          <LoomScene active={visible} onReady={onReady} onSlow={onSlow} />
        </div>
      ) : null}
    </div>
  );
}
