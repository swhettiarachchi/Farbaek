"use client";

import Image from "next/image";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { PauseIcon, PlayIcon } from "@phosphor-icons/react";
import { useReducedMotion } from "motion/react";
import { LOGO } from "@/components/brand/brand-logo";
import { canRun3D, whenIdle } from "./capability";
import { LoomCanvas } from "./loom-canvas";

const LoomScene = dynamic(() => import("./loom-scene"), { ssr: false });

const HOLD_KEY = "farbaek.motion-paused";

function readHold(): boolean {
  try {
    return window.localStorage.getItem(HOLD_KEY) === "1";
  } catch {
    return false;
  }
}

function writeHold(held: boolean) {
  try {
    window.localStorage.setItem(HOLD_KEY, held ? "1" : "0");
  } catch {
    // Without storage it stays paused until the page is opened again.
  }
}

const noSubscribe = () => () => {};

/**
 * The hero visual. The knight renders first (it is the LCP image). Round him
 * runs the Loom: the six RealityLoop stages on a tilted ring, evidence
 * packets and rising motes (ADR 0056).
 *
 * - Every screen gets the Loom drawn in 2D from the same geometry as the 3D
 *   scene (LoomCanvas), and the knight floats. Phones have it too, Low Power
 *   Mode included, without a 3D library.
 * - Desktops with a mouse load the 3D scene once the browser is idle, and it
 *   cross-fades in over the drawing (ADR 0052).
 * - Under reduced motion it's one still frame; off screen it stops.
 */
export function HeroVisual() {
  const reduce = useReducedMotion();
  const box = useRef<HTMLDivElement>(null);
  const [want3D, setWant3D] = useState(false);
  const [ready, setReady] = useState(false);
  const [visible, setVisible] = useState(true);
  const mounted = useSyncExternalStore(noSubscribe, () => true, () => false);
  // WCAG 2.2.2: motion that starts by itself and runs past five seconds can be paused (ADR 0172). Remembered in this browser.
  const storedHold = useSyncExternalStore(noSubscribe, readHold, () => false);
  const [chosenHold, setChosenHold] = useState<boolean | null>(null);
  const held = chosenHold ?? storedHold;
  const running = visible && !held;

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
  const fade = (on: boolean) => `transition-opacity duration-300 ${on ? "opacity-100" : "opacity-0"}`;

  return (
    <div ref={box} data-paused={running ? undefined : ""} className="relative mx-auto aspect-[4/5] w-full max-w-[440px] lg:max-w-none">
      {/* Soft light pool and contact shadow: page lighting around the figure, not a plate. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-[-12%]"
        style={{
          background:
            // Signal blue, with the aurora's cyan at its edge (ADR 0008).
            "radial-gradient(42% 38% at 50% 42%, color-mix(in oklab, var(--color-accent) 10%, transparent) 0%, color-mix(in oklab, var(--color-accent-2) 5%, transparent) 45%, transparent 72%)",
        }}
      />
      <div
        aria-hidden
        className="hero-shadow pointer-events-none absolute bottom-[6%] left-1/2 h-[6%] w-[46%] -translate-x-1/2 rounded-[50%]"
        style={{ background: "radial-gradient(50% 50% at 50% 50%, color-mix(in oklab, var(--color-ink) 16%, transparent), transparent 70%)" }}
      />

      {/* The Loom's far side, the knight, then its near side over him. Drawn once mounted; still under reduced motion. */}
      <LoomCanvas boxRef={box} still={!mounted || reduce !== false} paused={!running} hidden={!mounted || ready}>
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
      </LoomCanvas>

      {show3D ? (
        // Wider than its column so the orbit is never cropped; it never receives pointer events.
        <div className={`pointer-events-none absolute -inset-x-[40%] -inset-y-[6%] ${fade(ready)}`}>
          <LoomScene active={running} onReady={onReady} onSlow={onSlow} />
        </div>
      ) : null}

      {mounted && reduce === false ? (
        <button
          type="button"
          onClick={() => {
            setChosenHold(!held);
            writeHold(!held);
          }}
          className="absolute bottom-0 right-0 inline-flex min-h-11 items-center gap-1.5 rounded-full bg-surface/80 px-3.5 text-label text-ink-2 ring-1 ring-line backdrop-blur-xl transition-colors duration-150 hover:text-ink"
        >
          {held ? <PlayIcon size={14} weight="fill" aria-hidden /> : <PauseIcon size={14} weight="fill" aria-hidden />}
          {held ? "Play motion" : "Pause motion"}
        </button>
      ) : null}
    </div>
  );
}
