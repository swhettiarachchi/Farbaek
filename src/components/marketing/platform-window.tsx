"use client";

import { ArrowRightIcon, ArrowUpRightIcon } from "@phosphor-icons/react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { LOGO } from "@/components/brand/brand-logo";
import { SPACES, spaceStart, type Space } from "@/components/site/spaces";

/**
 * The homepage's platform window (ADR 0214): one tab per space, each showing a glimpse of that space's interface, with
 * the way into its page and into the app. A real tab list: arrow keys, Home and End move between tabs, and nothing
 * changes by itself. Every panel is in the server's HTML and they share one grid cell, so the window is the height of
 * the tallest and switching never moves the page. The cat knight peeks over the top edge once.
 *
 * Motion waits until the window is seen (globals.css): "no" before then, "yes" once it scrolls into view, so the first
 * tab rises as it arrives; "still" when it was already on screen as the page opened, so what was painted stays put and
 * only the knight peeks. A tab picked after that always rises in.
 */
export function PlatformWindow({ glimpses }: { glimpses: Record<Space["id"], ReactNode> }) {
  const [active, setActive] = useState<Space["id"]>("build");
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const root = useRef<HTMLDivElement>(null);
  const [seen, setSeen] = useState<"no" | "yes" | "still">("no");

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      // Without an observer there is nothing to wait for: show everything as painted.
      const frame = requestAnimationFrame(() => setSeen("still"));
      return () => cancelAnimationFrame(frame);
    }
    let first = true;
    const io = new IntersectionObserver(
      (entries) => {
        // A busy phone can deliver several entries at once: the newest one says where the window is now.
        const entry = entries[entries.length - 1];
        if (!entry) return;
        if (first) {
          first = false;
          if (entry.isIntersecting) {
            io.disconnect();
            setSeen("still");
            return;
          }
        }
        if (entries.some((e) => e.isIntersecting && e.intersectionRatio >= 0.05)) {
          io.disconnect();
          setSeen("yes");
        }
      },
      { threshold: [0, 0.05] },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const pick = (id: Space["id"]) => {
    // Picking the tab that's already open changes nothing, so nothing replays.
    if (id === active) return;
    setActive(id);
    setSeen("yes");
  };

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    // Alt+Arrow is the browser's Back and Forward; leave any key with a modifier alone.
    if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    const i = SPACES.findIndex((s) => s.id === active);
    const next =
      e.key === "ArrowRight" ? (i + 1) % SPACES.length : e.key === "ArrowLeft" ? (i - 1 + SPACES.length) % SPACES.length : e.key === "Home" ? 0 : e.key === "End" ? SPACES.length - 1 : -1;
    if (next < 0) return;
    e.preventDefault();
    pick(SPACES[next]!.id);
    tabs.current[next]?.focus();
  };

  return (
    <div ref={root} data-seen={seen} className="relative">
      {/* The knight stands behind the window, his feet hidden by its top edge. Decorative: the header names Farbaek. */}
      <div aria-hidden className="knight-peek pointer-events-none absolute right-[8%] top-0 z-0 w-16 -translate-y-[72%] sm:w-20 lg:w-28">
        <Image src={LOGO.src} alt="" width={LOGO.width} height={LOGO.height} sizes="112px" className="h-auto w-full" />
      </div>

      <div className="relative z-10 rounded-[1.625rem] bg-surface-raised/70 p-1.5 shadow-e3 ring-1 ring-line backdrop-blur-xl sm:rounded-lg sm:p-2">
        <div className="overflow-hidden rounded-md bg-surface ring-1 ring-line">
          <div className="flex items-center justify-between gap-3 border-b border-line px-2 py-2 sm:px-3">
            <div role="tablist" aria-label="Farbaek's spaces" onKeyDown={onKey} className="flex min-w-0 flex-1 gap-0.5 rounded-full bg-canvas-2 p-1 sm:flex-none">
              {SPACES.map((s, i) => {
                const on = s.id === active;
                const SpaceIcon = s.icon;
                return (
                  <button
                    key={s.id}
                    ref={(el) => {
                      tabs.current[i] = el;
                    }}
                    type="button"
                    role="tab"
                    id={`space-tab-${s.id}`}
                    aria-selected={on}
                    aria-controls={`space-panel-${s.id}`}
                    tabIndex={on ? 0 : -1}
                    onClick={() => pick(s.id)}
                    className={`inline-flex h-9 min-w-0 flex-1 pointer-coarse:h-11 items-center justify-center gap-1.5 rounded-full px-2.5 text-sm sm:flex-none font-medium transition-[color,background-color,box-shadow] duration-200 sm:px-3.5 ${
                      on ? "bg-surface text-ink shadow-e1 ring-1 ring-line" : "text-ink-2 hover:text-ink"
                    }`}
                  >
                    <SpaceIcon size={16} weight={on ? "fill" : "bold"} aria-hidden className={`hidden min-[25rem]:block ${on ? "text-accent" : ""}`} />
                    {s.short}
                  </button>
                );
              })}
            </div>
            <span className="hidden shrink-0 pr-2 text-xs text-ink-3 sm:inline">Sample work</span>
          </div>

          <div className="grid">
            {SPACES.map((s) => {
              const on = s.id === active;
              return (
                <div
                  key={s.id}
                  role="tabpanel"
                  id={`space-panel-${s.id}`}
                  aria-labelledby={`space-tab-${s.id}`}
                  data-active={on ? "" : undefined}
                  className={`col-start-1 row-start-1 flex min-h-0 flex-col ${on ? "visible" : "invisible"}`}
                >
                  <div className="min-h-[22rem] flex-1 sm:min-h-[24rem]">{glimpses[s.id]}</div>
                  <div className="flex flex-col gap-3 border-t border-line bg-canvas-2/60 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                    <p className="max-w-[46ch] text-sm leading-relaxed text-ink-2">
                      <span className="font-medium text-ink">{s.name}.</span> {s.promise}
                    </p>
                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                      <Link
                        href={s.page}
                        className="group tap inline-flex h-10 items-center gap-1.5 rounded-full px-3.5 text-sm font-medium text-ink-2 transition-colors duration-200 hover:bg-surface hover:text-ink"
                      >
                        Explore {s.name}
                        <ArrowRightIcon size={14} weight="bold" aria-hidden className="transition-transform duration-200 group-hover:translate-x-0.5" />
                      </Link>
                      <Link
                        href={spaceStart(s)}
                        className="group tap inline-flex h-10 items-center gap-1.5 rounded-full bg-primary pl-4 pr-3 text-sm font-medium text-on-primary shadow-e1 transition-[background-color,transform] duration-200 hover:bg-primary-hover active:scale-[0.98]"
                      >
                        {s.open}
                        <ArrowUpRightIcon size={14} weight="bold" aria-hidden className="transition-transform duration-200 group-hover:-translate-y-px group-hover:translate-x-px" />
                      </Link>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
