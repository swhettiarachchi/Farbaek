"use client";

/**
 * "What it does for you": four features, each with its own clip (ADR 0034).
 * On wide screens the text scrolls on the left while a pinned stage on the
 * right cross-fades to the clip of whichever feature crosses the middle of
 * the screen. On phones every feature shows its clip inline. Only the
 * layout on screen mounts its videos (ADR 0051).
 */
import { ArrowRightIcon, CheckIcon } from "@phosphor-icons/react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { FilmId } from "@/content/films";
import { FilmClip } from "./film-clip";
import { LG_QUERY, useMediaQuery } from "./use-playback";

export interface Feature {
  id: FilmId;
  /** A word or two, for the switcher beside the pinned clip. */
  label: string;
  title: string;
  points: string[];
  link: { href: string; label: string };
  poster: ReactNode;
}

function Bezel({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg bg-surface-raised/60 p-1.5 shadow-e3 ring-1 ring-line sm:p-2">
      <div className="relative overflow-hidden rounded-md ring-1 ring-line/70">{children}</div>
    </div>
  );
}

export function FeatureFilms({ features }: { features: Feature[] }) {
  const list = useRef<HTMLOListElement>(null);
  const [active, setActive] = useState(0);
  const lg = useMediaQuery(LG_QUERY);

  // The feature crossing the middle band of the screen is the one on stage. Two can share the
  // band for a moment while scrolling, so the one nearer the middle wins, checked on every change.
  useEffect(() => {
    const items = Array.from(list.current?.children ?? []);
    const inBand = new Set<number>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const i = items.indexOf(e.target);
          if (e.isIntersecting) inBand.add(i);
          else inBand.delete(i);
        }
        const mid = window.innerHeight / 2;
        let best = -1;
        let bestDistance = Infinity;
        for (const i of inBand) {
          const r = items[i]!.getBoundingClientRect();
          const distance = Math.abs((r.top + r.bottom) / 2 - mid);
          if (distance < bestDistance) {
            best = i;
            bestDistance = distance;
          }
        }
        if (best >= 0) setActive(best);
      },
      { rootMargin: "-45% 0px -45% 0px" },
    );
    items.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  const show = (i: number) => {
    const el = list.current?.children[i];
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
  };

  return (
    <div className="mt-12 grid gap-16 lg:mt-0 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-14 xl:gap-20">
      <ol ref={list} className="grid gap-16 lg:gap-0">
        {features.map((f, i) => {
          const current = i === active;
          return (
            <li key={f.id} className="lg:flex lg:min-h-[76vh] lg:flex-col lg:justify-center">
              <div className="mb-7 lg:hidden">
                <Bezel>
                  <FilmClip id={f.id} poster={f.poster} enabled={lg === false} />
                </Bezel>
              </div>
              <h3
                className={`text-balance text-[1.75rem] font-medium leading-[1.12] tracking-[-0.03em] transition-colors duration-300 sm:text-[2rem] ${
                  current ? "text-ink" : "text-ink lg:text-ink-3"
                }`}
              >
                {f.title}
              </h3>
              <ul className="mt-5 grid gap-3 text-[0.9375rem] leading-relaxed text-ink-2 sm:text-base">
                {f.points.map((p) => (
                  <li key={p} className="flex gap-3">
                    <span aria-hidden className="mt-[3px] inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-accent/10 text-accent">
                      <CheckIcon size={12} weight="bold" />
                    </span>
                    {p}
                  </li>
                ))}
              </ul>
              <a href={f.link.href} className="group mt-5 inline-flex min-h-11 items-center gap-2 self-start rounded-full text-sm font-medium text-accent">
                {f.link.label}
                <ArrowRightIcon size={14} weight="bold" aria-hidden className="transition-transform duration-200 group-hover:translate-x-0.5" />
              </a>
            </li>
          );
        })}
      </ol>

      <div className="hidden lg:block">
        <div className="sticky top-[max(6rem,calc(50vh-19rem))]">
          <div className="aurora">
            <Bezel>
              <div className="relative aspect-[4/3]">
                {features.map((f, i) => (
                  <div
                    key={f.id}
                    inert={i !== active}
                    className={`absolute inset-0 transition-[opacity,transform] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] ${
                      i === active ? "scale-100 opacity-100" : "scale-[0.985] opacity-0"
                    }`}
                  >
                    <FilmClip id={f.id} poster={f.poster} active={i === active} enabled={lg === true} />
                  </div>
                ))}
              </div>
            </Bezel>
          </div>
          <div className="mt-5 flex justify-center gap-2" role="group" aria-label="Features">
            {features.map((f, i) => (
              <button
                key={f.id}
                type="button"
                onClick={() => show(i)}
                aria-current={i === active ? "true" : undefined}
                className={`inline-flex min-h-11 items-center rounded-full px-4 text-sm font-medium capitalize ring-1 transition-colors duration-200 ${
                  i === active ? "bg-surface text-ink shadow-e1 ring-accent" : "text-ink-3 ring-line hover:text-ink-2"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
