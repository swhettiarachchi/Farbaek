"use client";

/**
 * The tour of Farbaek AI's four main spaces (stage 201), after ChatGPT's overview: from 1024px a list stays on the left while
 * one window on the right crossfades between the spaces as the page scrolls, a thin line under the open item showing how far
 * through it is. Choosing an item scrolls to it. On phones and tablets each space stacks with its window. Every window is in
 * the server's HTML; the ones not showing are hidden from screen readers and can't be focused.
 */
import { ArrowRightIcon } from "@phosphor-icons/react";
import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";

export interface TourItem {
  id: string;
  /** The space's colour (ADR 0217), as a CSS colour. */
  tone: string;
  icon: ReactNode;
  title: string;
  promise: string;
  body: string;
  href: string;
  cta: string;
  visual: ReactNode;
}

export function HomeTour({ items }: { items: TourItem[] }) {
  const track = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const el = track.current;
    if (!el) return;
    let frame = 0;
    const read = () => {
      frame = 0;
      if (window.innerWidth < 1024) return;
      const box = el.getBoundingClientRect();
      const span = box.height - window.innerHeight;
      const through = Math.min(Math.max(-box.top / Math.max(span, 1), 0), 0.9999);
      const at = through * items.length;
      setActive(Math.floor(at));
      setProgress(at - Math.floor(at));
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(read);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    frame = requestAnimationFrame(read);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      cancelAnimationFrame(frame);
    };
  }, [items.length]);

  const go = (i: number) => {
    const el = track.current;
    if (!el) return;
    const top = el.getBoundingClientRect().top + window.scrollY;
    const span = el.offsetHeight - window.innerHeight;
    window.scrollTo({ top: top + ((i + 0.05) / items.length) * span, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  };

  return (
    <>
      {/* From 1024px: the sticky tour. */}
      <div ref={track} className="relative hidden lg:block" style={{ height: `${items.length * 80 + 20}vh` }}>
        <div className="sticky top-16 flex h-[calc(100vh-4rem)] items-center">
          <div className="mx-auto grid w-full max-w-[72rem] grid-cols-[minmax(0,19rem)_minmax(0,1fr)] items-center gap-14 px-6">
            <ol className="grid">
              {items.map((item, i) => {
                const on = i === active;
                return (
                  <li key={item.id} className="border-t border-line first:border-t-0">
                    <button type="button" aria-current={on ? "step" : undefined} onClick={() => go(i)} className="block w-full py-4 text-left">
                      <span className={`flex items-center gap-2.5 text-title-4 font-medium tracking-[-0.02em] transition-colors duration-300 ${on ? "text-ink" : "text-ink-3 hover:text-ink-2"}`}>
                        <span
                          aria-hidden
                          className="flex size-8 items-center justify-center rounded-full transition-[background-color,color] duration-300"
                          style={on ? { background: `color-mix(in oklab, ${item.tone} 12%, var(--color-surface))`, color: item.tone } : { background: "var(--color-canvas-2)" }}
                        >
                          {item.icon}
                        </span>
                        {item.title}
                      </span>
                    </button>
                    <div className={`grid transition-[grid-template-rows,opacity] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] ${on ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`} inert={!on}>
                      <div className="overflow-hidden">
                        <p className="text-sm font-semibold leading-snug text-ink">{item.promise}</p>
                        <p className="mt-2 text-sm leading-relaxed text-ink-2">{item.body}</p>
                        <Link href={item.href} className="group mt-3 inline-flex min-h-10 items-center gap-1.5 text-sm font-medium pointer-coarse:min-h-11" style={{ color: item.tone }}>
                          {item.cta}
                          <ArrowRightIcon size={14} weight="bold" aria-hidden className="transition-transform duration-200 group-hover:translate-x-0.5" />
                        </Link>
                        <span aria-hidden className="mb-4 mt-2 block h-px w-full bg-line">
                          <span className="block h-0.5 origin-left rounded-full" style={{ transform: `scaleX(${on ? progress : 0})`, background: item.tone }} />
                        </span>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
            <div className="relative aspect-[16/10.5] w-full">
              {items.map((item, i) => (
                <div
                  key={item.id}
                  aria-hidden={i !== active}
                  inert={i !== active}
                  className={`absolute inset-0 transition-[opacity,transform] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] ${i === active ? "scale-100 opacity-100" : "pointer-events-none scale-[0.985] opacity-0"}`}
                >
                  {item.visual}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Phones and tablets: a row to swipe, one card for each space, so the page stays short. */}
      <ol className="flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none] sm:scroll-px-6 sm:gap-4 sm:px-6 lg:hidden">
        {items.map((item) => (
          <li key={item.id} className="flex w-[84vw] max-w-[24rem] shrink-0 snap-start flex-col rounded-md p-4" style={{ background: `color-mix(in oklab, ${item.tone} 6%, var(--color-canvas-2))` }}>
            <h3 className="flex items-center gap-2.5 text-title-4 font-medium tracking-[-0.02em] text-ink">
              <span aria-hidden className="flex size-8 items-center justify-center rounded-full" style={{ background: `color-mix(in oklab, ${item.tone} 14%, var(--color-surface))`, color: item.tone }}>
                {item.icon}
              </span>
              {item.title}
            </h3>
            <p className="mt-2 text-sm leading-snug text-ink-2">{item.promise}</p>
            <div className="mt-5 aspect-[5/4.6] w-full sm:aspect-[16/11]">{item.visual}</div>
            <Link href={item.href} className="group mt-auto inline-flex min-h-11 items-center gap-1.5 self-start pt-1 text-sm font-medium" style={{ color: item.tone }}>
              {item.cta}
              <ArrowRightIcon size={14} weight="bold" aria-hidden className="transition-transform duration-200 group-hover:translate-x-0.5" />
            </Link>
          </li>
        ))}
      </ol>
    </>
  );
}
