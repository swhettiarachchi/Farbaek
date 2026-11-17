"use client";

/**
 * The homepage's product window (stage 201): Farbaek AI as it looks, with its sidebar and a conversation that writes itself the
 * first time it comes into view. One sample story crosses the spaces: an answer in Chat that offers to make the pictures and
 * the video and to build the site. Everything is in the HTML from the start, so nothing moves the page; under reduced motion,
 * or before scripts run, the answer is simply there.
 */
import { ArrowUpIcon, ChatCircleTextIcon, FilmSlateIcon, HammerIcon, ImageSquareIcon, MicrophoneIcon, PaperclipIcon, PencilSimpleIcon } from "@phosphor-icons/react";
import type { Icon } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { BrandLogo } from "@/components/brand/brand-logo";

const QUESTION = "I'm opening a small bakery in Galle next month. Plan the first week of posts for us.";
const INTRO = "Here's an opening week that builds from the first bake to the doors opening, one post every other day.";
const ROWS: [string, string, string][] = [
  ["Monday", "Behind the scenes: the first sourdough bake at dawn", "Photo"],
  ["Wednesday", "Meet the baker, and why the bread takes two days", "Short video"],
  ["Friday", "Opening Saturday: hours, the map and a free tasting", "Picture and caption"],
];
const CLOSE = "Want me to make the pictures and the video, and a simple website with the menu and the map?";

const SPACES: { label: string; icon: Icon; tone: string }[] = [
  { label: "Chat", icon: ChatCircleTextIcon, tone: "text-accent" },
  { label: "Images", icon: ImageSquareIcon, tone: "text-spark-rose" },
  { label: "Video", icon: FilmSlateIcon, tone: "text-spark-aqua" },
  { label: "Build", icon: HammerIcon, tone: "text-spark-leaf" },
];

const RECENT = ["Opening week posts", "Menu prices in rupees", "Explain this SQL error", "Logo ideas, warm and simple"];

const words = (s: string) => s.split(" ");
const INTRO_WORDS = words(INTRO);
const CLOSE_WORDS = words(CLOSE);
/** The steps the answer appears in: the intro word by word, then each row, then the closing line word by word, then the offers. */
const TOTAL = INTRO_WORDS.length + ROWS.length + CLOSE_WORDS.length + 1;

