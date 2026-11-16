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
 * - With a mouse, the whole figure leans a few degrees toward the pointer (stage 201): depth you can feel, never on touch
 *   screens and never under reduced motion. The light around him is the spectrum (ADR 0217): blue, rose and aqua.
 *
 * `sizes` is the knight's width for the image loader: the homepage shows him small, /build larger.
 */
export function HeroVisual({ sizes = "(min-width: 1024px) 44vw, (min-width: 640px) 440px, 92vw" }: { sizes?: string } = {}) {
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

  // Leaning toward the pointer: two numbers from -1 to 1 on the box, read by its transform. One frame at most per move.
  useEffect(() => {
    const el = box.current;
    if (!el || reduce !== false || !window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    let frame = 0;
    let x = 0;
    let y = 0;
    // Set on the hero around him when there is one (data-lean), so the cards beside him drift with the same numbers.
    const target = el.closest<HTMLElement>("[data-lean]") ?? el;
    const apply = () => {
      frame = 0;
      target.style.setProperty("--lean-x", x.toFixed(3));
      target.style.setProperty("--lean-y", y.toFixed(3));
    };
    const onMove = (e: PointerEvent) => {
      x = Math.max(-1, Math.min(1, (e.clientX / window.innerWidth) * 2 - 1));
      y = Math.max(-1, Math.min(1, (e.clientY / window.innerHeight) * 2 - 1));
      if (!frame) frame = requestAnimationFrame(apply);
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      cancelAnimationFrame(frame);
    };
  }, [reduce]);

  // A tap or a click makes him hop once: the class is taken off and put back, so every tap plays it again.
  const hop = useCallback(() => {
    const el = box.current;
    if (!el) return;
    el.classList.remove("knight-hop", "knight-enter");
    void el.offsetWidth;
    el.classList.add("knight-hop");
  }, []);

  const onReady = useCallback(() => setReady(true), []);
  const onSlow = useCallback(() => {
    setWant3D(false);
    setReady(false);
  }, []);
  const show3D = want3D && !reduce;
  const fade = (on: boolean) => `transition-opacity duration-300 ${on ? "opacity-100" : "opacity-0"}`;

  return (
    <div
      ref={box}
      data-paused={running ? undefined : ""}
      onClick={hop}
      className="knight-enter relative mx-auto aspect-[4/5] w-full max-w-[440px] transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] lg:max-w-none"
      style={{ transform: "perspective(900px) rotateY(calc(var(--lean-x, 0) * 7deg)) rotateX(calc(var(--lean-y, 0) * -5deg))" }}
    >
      {/* Soft light pool and contact shadow: page lighting around the figure, not a plate. */}
      <div
        aria-hidden
        className="hero-aura pointer-events-none absolute inset-[-16%]"
        style={{
          background:
            // The spectrum's light (ADR 0217): blue behind him, rose low on one side, aqua high on the other. Each fades to nothing.
            "radial-gradient(40% 36% at 50% 44%, color-mix(in oklab, var(--color-accent) 16%, transparent), transparent 70%), radial-gradient(30% 28% at 24% 66%, color-mix(in oklab, var(--color-spark-rose) 13%, transparent), transparent 70%), radial-gradient(30% 28% at 78% 26%, color-mix(in oklab, var(--color-spark-aqua) 14%, transparent), transparent 70%)",
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
            sizes={sizes}
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
        // Out of sight until someone tabs to it, like the skip link (ADR 0172, 2026-11-14 update): the owner wanted no
        // chip on the hero. People who want it still get it from the keyboard, and reduced motion stops everything.
        <button
          type="button"
          onClick={() => {
            setChosenHold(!held);
            writeHold(!held);
          }}
          className="sr-only text-label text-ink-2 focus:not-sr-only focus:absolute focus:bottom-0 focus:right-0 focus:inline-flex focus:min-h-11 focus:items-center focus:gap-1.5 focus:rounded-full focus:bg-surface/80 focus:px-3.5 focus:ring-1 focus:ring-line focus:backdrop-blur-xl"
        >
          {held ? <PlayIcon size={14} weight="fill" aria-hidden /> : <PauseIcon size={14} weight="fill" aria-hidden />}
          {held ? "Play motion" : "Pause motion"}
        </button>
      ) : null}
    </div>
  );
}
