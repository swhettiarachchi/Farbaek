"use client";

/**
 * The showroom's concept compositions (ADR 0031). Each concept has its own
 * arrangement of frames, drawn in HTML and SVG and sized in container units
 * (cqw), so a composition scales with the stage like a picture. Frames use
 * Farbaek's tokens; what's inside them uses the concept's own palette, set
 * as --s-* variables on the composition.
 *
 * Layers move with the pointer by their depth (no React re-render: motion
 * values) and rise in one after another; all of it stays still under
 * reduced motion.
 */
import { motion, useTransform, type MotionValue } from "motion/react";
import { createContext, useContext, type CSSProperties, type ReactNode } from "react";
import { swatch, type ShowcaseConcept } from "@/content/showcase";
import { Handbag, Headphones, KumoCloud, Ring, Sticker } from "./art";

export interface StageMotion {
  mx: MotionValue<number>;
  my: MotionValue<number>;
  reduce: boolean;
}

export const StageMotionContext = createContext<StageMotion | null>(null);

/** One layer of a composition: positioned in % of the stage, moved by the pointer by `depth`, risen in by `order`. */
function Layer({ depth, order, className = "", style, children }: { depth: number; order: number; className?: string; style?: CSSProperties; children: ReactNode }) {
  const ctx = useContext(StageMotionContext)!;
  const x = useTransform(ctx.mx, (v) => v * depth * 2.2);
  const y = useTransform(ctx.my, (v) => v * depth * 1.6);
  const xs = useTransform(x, (v) => `${v}cqw`);
  const ys = useTransform(y, (v) => `${v}cqw`);
  return (
    <motion.div
      className={`absolute ${className}`}
      style={style}
      initial={ctx.reduce ? { opacity: 0 } : { opacity: 0, y: 36, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={ctx.reduce ? { duration: 0.2 } : { type: "spring", stiffness: 100, damping: 20, delay: order * 0.08 }}
    >
      <motion.div className="h-full w-full" style={ctx.reduce ? undefined : { x: xs, y: ys }}>
        {children}
      </motion.div>
    </motion.div>
  );
}

function vars(c: ShowcaseConcept): CSSProperties {
  return {
    ["--s-surface" as string]: swatch(c, "surface"),
    ["--s-ink" as string]: swatch(c, "ink"),
    ["--s-accent" as string]: swatch(c, "accent"),
    ["--s-support" as string]: swatch(c, c.palette.some((p) => p.role === "support") ? "support" : "muted"),
    ["--s-muted" as string]: swatch(c, c.palette.some((p) => p.role === "muted") ? "muted" : "support"),
  };
}

/** A browser window in Farbaek's tokens; the page inside is the concept's. */
function Browser({ url, children, dark = false }: { url: string; children: ReactNode; dark?: boolean }) {
  return (
    <div className="flex h-full w-full flex-col overflow-hidden rounded-[1.4cqw] bg-surface shadow-e3 ring-1 ring-line">
      <div className={`flex h-[3cqw] shrink-0 items-center gap-[0.6cqw] px-[1.2cqw] ${dark ? "bg-media" : "bg-surface"}`}>
        {[0, 1, 2].map((i) => (
          <span key={i} className={`size-[0.75cqw] rounded-full ${dark ? "bg-media-ink-3/50" : "bg-line"}`} />
        ))}
        <span className={`mx-auto rounded-full px-[1.6cqw] py-[0.3cqw] font-mono text-[0.85cqw] ${dark ? "bg-white/10 text-media-ink-2" : "bg-surface-raised text-ink-3"}`}>{url}</span>
        <span className="w-[3.6cqw]" />
      </div>
      <div className="relative min-h-0 flex-1 overflow-hidden bg-[var(--s-surface)] text-[var(--s-ink)]">{children}</div>
    </div>
  );
}

/** A phone: a dark media bezel, a status bar in the concept's ink. */
function Phone({ children, time = "9:41" }: { children: ReactNode; time?: string }) {
  return (
    <div className="h-full w-full rounded-[3cqw] bg-media p-[0.5cqw] shadow-e3">
      <div className="relative flex h-full w-full flex-col overflow-hidden rounded-[2.55cqw] bg-[var(--s-surface)] text-[var(--s-ink)]">
        <div className="flex h-[3.4cqw] shrink-0 items-center justify-between px-[1.8cqw] text-[0.9cqw] font-semibold">
          <span>{time}</span>
          <span className="absolute left-1/2 top-[0.7cqw] h-[1.6cqw] w-[6cqw] -translate-x-1/2 rounded-full bg-media" />
          <span className="flex items-center gap-[0.35cqw]">
            <span className="h-[0.7cqw] w-[1.1cqw] rounded-[0.2cqw] border-[0.12cqw] border-current opacity-80" />
          </span>
        </div>
        <div className="relative min-h-0 flex-1">{children}</div>
        <div className="mx-auto mb-[0.7cqw] h-[0.35cqw] w-[7cqw] shrink-0 rounded-full bg-[var(--s-ink)] opacity-70" />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Typeset Foundry: the letters are the interface.                     */
/* ------------------------------------------------------------------ */

function Specimen() {
  const word = "Kestrel";
  return (
    <>
      <Layer depth={0.6} order={0} style={{ left: "3%", top: "6%", width: "80%", height: "86%" }}>
        <Browser url="typeset.studio">
          <div className="flex items-center justify-between px-[2.4cqw] pt-[1.6cqw] text-[1cqw]">
            <span className="font-mono font-bold tracking-[0.18em]">TYPESET</span>
            <span className="flex items-center gap-[2cqw] text-[var(--s-muted)]">
              <span>Fonts</span>
              <span>Trials</span>
              <span>Licences</span>
              <span className="size-[0.8cqw] rounded-full bg-[var(--s-accent)]" />
            </span>
          </div>
          <div className="grid grid-cols-[1.35fr_1fr] gap-[2cqw] px-[2.4cqw] pt-[2.2cqw]">
            <div className="leading-[0.86] tracking-[-0.055em]">
              {[900, 520, 200].map((w, row) => (
                <p key={w} className="text-[7.6cqw]" aria-hidden>
                  {[...word].map((ch, i) => (
                    <span
                      key={i}
                      className="inline-block motion-safe:animate-[showcase-weight_3.6s_ease-in-out_infinite]"
                      style={{ fontWeight: w, animationDelay: `${-(i * 0.18 + row * 0.6)}s`, ["--w" as string]: String(w) }}
                    >
                      {ch}
                    </span>
                  ))}
                </p>
              ))}
            </div>
            <div className="grid content-start gap-[1.4cqw] pt-[0.6cqw]">
              <div className="grid gap-[0.6cqw]">
                <div className="flex justify-between font-mono text-[0.9cqw] text-[var(--s-muted)]">
                  <span>Weight</span>
                  <span>640</span>
                </div>
                <div className="relative h-[0.3cqw] rounded-full bg-[var(--s-ink)]/15">
                  <span className="absolute inset-y-0 left-0 w-[62%] rounded-full bg-[var(--s-ink)]" />
                  <span className="absolute left-[62%] top-1/2 size-[1.4cqw] -translate-x-1/2 -translate-y-1/2 rounded-full border-[0.25cqw] border-[var(--s-ink)] bg-[var(--s-surface)]" />
                </div>
              </div>
              <div className="grid grid-cols-4 overflow-hidden rounded-[0.6cqw] border-[0.1cqw] border-[var(--s-ink)]/20 text-center text-[2cqw] font-semibold">
                {["A", "g", "R", "&", "8", "Q", "@", "k", "a", "ß", "?", "e"].map((g, i) => (
                  <span key={g} className={`border-[0.05cqw] border-[var(--s-ink)]/10 py-[0.5cqw] ${i === 5 ? "bg-[var(--s-accent)] text-[var(--s-surface)]" : ""}`}>
                    {g}
                  </span>
                ))}
              </div>
              <p className="font-mono text-[0.85cqw] text-[var(--s-muted)]">9 weights · variable · 640 glyphs</p>
            </div>
          </div>
        </Browser>
      </Layer>
      <Layer depth={1.8} order={1} style={{ right: "3%", bottom: "8%", width: "34%" }}>
        <div className="rounded-[1.2cqw] bg-[var(--s-surface)] p-[1.6cqw] text-[var(--s-ink)] shadow-e3 ring-1 ring-[var(--s-ink)]/10">
          <div className="flex items-center justify-between font-mono text-[0.85cqw] tracking-[0.12em] text-[var(--s-muted)]">
            <span>TYPE TESTER</span>
            <span>48 PT</span>
          </div>
          <p className="mt-[0.8cqw] text-[3cqw] font-bold leading-none tracking-[-0.04em]">
            Hamburgefonstiv<span className="ml-[0.2cqw] inline-block h-[2.6cqw] w-[0.25cqw] translate-y-[0.3cqw] bg-[var(--s-accent)] motion-safe:animate-[showcase-caret_1s_steps(1)_infinite]" />
          </p>
          <div className="mt-[1.2cqw] flex items-center gap-[0.8cqw] font-mono text-[0.85cqw] text-[var(--s-muted)]">
            <span>Aa</span>
            <span className="h-[0.25cqw] flex-1 rounded-full bg-[var(--s-ink)]/15">
              <span className="block h-full w-[40%] rounded-full bg-[var(--s-accent)]" />
            </span>
            <span className="text-[1.2cqw]">Aa</span>
          </div>
        </div>
      </Layer>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Maison Ore: one product per screen, lit like a sculpture.           */
/* ------------------------------------------------------------------ */

function Gallery() {
  return (
    <>
      <Layer depth={0.5} order={0} style={{ left: "3%", top: "7%", width: "70%", height: "84%" }}>
        <Browser url="maisonore.com">
          <div className="flex items-center justify-between px-[2.4cqw] pt-[1.5cqw] text-[0.85cqw] text-[var(--s-muted)]">
            <span className="flex gap-[1.6cqw]">
              <span>Bags</span>
              <span>Small goods</span>
            </span>
            <span className="text-[1.2cqw] font-medium tracking-[0.55em] text-[var(--s-ink)]">MAISON ORE</span>
            <span>Bag (0)</span>
          </div>
          <div className="grid h-[calc(100%-3cqw)] grid-cols-[0.8fr_1.2fr] items-center gap-[2cqw] px-[3cqw]">
            <div>
              <p className="text-[0.8cqw] tracking-[0.3em] text-[var(--s-muted)]">THE ARC BAG</p>
              <p className="mt-[1cqw] text-[2.3cqw] font-light leading-[1.15] tracking-[-0.02em]">Hand-stitched from thirty-two pieces of tanned leather.</p>
              <p className="mt-[1.4cqw] font-mono text-[1cqw]">$1,450</p>
              <span className="mt-[1.4cqw] inline-block border-b-[0.12cqw] border-[var(--s-ink)] pb-[0.2cqw] text-[0.9cqw] tracking-[0.2em]">DISCOVER</span>
            </div>
            <div className="relative grid h-full place-items-center">
              <span className="absolute inset-x-[6%] top-[4%] h-[80%] rounded-full bg-[radial-gradient(closest-side,rgba(255,255,255,0.95),rgba(255,255,255,0))]" />
              <Handbag className="relative z-10 mt-[2cqw] w-[66%] motion-safe:animate-[showcase-sway_7s_ease-in-out_infinite]" />
              <span className="absolute bottom-[16%] h-[8%] w-[62%] rounded-[50%] bg-[linear-gradient(#d4d6da,#bfc2c7)] shadow-[0_1.5cqw_2cqw_-1cqw_rgba(0,0,0,0.25)]" />
            </div>
          </div>
        </Browser>
      </Layer>
      <Layer depth={1.6} order={1} style={{ right: "5%", top: "13%", width: "21%", aspectRatio: "9 / 19.5" }}>
        <Phone>
          <div className="relative h-[52%] bg-[radial-gradient(closest-side,#ffffff,var(--s-surface))]">
            <Handbag className="absolute inset-x-[12%] top-[14%] w-[76%]" />
          </div>
          <div className="px-[1.6cqw] pt-[1.2cqw]">
            <p className="text-[0.75cqw] tracking-[0.3em] text-[var(--s-muted)]">MAISON ORE</p>
            <p className="mt-[0.4cqw] text-[1.6cqw] font-medium tracking-[-0.02em]">The Arc Bag</p>
            <p className="mt-[0.2cqw] font-mono text-[0.95cqw] text-[var(--s-muted)]">Graphite · $1,450</p>
            <div className="mt-[1cqw] flex gap-[0.6cqw]">
              {["#16171a", "#9db7cc", "#b8bbc0"].map((c, i) => (
                <span key={c} className={`size-[1.4cqw] rounded-full ${i === 0 ? "ring-[0.15cqw] ring-[var(--s-ink)]" : ""}`} style={{ background: c }} />
              ))}
            </div>
            <span className="mt-[1.4cqw] block rounded-full bg-[var(--s-ink)] py-[0.9cqw] text-center text-[1cqw] font-medium text-[var(--s-surface)]">Add to bag</span>
          </div>
        </Phone>
      </Layer>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Afterglow: a title sequence, a running film strip.                  */
/* ------------------------------------------------------------------ */

const STILLS = [
  "radial-gradient(circle at 50% 70%, #ffd27a 0 12%, transparent 13%), linear-gradient(#ff9a5a, #7a2048 70%, #2a0a18)",
  "repeating-linear-gradient(90deg, rgba(255,90,170,0.55) 0 6%, transparent 6% 14%, rgba(80,220,255,0.5) 14% 17%, transparent 17% 26%), linear-gradient(#0d1b3d, #3b0f4f)",
  "repeating-linear-gradient(170deg, rgba(255,255,255,0.35) 0 2%, transparent 2% 9%), linear-gradient(#a7d8e8, #1d5f8a)",
  "radial-gradient(ellipse at 30% 100%, #c2603a 0 40%, transparent 41%), radial-gradient(ellipse at 80% 110%, #a54a2a 0 45%, transparent 46%), linear-gradient(#f6c177, #e58f4f)",
  "radial-gradient(circle at 72% 28%, #f5f1d0 0 8%, transparent 9%), linear-gradient(#0f2a20, #04110c)",
];

function Cinema() {
  const frames = [...STILLS, ...STILLS];
  return (
    <>
      <Layer depth={0.5} order={0} style={{ left: "3%", top: "6%", width: "94%", height: "76%" }}>
        <Browser url="afterglowfest.org" dark>
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_-10%,var(--s-support),transparent_65%)]" />
          <div className="absolute inset-x-[2cqw] top-[1.2cqw] flex justify-between">
            {Array.from({ length: 26 }, (_, i) => (
              <span
                key={i}
                className="size-[0.6cqw] rounded-full bg-[var(--s-accent)] shadow-[0_0_0.8cqw_var(--s-accent)] motion-safe:animate-[showcase-twinkle_1.6s_ease-in-out_infinite]"
                style={{ animationDelay: `${(i % 2) * 0.8}s` }}
              />
            ))}
          </div>
          <div className="relative px-[3cqw] pt-[3.6cqw]">
            <p className="text-[9.4cqw] font-bold uppercase leading-[0.85] tracking-[-0.01em]" style={{ fontFamily: '"Bahnschrift Condensed", "DIN Condensed", "Arial Narrow", var(--font-geist), sans-serif' }}>
              Afterglow <span className="text-[var(--s-accent)]">27</span>
            </p>
            <p className="mt-[1cqw] text-[1.2cqw] text-[var(--s-ink)]/75">Lakeside Film Festival · 4 to 9 August · 62 films</p>
          </div>
          <div className="absolute inset-x-0 bottom-[1.6cqw] overflow-hidden bg-black/60 py-[0.9cqw]">
            <div className="flex w-max gap-[0.8cqw] motion-safe:animate-[showcase-marquee_28s_linear_infinite]">
              {frames.map((bg, i) => (
                <span key={i} className="relative h-[8.4cqw] w-[13cqw] shrink-0 rounded-[0.3cqw]" style={{ background: bg }}>
                  <span className="absolute inset-0 rounded-[0.3cqw] bg-[linear-gradient(transparent_60%,rgba(0,0,0,0.35))]" />
                </span>
              ))}
            </div>
            <div className="pointer-events-none absolute inset-x-0 top-[0.25cqw] h-[0.4cqw] bg-[repeating-linear-gradient(90deg,rgba(255,255,255,0.35)_0_0.6cqw,transparent_0.6cqw_1.6cqw)]" />
            <div className="pointer-events-none absolute inset-x-0 bottom-[0.25cqw] h-[0.4cqw] bg-[repeating-linear-gradient(90deg,rgba(255,255,255,0.35)_0_0.6cqw,transparent_0.6cqw_1.6cqw)]" />
          </div>
        </Browser>
      </Layer>
      <Layer depth={1.8} order={1} style={{ left: "6%", bottom: "4%", width: "30%" }}>
        <div className="rounded-[1.2cqw] bg-[var(--s-support)] p-[1.5cqw] text-[var(--s-ink)] shadow-e3 ring-1 ring-white/10">
          <p className="font-mono text-[0.8cqw] tracking-[0.2em] text-[var(--s-accent)]">NOW SHOWING</p>
          <p className="mt-[0.6cqw] text-[1.8cqw] font-semibold leading-tight tracking-[-0.02em]">The Long Summer</p>
          <p className="mt-[0.3cqw] text-[0.95cqw] opacity-75">Main hall · 21:30 · 112 min</p>
          <span className="mt-[1cqw] inline-block rounded-full bg-[var(--s-accent)] px-[1.4cqw] py-[0.6cqw] text-[0.95cqw] font-semibold text-[var(--s-surface)]">Book seats</span>
        </div>
      </Layer>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Halo One: a product that leans toward you; finishes you can try.    */
/* ------------------------------------------------------------------ */

function Product({ finish }: { finish: string }) {
  const ctx = useContext(StageMotionContext)!;
  const rotateY = useTransform(ctx.mx, (v) => v * 26);
  const rotateX = useTransform(ctx.my, (v) => v * -16);
  return (
    <>
      <Layer depth={0.3} order={0} style={{ left: "3%", top: "5%", width: "94%", height: "90%" }}>
        <div className="relative h-full w-full overflow-hidden rounded-[1.6cqw] bg-[var(--s-surface)] text-[var(--s-ink)] shadow-e2 ring-1 ring-line">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_42%_48%,#ffffff,transparent_55%)]" />
          <div className="absolute left-[3cqw] top-[2.6cqw]">
            <p className="text-[3.8cqw] font-semibold leading-none tracking-[-0.045em]">Halo One</p>
            <p className="mt-[0.6cqw] text-[1.1cqw] text-[var(--s-ink)]/60">Wireless, over-ear</p>
          </div>
          <div className="absolute right-[3cqw] top-[3cqw] text-right">
            <p className="font-mono text-[1.6cqw] font-semibold">$349</p>
            <span className="mt-[0.8cqw] inline-block rounded-full bg-[var(--s-accent)] px-[1.6cqw] py-[0.7cqw] text-[1cqw] font-semibold text-white">Add to cart</span>
          </div>
          <ul className="absolute right-[3cqw] top-[40%] grid gap-[1.6cqw] font-mono text-[1cqw]">
            {["40 h battery", "Adaptive noise control", "212 g"].map((s) => (
              <li key={s} className="flex items-center gap-[0.8cqw]">
                <span className="h-[0.1cqw] w-[5cqw] bg-[var(--s-ink)]/30" />
                <span className="size-[0.6cqw] rounded-full bg-[var(--s-accent)]" />
                {s}
              </li>
            ))}
          </ul>
        </div>
      </Layer>
      <Layer depth={1.2} order={1} style={{ left: "20%", top: "14%", width: "46%", height: "76%" }}>
        <div className="relative h-full w-full [perspective:120cqw]">
          <div className="absolute inset-[6%] rounded-full border-[0.18cqw] border-dashed border-[var(--s-ink)]/25 [transform:rotateX(72deg)] motion-safe:animate-[showcase-orbit_18s_linear_infinite]" />
          {/* A contact shadow drawn as a gradient: a drop-shadow filter trips WebKit bug 314999 on iOS (ADR 0055). */}
          <div aria-hidden className="absolute inset-x-[16%] bottom-[3%] h-[10%] rounded-[50%] bg-[radial-gradient(closest-side,color-mix(in_srgb,var(--s-ink)_26%,transparent),transparent)]" />
          <motion.div className="relative h-full w-full" style={ctx.reduce ? undefined : { rotateY, rotateX, transformStyle: "preserve-3d" }}>
            <Headphones finish={finish} className="h-full w-full" />
          </motion.div>
        </div>
      </Layer>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Northlight: a tilted research app and a command bar in front.        */
/* ------------------------------------------------------------------ */

function Workspace() {
  return (
    <>
      <Layer depth={0.5} order={0} style={{ left: "5%", top: "4%", width: "88%", height: "80%" }}>
        <div className="h-full w-full [perspective:140cqw]">
          <div className="h-full w-full origin-bottom [transform:rotateX(14deg)_rotateZ(-2deg)]">
            <Browser url="app.northlight.ai">
              <div className="grid h-full grid-cols-[17%_1fr_27%] text-[0.95cqw]">
                <aside className="border-r-[0.1cqw] border-[var(--s-ink)]/10 bg-[var(--s-ink)]/[0.03] p-[1.2cqw]">
                  <p className="flex items-center gap-[0.6cqw] font-semibold">
                    <span className="size-[1cqw] rounded-full bg-[var(--s-accent)]" /> Northlight
                  </p>
                  <p className="mt-[1.6cqw] font-mono text-[0.75cqw] text-[var(--s-muted)]">PROJECTS</p>
                  {["Coastal erosion", "Battery recycling", "Urban heat"].map((p, i) => (
                    <p key={p} className={`mt-[0.6cqw] rounded-[0.4cqw] px-[0.6cqw] py-[0.35cqw] ${i === 1 ? "bg-[var(--s-accent)]/12 font-medium text-[var(--s-ink)]" : "text-[var(--s-muted)]"}`}>
                      {p}
                    </p>
                  ))}
                </aside>
                <article className="px-[2.2cqw] pt-[1.8cqw]">
                  <p className="font-mono text-[0.75cqw] text-[var(--s-muted)]">DRAFT · 3 SOURCES</p>
                  <p className="mt-[0.6cqw] text-[1.9cqw] font-semibold leading-[1.1] tracking-[-0.03em]">Battery recycling: what works</p>
                  <p className="mt-[1.2cqw] leading-[1.6] text-[var(--s-ink)]/80">
                    Hydrometallurgy recovers most of the lithium at lower heat{" "}
                    <span className="rounded-[0.25cqw] bg-[var(--s-accent)] px-[0.35cqw] font-mono text-[0.75cqw] text-white">1</span>.{" "}
                    <span className="bg-[var(--s-accent)]/15 underline decoration-[var(--s-accent)] decoration-[0.15cqw] underline-offset-[0.3cqw]">
                      Field teams reported sorting, not chemistry, as the slowest step
                    </span>{" "}
                    <span className="rounded-[0.25cqw] bg-[var(--s-accent)] px-[0.35cqw] font-mono text-[0.75cqw] text-white">2</span>.
                  </p>
                  <div className="mt-[1.2cqw] grid gap-[0.6cqw]">
                    {[92, 78, 85, 60].map((w, i) => (
                      <span key={i} className="h-[0.7cqw] rounded-full bg-[var(--s-ink)]/10" style={{ width: `${w}%` }} />
                    ))}
                  </div>
                </article>
                <aside className="border-l-[0.1cqw] border-[var(--s-ink)]/10 p-[1.2cqw]">
                  <p className="font-mono text-[0.75cqw] text-[var(--s-muted)]">SOURCES</p>
                  {[
                    ["1", "Recovery rates, 2025", "report.pdf"],
                    ["2", "Field interviews (12)", "notes/field"],
                    ["3", "Lab notes, March", "lab/march"],
                  ].map(([n, t, d], i) => (
                    <div key={n} className={`mt-[0.8cqw] rounded-[0.6cqw] border-[0.1cqw] p-[0.8cqw] ${i === 1 ? "border-[var(--s-accent)] bg-[var(--s-accent)]/8" : "border-[var(--s-ink)]/10"}`}>
                      <p className="font-medium">
                        <span className="mr-[0.4cqw] font-mono text-[var(--s-accent)]">{n}</span>
                        {t}
                      </p>
                      <p className="mt-[0.2cqw] font-mono text-[0.75cqw] text-[var(--s-muted)]">{d}</p>
                    </div>
                  ))}
                </aside>
              </div>
            </Browser>
          </div>
        </div>
      </Layer>
      <Layer depth={2} order={1} style={{ left: "22%", bottom: "6%", width: "52%" }}>
        <div className="overflow-hidden rounded-[1.2cqw] bg-surface text-ink shadow-e3 ring-1 ring-line">
          <div className="flex items-center gap-[1cqw] px-[1.6cqw] py-[1.2cqw] text-[1.25cqw]">
            <span className="size-[1.2cqw] rounded-full border-[0.2cqw] border-[#0f9d76]" />
            <span className="text-ink-2">Ask Northlight to compare sources</span>
            <span className="ml-auto rounded-[0.4cqw] border-[0.1cqw] border-line px-[0.5cqw] font-mono text-[0.85cqw] text-ink-3">Ctrl K</span>
          </div>
          <div className="border-t border-line px-[1.6cqw] py-[0.9cqw] text-[1cqw] text-ink-3">
            <p className="rounded-[0.5cqw] bg-surface-raised px-[0.8cqw] py-[0.5cqw] text-ink-2">Which source disagrees with the others?</p>
            <p className="px-[0.8cqw] py-[0.5cqw]">Summarise the field interviews</p>
          </div>
        </div>
      </Layer>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Tally: two phones, fanned.                                          */
/* ------------------------------------------------------------------ */

function Pocket() {
  const people = [
    ["AM", "Amaya", "owes you LKR 3,100"],
    ["RK", "Ravi", "settled"],
    ["JD", "Jude", "owes you LKR 2,900"],
  ];
  return (
    <>
      <Layer depth={0.9} order={0} style={{ left: "17%", top: "6%", width: "24%", aspectRatio: "9 / 19.5" }}>
        <div className="h-full w-full -rotate-6">
          <Phone>
            <div className="px-[1.6cqw] pt-[1cqw]">
              <p className="flex items-center justify-between text-[1.5cqw] font-semibold tracking-[-0.02em]">
                Flat 4B
                <span className="flex -space-x-[0.6cqw]">
                  {["#5fd39a", "#cfe9d8", "#0e3b2e"].map((c) => (
                    <span key={c} className="size-[1.6cqw] rounded-full ring-[0.2cqw] ring-[var(--s-surface)]" style={{ background: c }} />
                  ))}
                </span>
              </p>
              <div className="relative mx-auto mt-[1.4cqw] w-[78%]">
                <Ring value={0.72} track="rgba(14,59,46,0.1)" fill="var(--s-accent)" className="w-full" />
                <div className="absolute inset-0 grid place-content-center text-center">
                  <p className="text-[2cqw] font-bold tracking-[-0.04em]">12,400</p>
                  <p className="text-[0.8cqw] text-[var(--s-muted)]">LKR left to settle</p>
                </div>
              </div>
              <ul className="mt-[1.4cqw] grid gap-[0.9cqw] text-[0.95cqw]">
                {people.map(([i, n, s]) => (
                  <li key={n} className="flex items-center gap-[0.8cqw]">
                    <span className="grid size-[2cqw] place-items-center rounded-full bg-[var(--s-ink)] text-[0.75cqw] font-semibold text-[var(--s-surface)]">{i}</span>
                    <span className="font-medium">{n}</span>
                    <span className="ml-auto text-[0.8cqw] text-[var(--s-muted)]">{s}</span>
                  </li>
                ))}
              </ul>
              <span className="mt-[1.6cqw] block rounded-full bg-[var(--s-ink)] py-[0.9cqw] text-center text-[1cqw] font-semibold text-[var(--s-surface)]">Settle up</span>
            </div>
          </Phone>
        </div>
      </Layer>
      <Layer depth={1.5} order={1} style={{ left: "52%", top: "10%", width: "24%", aspectRatio: "9 / 19.5" }}>
        <div className="h-full w-full rotate-[5deg]">
          <Phone>
            <div className="px-[1.6cqw] pt-[1cqw]">
              <p className="text-[0.85cqw] text-[var(--s-muted)]">Groceries · Tuesday</p>
              <p className="mt-[0.4cqw] text-[3cqw] font-bold leading-none tracking-[-0.05em]">8,400</p>
              <p className="text-[0.85cqw] text-[var(--s-muted)]">LKR, paid by Amaya</p>
              <p className="mt-[1.6cqw] text-[1cqw] font-semibold">Split 4 ways</p>
              <ul className="mt-[0.8cqw] grid gap-[0.8cqw]">
                {["You", "Amaya", "Ravi", "Jude"].map((n, i) => (
                  <li key={n} className="grid gap-[0.3cqw] text-[0.85cqw]">
                    <span className="flex justify-between">
                      <span>{n}</span>
                      <span className="font-mono">2,100</span>
                    </span>
                    <span className="h-[0.6cqw] rounded-full bg-[var(--s-ink)]/10">
                      <span className="block h-full rounded-full bg-[var(--s-accent)]" style={{ width: i === 1 ? "100%" : "25%" }} />
                    </span>
                  </li>
                ))}
              </ul>
              <div className="mt-[1.6cqw] rounded-[1cqw] border-[0.12cqw] border-dashed border-[var(--s-ink)]/25 p-[1cqw] font-mono text-[0.75cqw] text-[var(--s-muted)]">
                Receipt added · 14 items
              </div>
            </div>
          </Phone>
        </div>
      </Layer>
      <Layer depth={2.2} order={2} style={{ right: "4%", top: "16%", width: "22%" }}>
        <div className="flex items-center gap-[0.8cqw] rounded-[1.2cqw] bg-[var(--s-ink)] p-[1cqw] text-[var(--s-surface)] shadow-e3">
          <span className="grid size-[2.2cqw] place-items-center rounded-full bg-[var(--s-accent)] text-[1.2cqw] font-bold text-[var(--s-ink)]">✓</span>
          <span className="text-[0.95cqw] leading-snug">
            <span className="font-semibold">Ravi settled</span>
            <br />
            LKR 2,100 for groceries
          </span>
        </div>
      </Layer>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Kumo: a cloud that bounces, and stickers around it.                  */
/* ------------------------------------------------------------------ */

function Mascot() {
  const habits: [string, boolean][] = [
    ["Drink water", true],
    ["Walk 20 minutes", false],
    ["Read 10 pages", false],
  ];
  const stickers: { kind: "star" | "drop" | "book" | "heart"; style: CSSProperties; depth: number }[] = [
    { kind: "star", style: { left: "20%", top: "12%", width: "9%" }, depth: 2.4 },
    { kind: "drop", style: { left: "24%", top: "58%", width: "7%" }, depth: 2 },
    { kind: "book", style: { right: "20%", top: "22%", width: "10%" }, depth: 2.6 },
    { kind: "heart", style: { right: "24%", top: "66%", width: "7%" }, depth: 1.8 },
  ];
  return (
    <>
      <Layer depth={0.2} order={0} style={{ left: "26%", top: "8%", width: "48%", height: "84%" }}>
        <div className="h-full w-full rounded-full bg-[radial-gradient(closest-side,#ffd9cc,rgba(255,217,204,0))]" />
      </Layer>
      <Layer depth={1} order={1} style={{ left: "37.5%", top: "4%", width: "25%", aspectRatio: "9 / 19.5" }}>
        <Phone>
          <div className="px-[1.6cqw] pt-[0.8cqw]" style={{ fontFamily: 'ui-rounded, "SF Pro Rounded", "Arial Rounded MT Bold", var(--font-geist), sans-serif' }}>
            <p className="text-[0.95cqw] text-[var(--s-ink)]/60">Good morning</p>
            <p className="text-[1.8cqw] font-bold tracking-[-0.02em]">Hi, Ana</p>
            <div className="relative mt-[0.8cqw] grid place-items-center">
              <KumoCloud className="w-[86%] motion-safe:animate-[showcase-bounce_2.6s_cubic-bezier(0.34,1.56,0.64,1)_infinite]" />
              <span className="-mt-[0.6cqw] rounded-full bg-[var(--s-support)] px-[1.2cqw] py-[0.4cqw] text-[0.95cqw] font-bold">12 day streak</span>
            </div>
            <ul className="mt-[1.4cqw] grid gap-[0.7cqw]">
              {habits.map(([h, done]) => (
                <li key={h} className="flex items-center gap-[0.8cqw] rounded-[1cqw] bg-white px-[1cqw] py-[0.8cqw] text-[1cqw] font-semibold shadow-[0_0.3cqw_0_rgba(42,35,64,0.08)]">
                  <span className={`grid size-[1.6cqw] place-items-center rounded-full text-[0.9cqw] ${done ? "bg-[var(--s-accent)] text-white" : "border-[0.15cqw] border-[var(--s-ink)]/25"}`}>{done ? "✓" : ""}</span>
                  <span className={done ? "text-[var(--s-ink)]/50 line-through" : ""}>{h}</span>
                </li>
              ))}
            </ul>
          </div>
        </Phone>
      </Layer>
      {stickers.map((s, i) => (
        <Layer key={s.kind} depth={s.depth} order={2 + i} style={s.style}>
          <div className="motion-safe:animate-[showcase-float_5s_ease-in-out_infinite]" style={{ animationDelay: `${-i * 1.2}s` }}>
            <Sticker kind={s.kind} className="w-full" />
          </div>
        </Layer>
      ))}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Orbit Clinic: a shared schedule on the web and on the phone.         */
/* ------------------------------------------------------------------ */

const APPOINTMENTS: { col: number; start: number; len: number; who: string; tone: "a" | "b" | "new" }[] = [
  { col: 0, start: 0, len: 1, who: "Kasun P.", tone: "a" },
  { col: 0, start: 1.5, len: 1, who: "Mia R.", tone: "b" },
  { col: 0, start: 3, len: 1.5, who: "Ishara W.", tone: "a" },
  { col: 1, start: 0.5, len: 1, who: "Tom B.", tone: "b" },
  { col: 1, start: 2, len: 1, who: "New: Dilini", tone: "new" },
  { col: 2, start: 0, len: 1.5, who: "Sam K.", tone: "a" },
  { col: 2, start: 2.5, len: 1, who: "Nadia F.", tone: "b" },
  { col: 2, start: 3.5, len: 1, who: "Leo M.", tone: "a" },
];

function Fullstack() {
  return (
    <>
      <Layer depth={0.5} order={0} style={{ left: "3%", top: "7%", width: "72%", height: "84%" }}>
        <Browser url="orbitclinic.app/today">
          <div className="grid h-full grid-cols-[7%_1fr]">
            <aside className="flex flex-col items-center gap-[1.4cqw] bg-[var(--s-ink)] pt-[1.6cqw]">
              <span className="size-[1.6cqw] rounded-full border-[0.3cqw] border-[var(--s-accent)]" />
              {[0, 1, 2, 3].map((i) => (
                <span key={i} className={`size-[1.2cqw] rounded-[0.3cqw] ${i === 0 ? "bg-[var(--s-accent)]" : "bg-white/20"}`} />
              ))}
            </aside>
            <div className="px-[2cqw] pt-[1.4cqw] text-[0.9cqw]">
              <div className="flex items-end justify-between">
                <div>
                  <p className="font-mono text-[0.75cqw] text-[var(--s-muted)]">TUESDAY</p>
                  <p className="text-[1.8cqw] font-semibold tracking-[-0.03em]">Today, 14 appointments</p>
                </div>
                <span className="rounded-full bg-[var(--s-accent)] px-[1.2cqw] py-[0.5cqw] text-[0.9cqw] font-semibold text-white">New booking</span>
              </div>
              <div className="relative mt-[1.2cqw] grid grid-cols-[8%_1fr_1fr_1fr] gap-x-[0.8cqw]">
                <span />
                {["Dr. Nimal", "Sara", "Ken"].map((n) => (
                  <span key={n} className="pb-[0.6cqw] font-medium">
                    {n}
                  </span>
                ))}
                <div className="relative col-span-4 grid grid-cols-[8%_1fr_1fr_1fr] gap-x-[0.8cqw]" style={{ height: "27cqw" }}>
                  <div className="grid grid-rows-5 font-mono text-[0.75cqw] text-[var(--s-muted)]">
                    {["9:00", "10:00", "11:00", "12:00", "13:00"].map((t) => (
                      <span key={t}>{t}</span>
                    ))}
                  </div>
                  {[0, 1, 2].map((col) => (
                    <div key={col} className="relative rounded-[0.5cqw] bg-[repeating-linear-gradient(transparent_0_5.3cqw,rgba(11,37,69,0.07)_5.3cqw_5.4cqw)]">
                      {APPOINTMENTS.filter((a) => a.col === col).map((a) => (
                        <span
                          key={a.who}
                          className={`absolute inset-x-[0.2cqw] rounded-[0.5cqw] px-[0.6cqw] py-[0.4cqw] text-[0.8cqw] font-medium ${
                            a.tone === "new" ? "bg-[var(--s-ink)] text-white" : a.tone === "a" ? "border-l-[0.3cqw] border-[var(--s-accent)] bg-[var(--s-accent)]/15" : "border-l-[0.3cqw] border-[var(--s-ink)]/40 bg-[var(--s-ink)]/8"
                          }`}
                          style={{ top: `${a.start * 5.4}cqw`, height: `${a.len * 5.4 - 0.4}cqw` }}
                        >
                          {a.who}
                        </span>
                      ))}
                    </div>
                  ))}
                  <span className="pointer-events-none absolute inset-x-0 top-[8.6cqw] h-[0.15cqw] bg-[var(--s-accent)] motion-safe:animate-[showcase-now_6s_ease-in-out_infinite_alternate]" />
                </div>
              </div>
            </div>
          </div>
        </Browser>
      </Layer>
      <Layer depth={1.6} order={1} style={{ right: "5%", top: "12%", width: "21%", aspectRatio: "9 / 19.5" }}>
        <Phone>
          <div className="px-[1.5cqw] pt-[0.8cqw] text-[0.9cqw]">
            <p className="text-[1.6cqw] font-semibold tracking-[-0.02em]">Book a session</p>
            <p className="mt-[0.3cqw] text-[var(--s-muted)]">With Dr. Nimal, physiotherapy</p>
            <div className="mt-[1.2cqw] grid grid-cols-5 gap-[0.4cqw] text-center">
              {["M 13", "T 14", "W 15", "T 16", "F 17"].map((d, i) => (
                <span key={d} className={`rounded-[0.6cqw] py-[0.6cqw] text-[0.8cqw] font-medium ${i === 1 ? "bg-[var(--s-ink)] text-white" : "bg-[var(--s-ink)]/6"}`}>
                  {d}
                </span>
              ))}
            </div>
            <p className="mt-[1.2cqw] font-medium">Morning</p>
            <div className="mt-[0.6cqw] grid grid-cols-3 gap-[0.4cqw] text-center font-mono text-[0.8cqw]">
              {["9:00", "9:30", "10:00", "10:30", "11:00", "11:30"].map((t) => (
                <span key={t} className={`rounded-full py-[0.5cqw] ${t === "10:30" ? "bg-[var(--s-accent)] font-semibold text-white" : t === "9:30" ? "text-[var(--s-muted)] line-through" : "border-[0.1cqw] border-[var(--s-ink)]/15"}`}>
                  {t}
                </span>
              ))}
            </div>
            <div className="mt-[1.4cqw] rounded-[1cqw] bg-[var(--s-ink)]/5 p-[1cqw]">
              <p className="font-semibold">Tue 14, 10:30</p>
              <p className="text-[var(--s-muted)]">45 min · Room 2</p>
            </div>
            <span className="mt-[1.2cqw] block rounded-full bg-[var(--s-ink)] py-[0.9cqw] text-center font-semibold text-white">Confirm 10:30</span>
          </div>
        </Phone>
      </Layer>
      <Layer depth={2.2} order={2} style={{ left: "6%", bottom: "4%", width: "26%" }}>
        <div className="rounded-[1.2cqw] bg-surface p-[1.3cqw] text-ink shadow-e3 ring-1 ring-line">
          <p className="font-mono text-[0.8cqw] text-ink-3">ONE APP, BOTH SIDES</p>
          <ul className="mt-[0.7cqw] grid grid-cols-2 gap-[0.5cqw] text-[0.95cqw]">
            {["Booking pages", "Staff dashboard", "Accounts", "Reminders"].map((s) => (
              <li key={s} className="rounded-full bg-surface-raised px-[0.8cqw] py-[0.35cqw] text-center">
                {s}
              </li>
            ))}
          </ul>
        </div>
      </Layer>
    </>
  );
}

/** The composition for one concept, in its own palette. */
export function ConceptComposition({ concept, finish }: { concept: ShowcaseConcept; finish: string }) {
  const body = {
    specimen: <Specimen />,
    gallery: <Gallery />,
    cinema: <Cinema />,
    product: <Product finish={finish} />,
    workspace: <Workspace />,
    pocket: <Pocket />,
    mascot: <Mascot />,
    fullstack: <Fullstack />,
  }[concept.id];
  return (
    <div className="absolute inset-0" style={vars(concept)}>
      {body}
    </div>
  );
}