export function HomeDemo() {
  const root = useRef<HTMLDivElement>(null);
  // Where the writing has got to; the server and a first paint show the whole answer.
  const [step, setStep] = useState(TOTAL);

  useEffect(() => {
    const el = root.current;
    if (!el || typeof IntersectionObserver === "undefined" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let timer: number | undefined;
    let first = true;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry) return;
        if (first) {
          first = false;
          // Already on screen as the page opened: what was painted stays.
          if (entry.isIntersecting) {
            io.disconnect();
            return;
          }
          setStep(0);
          return;
        }
        if (entry.intersectionRatio < 0.35) return;
        io.disconnect();
        let n = 0;
        const tick = () => {
          n += 1;
          setStep(n);
          if (n < TOTAL) timer = window.setTimeout(tick, n < INTRO_WORDS.length ? 45 : n < INTRO_WORDS.length + ROWS.length ? 260 : 45);
        };
        timer = window.setTimeout(tick, 500);
      },
      { threshold: [0, 0.35] },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      window.clearTimeout(timer);
    };
  }, []);

  const shown = (i: number) => (i < step ? "opacity-100" : "opacity-0");
  const rowAt = INTRO_WORDS.length;
  const closeAt = rowAt + ROWS.length;
  const writing = step < TOTAL;

  return (
    <div ref={root} className="home-demo mx-auto w-full">
      <div className="overflow-hidden rounded-[1.25rem] border border-line bg-surface shadow-[0_1px_2px_rgb(0_0_0/0.04),0_24px_60px_-24px_rgb(18_24_40/0.22)] sm:rounded-[1.5rem]">
        <div className="grid lg:min-h-[28rem] lg:grid-cols-[14rem_minmax(0,1fr)]">
          <aside aria-hidden className="hidden flex-col gap-1 border-r border-line bg-canvas-2/70 p-3 lg:flex">
            <div className="flex items-center gap-2 px-2 pb-3 pt-1">
              <BrandLogo height={24} />
              <span className="text-sm font-semibold tracking-[-0.01em]">Farbaek AI</span>
            </div>
            <span className="mb-2 flex h-9 items-center gap-2 rounded-full border border-line bg-surface px-3 text-sm font-medium text-ink">
              <PencilSimpleIcon size={14} weight="bold" />
              New chat
            </span>
            {SPACES.map((s, i) => (
              <span key={s.label} className={`flex h-9 items-center gap-2.5 rounded-full px-3 text-sm ${i === 0 ? "bg-surface font-medium text-ink ring-1 ring-line" : "text-ink-2"}`}>
                <s.icon size={16} weight="fill" className={s.tone} />
                {s.label}
              </span>
            ))}
            <p className="px-3 pb-1 pt-4 text-xs font-medium text-ink-3">Recent</p>
            {RECENT.map((r, i) => (
              <span key={r} className={`truncate rounded-full px-3 py-1.5 text-sm ${i === 0 ? "bg-surface text-ink ring-1 ring-line" : "text-ink-2"}`}>
                {r}
              </span>
            ))}
          </aside>

          <div className="flex min-w-0 flex-col">
            <div className="flex h-10 items-center justify-between border-b border-line px-3.5 sm:h-12 sm:px-6">
              <span className="truncate text-sm font-medium text-ink">Opening week posts</span>
              <span className="rounded-full bg-canvas-2 px-3 py-1 text-xs text-ink-2">Auto</span>
            </div>
            <div className="flex flex-1 flex-col gap-3.5 px-3.5 py-3.5 sm:gap-5 sm:px-8 sm:py-7">
              <div className="ml-auto max-w-[30rem] rounded-[1.125rem] rounded-br-md bg-canvas-2 px-3.5 py-2 text-label leading-relaxed text-ink sm:px-4 sm:py-2.5 sm:text-sm">{QUESTION}</div>
              <div className="flex gap-2.5 sm:gap-3">
                <span className="mt-0.5 shrink-0">
                  <BrandLogo height={28} />
                </span>
                <div className="min-w-0 flex-1 text-label leading-relaxed text-ink sm:text-sm" aria-label="Farbaek AI's answer">
                  <p>
                    {INTRO_WORDS.map((w, i) => (
                      <span key={i} className={`transition-opacity duration-150 ${shown(i)}`}>
                        {w}{" "}
                      </span>
                    ))}
                  </p>
                  <div className="mt-2.5 overflow-hidden rounded-sm border border-line sm:mt-3 sm:rounded-md">
                    <table className="w-full border-collapse text-left text-xs sm:text-sm">
                      <thead>
                        <tr className="bg-canvas-2 text-xs text-ink-3">
                          <th className="px-2.5 py-1.5 font-medium sm:px-3 sm:py-2">Day</th>
                          <th className="px-2.5 py-1.5 font-medium sm:px-3 sm:py-2">Post</th>
                          <th className="hidden px-3 py-2 font-medium sm:table-cell">Format</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ROWS.map((r, i) => (
                          <tr key={r[0]} className={`border-t border-line transition-opacity duration-300 ${shown(rowAt + i)}`}>
                            <td className="px-2.5 py-1.5 align-top font-medium sm:px-3 sm:py-2">{r[0]}</td>
                            <td className="px-2.5 py-1.5 leading-snug text-ink-2 sm:px-3 sm:py-2">{r[1]}</td>
                            <td className="hidden whitespace-nowrap px-3 py-2 text-ink-2 sm:table-cell">{r[2]}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="mt-2.5 sm:mt-3">
                    {CLOSE_WORDS.map((w, i) => (
                      <span key={i} className={`transition-opacity duration-150 ${shown(closeAt + i)}`}>
                        {w}{" "}
                      </span>
                    ))}
                  </p>
                  <div className={`mt-2.5 flex gap-1.5 transition-[opacity,transform] duration-300 sm:mt-3 sm:flex-wrap sm:gap-2 ${step >= TOTAL ? "translate-y-0 opacity-100" : "translate-y-1 opacity-0"}`}>
                    {[
                      { label: "Make a picture", short: "Picture", icon: ImageSquareIcon, tone: "text-spark-rose" },
                      { label: "Make a video", short: "Video", icon: FilmSlateIcon, tone: "text-spark-aqua" },
                      { label: "Build a website", short: "Website", icon: HammerIcon, tone: "text-spark-leaf" },
                    ].map((o) => (
                      <span key={o.label} className="inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-full border border-line bg-surface px-2.5 text-xs font-medium text-ink sm:px-3">
                        <o.icon size={14} weight="fill" className={o.tone} />
                        <span className="sm:hidden">{o.short}</span>
                        <span className="hidden sm:inline">{o.label}</span>
                      </span>
                    ))}
                  </div>
                  <p className={`mt-2 text-xs text-ink-3 transition-opacity duration-300 ${writing ? "opacity-0" : "opacity-100"}`}>Farbaek AI. Thought for 2 seconds.</p>
                </div>
              </div>
              <div className="mt-auto flex items-center gap-2 rounded-[1.25rem] border border-line bg-surface p-1.5 pl-4">
                <span className="min-w-0 flex-1 truncate text-sm text-ink-3">Ask Farbaek AI</span>
                <PaperclipIcon size={16} weight="bold" className="hidden text-ink-3 sm:block" aria-hidden />
                <MicrophoneIcon size={16} weight="bold" className="hidden text-ink-3 sm:block" aria-hidden />
                <span className="flex size-8 items-center justify-center rounded-full bg-primary text-on-primary">
                  <ArrowUpIcon size={14} weight="bold" aria-hidden />
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
