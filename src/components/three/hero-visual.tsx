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

/** Tells the hero when the 3D scene has left the page, whatever switched it off. */
function WhileShown({ onGone, children }: { onGone: () => void; children: React.ReactNode }) {
  useEffect(() => onGone, [onGone]);
  return children;
}

const DARK_DEVICE = "(prefers-color-scheme: dark)";

/** Whether the figure stands on a dark page: only inside Farbaek Chat's frame, on its night theme (ADR 0213). */
function onDarkPage(el: HTMLElement | null): boolean {
  const theme = el?.closest<HTMLElement>("[data-chat-theme]")?.dataset.chatTheme;
  return theme === "dark" || (theme === "system" && window.matchMedia(DARK_DEVICE).matches);
}

/** Chat's theme can change while the page is open, from its settings or with the device. */
function watchPage(el: HTMLElement | null, notify: () => void): () => void {
  const root = el?.closest<HTMLElement>("[data-chat-theme]");
  if (!root) return () => {};
  const device = window.matchMedia(DARK_DEVICE);
  const seen = new MutationObserver(notify);
  seen.observe(root, { attributes: true, attributeFilter: ["data-chat-theme"] });
  device.addEventListener("change", notify);
  return () => {
    seen.disconnect();
    device.removeEventListener("change", notify);
  };
}

/**
 * The hero visual. The cat renders first (it is the LCP image). Round him
 * runs the Loom: the six RealityLoop stages on a tilted ring, evidence
 * packets and rising motes (ADR 0056).
 *
 * - Every screen gets the Loom drawn in 2D from the same geometry as the 3D
 *   scene (LoomCanvas), and the cat floats. Phones have it too, Low Power
 *   Mode included, without a 3D library.
 * - Desktops with a mouse load the 3D scene once the browser is idle, and it
 *   cross-fades in over the drawing (ADR 0052).
 * - Under reduced motion it's one still frame; off screen it stops.
 * - With a mouse, the whole figure leans a few degrees toward the pointer (stage 201): depth you can feel, never on touch
 *   screens and never under reduced motion. The light around him is the spectrum (ADR 0217): blue, rose and aqua.
 * - The cat is black, so on a dark page (Chat's night theme) he stands on his own white paper, as the app icon does
 *   (ADR 0226). The paper is drawn by CSS, so it is there at first paint; the 3D scene has no paper and stays off there.
 *
 * `sizes` is the cat's width for the image loader: the homepage shows him small, /build larger.
 */
