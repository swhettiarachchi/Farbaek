"use client";

/**
 * The showroom (ADR 0031): an index of eight concepts beside a stage that
 * shows the chosen one. The index is a tablist (arrow keys move between
 * concepts); the stage tilts its layers toward the pointer and rests when
 * it's off screen or under reduced motion. "Start a build like this" hands
 * the concept's sentence to the build box at the top of the page.
 */
import { SparkleIcon } from "@phosphor-icons/react";
import { AnimatePresence, motion, useInView, useMotionValue, useReducedMotion, useSpring } from "motion/react";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { offerPrompt } from "@/components/build/prompt-composer";
import { SHOWCASE } from "@/content/showcase";
import { ConceptComposition, StageMotionContext } from "./mockups";

/** Halo One's finishes: the swatches really recolour the drawing. */
const FINISHES = [
  { name: "Graphite", hex: "#2b2d33" },
  { name: "Mist", hex: "#c9ced6" },
  { name: "Sage", hex: "#8fa58b" },
  { name: "Ember", hex: "#c2410c" },
];

export function Showroom() {
  const router = useRouter();
  const reduce = useReducedMotion() ?? false;
  const [active, setActive] = useState(0);
  const [finish, setFinish] = useState(FINISHES[0]!);
  const [handedOff, setHandedOff] = useState<string | null>(null);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const stage = useRef<HTMLDivElement>(null);
  const visible = useInView(stage, { margin: "120px 0px" });
  const rawX = useMotionValue(0);
  const rawY = useMotionValue(0);
  const mx = useSpring(rawX, { stiffness: 100, damping: 20 });
  const my = useSpring(rawY, { stiffness: 100, damping: 20 });
  const motionCtx = useMemo(() => ({ mx, my, reduce }), [mx, my, reduce]);
  const concept = SHOWCASE[active]!;

  const choose = (i: number, focus = false) => {
    const next = (i + SHOWCASE.length) % SHOWCASE.length;
    setActive(next);
    setHandedOff(null);
    if (focus) tabs.current[next]?.focus();
  };

  const onKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const step = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[e.key];
    if (step) {
      e.preventDefault();
      choose(i + step, true);
    } else if (e.key === "Home" || e.key === "End") {
      e.preventDefault();
      choose(e.key === "Home" ? 0 : SHOWCASE.length - 1, true);
    }
  };

  const onPointer = (e: PointerEvent<HTMLDivElement>) => {
    if (reduce || e.pointerType !== "mouse") return;
    const r = e.currentTarget.getBoundingClientRect();
    rawX.set((e.clientX - r.left) / r.width - 0.5);
    rawY.set((e.clientY - r.top) / r.height - 0.5);
  };
  const settle = () => {
    rawX.set(0);
    rawY.set(0);
  };

  const startLikeThis = () => {
    const taken = offerPrompt(concept.prompt);
    if (taken) setHandedOff(concept.id);
    else router.push("/sign-in?next=/app/new%3Fresume%3D1");
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,0.78fr)_minmax(0,2fr)] lg:gap-10">
      {/* The index: categories and concepts. A row of pills on phones, a list beside the stage on wide screens. */}
      <div
        role="tablist"
        aria-label="Concepts"
        aria-orientation="vertical"
        className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:-mx-6 sm:px-6 lg:mx-0 lg:grid lg:content-start lg:gap-1 lg:overflow-visible lg:px-0"
      >
        {SHOWCASE.map((c, i) => {
          const selected = i === active;
          return (
            <button
              key={c.id}
              ref={(el) => {
                tabs.current[i] = el;
              }}
              id={`showcase-tab-${c.id}`}
              role="tab"
              type="button"
              aria-selected={selected}
              aria-controls="showcase-panel"
              tabIndex={selected ? 0 : -1}
              onClick={() => choose(i)}
              onKeyDown={(e) => onKey(e, i)}
              className={`relative flex min-h-11 shrink-0 items-center rounded-full border px-4 text-left text-sm transition-colors duration-200 lg:grid lg:min-h-0 lg:rounded-sm lg:border-0 lg:py-3 lg:pl-5 lg:pr-3 ${
                selected ? "border-ink bg-ink text-on-primary lg:bg-surface lg:text-ink lg:shadow-e1" : "border-line bg-surface text-ink-2 hover:text-ink lg:bg-transparent lg:hover:bg-surface/70"
              }`}
            >
              {selected ? (
                <motion.span
                  layoutId="showcase-marker"
                  aria-hidden
                  className="absolute inset-y-3 left-0 hidden w-[3px] rounded-full bg-accent lg:block"
                  transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 300, damping: 30 }}
                />
              ) : null}
              <span className="hidden text-[12.5px] text-ink-3 lg:block">{c.category}</span>
              <span className="font-medium lg:mt-0.5 lg:text-[17px] lg:tracking-[-0.01em]">{c.name}</span>
            </button>
          );
        })}
      </div>

      <div id="showcase-panel" role="tabpanel" aria-labelledby={`showcase-tab-${concept.id}`} className="grid min-w-0 gap-5">
        {/* The stage: a picture of the concept, with the one live control (Halo One's finishes) laid over it. */}
        <div className="aurora">
        <div
          ref={stage}
          onPointerMove={onPointer}
          onPointerLeave={settle}
          data-paused={!visible || undefined}
          className="relative aspect-[16/11] overflow-hidden rounded-lg border border-line bg-canvas-2/80 [container-type:inline-size] data-[paused]:[&_*]:[animation-play-state:paused]"
        >
          <div aria-hidden className="dot-grid pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_at_50%_60%,black,transparent_75%)]" />
          <p className="sr-only">{concept.alt}</p>
          <StageMotionContext.Provider value={motionCtx}>
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={concept.id}
                aria-hidden
                className="pointer-events-none absolute inset-0"
                exit={reduce ? { opacity: 0, transition: { duration: 0.1 } } : { opacity: 0, scale: 0.985, transition: { duration: 0.18 } }}
              >
                <ConceptComposition concept={concept} finish={finish.hex} />
              </motion.div>
            </AnimatePresence>
          </StageMotionContext.Provider>

          {concept.id === "product" ? (
            <div role="group" aria-label="Try a finish" className="absolute bottom-[6%] left-[6%] flex items-center gap-2 rounded-full bg-surface/90 p-1.5 pr-3 shadow-e2 ring-1 ring-line backdrop-blur-sm">
              {FINISHES.map((f) => (
                <button
                  key={f.name}
                  type="button"
                  onClick={() => setFinish(f)}
                  aria-pressed={finish.name === f.name}
                  aria-label={`${f.name} finish`}
                  className="grid size-11 place-items-center rounded-full transition-transform duration-150 active:scale-95"
                >
                  <span
                    className={`size-6 rounded-full ring-1 ring-ink/15 transition-[box-shadow] duration-200 ${finish.name === f.name ? "shadow-[0_0_0_2px_var(--surface),0_0_0_4px_var(--ink)]" : ""}`}
                    style={{ background: f.hex }}
                  />
                </button>
              ))}
              <span className="ml-1 text-sm font-medium text-ink" aria-live="polite">
                {finish.name}
              </span>
            </div>
          ) : null}

          <span className="absolute right-3 top-3 inline-flex items-center gap-1.5 rounded-full border border-dashed border-line-strong/50 bg-surface/85 px-3 py-1 text-xs text-ink-2 backdrop-blur-sm">
            Concept mockup
          </span>
        </div>
        </div>

        {/* The concept: what it is, its design read and the sentence that starts a build like it. */}
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={concept.id}
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, transition: { duration: 0.12 } }}
            transition={{ duration: 0.3, ease: [0, 0, 0, 1] }}
            className="grid gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:gap-8"
          >
            <div>
              <p className="text-sm text-ink-3">
                {concept.category} · {concept.kind}
              </p>
              <h3 className="mt-1 text-[1.6rem] font-medium leading-tight tracking-[-0.03em]">{concept.name}</h3>
              <p className="mt-2 max-w-[46ch] text-[15px] leading-relaxed text-ink-2">{concept.line}</p>
              <p className="mt-4 text-sm text-ink-3">It starts with a sentence:</p>
              <p className="mt-1.5 max-w-[52ch] rounded-sm border border-line bg-surface px-4 py-3 text-[15px] leading-relaxed text-ink">&ldquo;{concept.prompt}&rdquo;</p>
              <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
                <button
                  type="button"
                  onClick={startLikeThis}
                  className="inline-flex h-11 items-center gap-2 rounded-full bg-primary px-5 text-sm font-medium text-on-primary transition-[transform,opacity] duration-150 hover:opacity-90 active:scale-[0.98]"
                >
                  <SparkleIcon size={16} weight="fill" aria-hidden /> Start a build like this
                </button>
                <p className="text-sm text-ink-3" aria-live="polite">
                  {handedOff === concept.id ? "It's in the build box at the top of the page. Change anything, then start." : "You approve the plan before anything is built."}
                </p>
              </div>
            </div>

            <dl className="grid content-start gap-4 border-t border-line pt-4 text-[14.5px] lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0">
              <div>
                <dt className="font-mono text-xs text-ink-3">{"// palette"}</dt>
                <dd className="mt-2 flex flex-wrap gap-2">
                  {concept.palette.map((p) => (
                    <span key={p.hex} className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface py-1 pl-1 pr-2.5 text-xs text-ink-2">
                      <span className="size-4 rounded-full ring-1 ring-ink/10" style={{ background: p.hex }} aria-hidden />
                      {p.name}
                      {p.role === "accent" ? <span className="text-ink-3">(accent)</span> : null}
                    </span>
                  ))}
                </dd>
              </div>
              <div>
                <dt className="font-mono text-xs text-ink-3">{"// type"}</dt>
                <dd className="mt-1 text-ink-2">{concept.type}</dd>
              </div>
              <div>
                <dt className="font-mono text-xs text-ink-3">{"// signature"}</dt>
                <dd className="mt-1 text-ink-2">{concept.signature}</dd>
              </div>
              <div>
                <dt className="font-mono text-xs text-ink-3">{"// skills it would use"}</dt>
                <dd className="mt-2 flex flex-wrap gap-1.5">
                  {concept.skills.map((s) => (
                    <span key={s} className="rounded-full bg-accent/[0.08] px-2.5 py-1 text-xs font-medium text-accent">
                      {s}
                    </span>
                  ))}
                </dd>
              </div>
              <p className="text-xs leading-relaxed text-ink-3">
                A build writes its own design read like this one into DESIGN.md before any page.
              </p>
            </dl>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
