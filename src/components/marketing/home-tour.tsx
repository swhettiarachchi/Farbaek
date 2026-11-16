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
                      <span className={`block text-title-4 font-medium tracking-[-0.02em] transition-colors duration-300 ${on ? "text-ink" : "text-ink-3 hover:text-ink-2"}`}>{item.title}</span>
                    </button>
                    <div className={`grid transition-[grid-template-rows,opacity] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] ${on ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`} inert={!on}>
                      <div className="overflow-hidden">
                        <p className="text-sm font-semibold leading-snug text-ink">{item.promise}</p>
                        <p className="mt-2 text-sm leading-relaxed text-ink-2">{item.body}</p>
                        <Link href={item.href} className="group mt-3 inline-flex min-h-10 items-center gap-1.5 text-sm font-medium text-ink pointer-coarse:min-h-11">
                          {item.cta}
                          <ArrowRightIcon size={14} weight="bold" aria-hidden className="transition-transform duration-200 group-hover:translate-x-0.5" />
                        </Link>
                        <span aria-hidden className="mb-4 mt-2 block h-px w-full bg-line">
                          <span className="block h-px origin-left bg-ink" style={{ transform: `scaleX(${on ? progress : 0})` }} />
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

      {/* Phones and tablets: each space with its window. */}
      <ol className="mx-auto grid max-w-[40rem] gap-12 px-4 sm:px-6 lg:hidden">
        {items.map((item) => (
          <li key={item.id}>
            <h3 className="text-title-4 font-medium tracking-[-0.02em] text-ink">{item.title}</h3>
            <p className="mt-1.5 text-sm font-semibold leading-snug text-ink">{item.promise}</p>
            <p className="mt-2 text-sm leading-relaxed text-ink-2">{item.body}</p>
            <Link href={item.href} className="group mt-2 inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-ink">
              {item.cta}
              <ArrowRightIcon size={14} weight="bold" aria-hidden className="transition-transform duration-200 group-hover:translate-x-0.5" />
            </Link>
            <div className="mt-3 aspect-[16/11] w-full">{item.visual}</div>
          </li>
        ))}
      </ol>
    </>
  );
}