export function HeroVisual({ sizes = "(min-width: 1024px) 44vw, (min-width: 640px) 440px, 92vw" }: { sizes?: string } = {}) {
  const reduce = useReducedMotion();
  const box = useRef<HTMLDivElement>(null);
  const ring = useRef<HTMLDivElement>(null);
  const [want3D, setWant3D] = useState(false);
  const [ready, setReady] = useState(false);
  const [visible, setVisible] = useState(true);
  const mounted = useSyncExternalStore(noSubscribe, () => true, () => false);
  // WCAG 2.2.2: motion that starts by itself and runs past five seconds can be paused (ADR 0172). Remembered in this browser.
  const storedHold = useSyncExternalStore(noSubscribe, readHold, () => false);
  const [chosenHold, setChosenHold] = useState<boolean | null>(null);
  const held = chosenHold ?? storedHold;
  const running = visible && !held;
  const subscribePage = useCallback((notify: () => void) => watchPage(box.current, notify), []);
  const readPage = useCallback(() => onDarkPage(box.current), []);
  const dark = useSyncExternalStore(subscribePage, readPage, () => false);

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

  // A tap or a click makes him hop once, and a ring of light spreads along the ground from his feet: the classes are
  // taken off and put back, so every tap plays them again.
  const hop = useCallback(() => {
    const el = box.current;
    if (!el) return;
    el.classList.remove("figure-hop", "figure-enter");
    ring.current?.classList.remove("figure-ripple-go");
    void el.offsetWidth;
    el.classList.add("figure-hop");
    ring.current?.classList.add("figure-ripple-go");
  }, []);

  const onReady = useCallback(() => setReady(true), []);
  // A scene that left (a dark page, reduced motion) isn't ready any more: the next one fades in only once it has drawn.
  const onGone = useCallback(() => setReady(false), []);
  const onSlow = useCallback(() => {
    setWant3D(false);
    setReady(false);
  }, []);
  const show3D = want3D && !reduce && !dark;
  // The drawing and the picture give way only while the 3D scene is on screen.
  const in3D = show3D && ready;
  const fade = (on: boolean) => `transition-opacity duration-300 ${on ? "opacity-100" : "opacity-0"}`;

  return (
    <div
      ref={box}
      data-paused={running ? undefined : ""}
      onClick={hop}
      className="figure-enter relative mx-auto aspect-[4/5] w-full max-w-[440px] transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] lg:max-w-none"
      style={{ transform: "perspective(900px) rotateY(calc(var(--lean-x, 0) * 7deg)) rotateX(calc(var(--lean-y, 0) * -5deg))" }}
    >
      {/* Soft light pool and contact shadow: page lighting around the figure, not a plate. The light blooms in as he
          arrives, then lives in two layers (ADR 0217): blue breathing behind him, and rose and aqua drifting slowly round. */}
      <div aria-hidden className="figure-bloom pointer-events-none absolute inset-0">
        <div className="hero-aura absolute inset-[-16%]" style={{ background: "radial-gradient(40% 36% at 50% 44%, color-mix(in oklab, var(--color-accent) 17%, transparent), transparent 70%)" }} />
        <div
          className="hero-aura-drift absolute inset-[-16%]"
          style={{
            background:
              "radial-gradient(30% 28% at 24% 66%, color-mix(in oklab, var(--color-spark-rose) 14%, transparent), transparent 70%), radial-gradient(30% 28% at 78% 26%, color-mix(in oklab, var(--color-spark-aqua) 15%, transparent), transparent 70%)",
          }}
        />
        <div
          className="hero-shadow absolute bottom-[6%] left-1/2 h-[6%] w-[46%] -translate-x-1/2 rounded-[50%]"
          style={{ background: "radial-gradient(50% 50% at 50% 50%, color-mix(in oklab, var(--color-ink) 16%, transparent), transparent 70%)" }}
        />
        {/* The ring a tap sends out along the ground. Out of sight until then. */}
        <div ref={ring} className="figure-ripple absolute bottom-[3.5%] left-1/2 h-[11%] w-[62%] -translate-x-1/2 rounded-[50%] border border-accent/45 opacity-0" />
      </div>

      {/* The Loom's far side, the cat, then its near side over him. Drawn once mounted; still under reduced motion. */}
      <LoomCanvas boxRef={box} still={!mounted || reduce !== false} paused={!running} hidden={!mounted || in3D}>
        <div className="hero-float absolute inset-0">
          {/* His paper on a dark page: out of sight everywhere else (src/styles/chat-theme.css shows it). A little larger
              than the picture, which fills the box's width inside its 10% padding. */}
          <div aria-hidden data-brand-paper="" className="absolute left-[4%] top-1/2 hidden w-[92%] -translate-y-1/2 rounded-[14%]" style={{ aspectRatio: `${LOGO.width} / ${LOGO.height}` }} />
          <Image
            src={LOGO.src}
            alt="Farbaek"
            fill
            preload
            // The largest paint on phones: ahead of the scripts (ADR 0052).
            fetchPriority="high"
            sizes={sizes}
            className={`object-contain p-[10%] ${fade(!in3D)}`}
          />
        </div>
      </LoomCanvas>

      {show3D ? (
        // Wider than its column so the orbit is never cropped; it never receives pointer events.
        <div className={`pointer-events-none absolute -inset-x-[40%] -inset-y-[6%] ${fade(in3D)}`}>
          <WhileShown onGone={onGone}>
            <LoomScene active={running} onReady={onReady} onSlow={onSlow} />
          </WhileShown>
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
