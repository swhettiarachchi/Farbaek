"use client";

/**
 * "Farbaek AI for everything you make" (stage 201): after ChatGPT's use-case rail. Tall, flat cards (light grey, no border, no
 * shadow): the job and a sentence at the top, a piece of the space that does it at the bottom, running off the card's edge.
 * The rail scrolls sideways, with arrows from tablets up; each card opens its space's page.
 */
import { ArrowLeftIcon, ArrowRightIcon, ArrowUpIcon, FilePdfIcon, SealCheckIcon } from "@phosphor-icons/react";
import Image from "next/image";
import Link from "next/link";
import { useRef, type ReactNode } from "react";

const TONE: Record<string, string> = { Chat: "var(--color-accent)", Images: "var(--color-spark-rose)", Video: "var(--color-spark-aqua)", Build: "var(--color-spark-leaf)", Proof: "var(--color-spark-ember)" };

const CARDS: { title: string; body: string; href: string; space: string; art: ReactNode }[] = [
  {
    title: "Writing",
    body: "Draft posts, letters and plans, then shape them with Farbaek AI as your thinking moves on.",
    href: "/chat",
    space: "Chat",
    art: (
      <div className="ml-6 rounded-tl-[1rem] border-l border-t border-line bg-surface p-4 text-left shadow-e1">
        <p className="text-xs font-medium text-ink-3">Opening week, post 3</p>
        <p className="mt-2 text-sm leading-relaxed text-ink">Saturday we open the doors. Come early: the first loaves are out at seven, and the tasting is on us.</p>
      </div>
    ),
  },
  {
    title: "Your documents",
    body: "Add a PDF and ask what it says. Farbaek AI reads it and answers in plain words.",
    href: "/chat",
    space: "Chat",
    art: (
      <div className="mx-5 grid gap-2">
        <span className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1.5 text-xs text-ink-2 shadow-e1">
          <FilePdfIcon size={14} weight="bold" className="text-ink-3" aria-hidden />
          Tenancy agreement, PDF
        </span>
        <div className="rounded-[1rem] rounded-bl-md bg-surface p-3 text-left text-sm leading-relaxed text-ink shadow-e1">Three years from 1 March. Rent is reviewed once a year, and repairs to the roof are yours.</div>
      </div>
    ),
  },
  {
    title: "Pictures",
    body: "Product shots, portraits and illustrations, with a professional's brief behind each style.",
    href: "/images",
    space: "Images",
    art: (
      <div className="mx-5 rounded-[1rem] border border-line bg-surface p-3 text-left shadow-e1">
        <p className="text-sm leading-snug text-ink">A blue ceramic cup on grey stone, window light</p>
        <div className="mt-3 flex items-center gap-1.5">
          {["Product shot", "Portrait", "High"].map((c, i) => (
            <span key={c} className={`rounded-full px-2 py-0.5 text-xs ${i === 0 ? "bg-spark-rose/10 text-spark-rose" : "bg-canvas-2 text-ink-2"}`}>
              {c}
            </span>
          ))}
          <span className="ml-auto flex size-7 items-center justify-center rounded-full bg-primary text-on-primary">
            <ArrowUpIcon size={14} weight="bold" aria-hidden />
          </span>
        </div>
      </div>
    ),
  },
  {
    title: "Short films",
    body: "From a sentence or one of your pictures, wide or vertical, with sound.",
    href: "/video",
    space: "Video",
    art: (
      <div className="mx-5 grid grid-cols-3 gap-1.5">
        {[16, 26, 36].map((t) => (
          <span
            key={t}
            className="block aspect-[9/14] rounded-sm ring-1 ring-line"
            style={{ background: `linear-gradient(180deg, color-mix(in oklab, var(--color-spark-aqua) ${t + 14}%, var(--color-media)), color-mix(in oklab, var(--color-spark-ember) ${t}%, var(--color-media)) 58%, var(--color-media) 62%)` }}
          />
        ))}
      </div>
    ),
  },
  {
    title: "Websites and apps",
    body: "Describe it. The agent plans, builds and checks it, and waits for your yes before anything goes live.",
    href: "/build",
    space: "Build",
    art: (
      <div className="relative ml-6 aspect-[4/3] overflow-hidden rounded-tl-[1rem] border-l border-t border-line bg-surface shadow-e1">
        <Image src="/films/clip-plan/clip.jpg" alt="" fill sizes="20rem" className="object-cover object-left-top" />
      </div>
    ),
  },
  {
    title: "Changes you can sign off",
    body: "Your approval covers exactly the change you saw, and a ProofPack keeps the record.",
    href: "/proof",
    space: "Proof",
    art: (
      <div className="mx-5 flex items-center gap-3 rounded-full border border-line bg-surface py-2 pl-2 pr-4 text-left shadow-e1">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-spark-ember/10 text-spark-ember">
          <SealCheckIcon size={20} weight="fill" aria-hidden />
        </span>
        <span className="text-sm leading-snug text-ink">Approved exactly as shown</span>
      </div>
    ),
  },
];

export function HomeRail() {
  const rail = useRef<HTMLUListElement>(null);
  const move = (dir: 1 | -1) => {
    const el = rail.current;
    if (!el) return;
    el.scrollBy({ left: dir * Math.min(el.clientWidth * 0.8, 640), behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  };
  return (
    <div>
      <ul ref={rail} className="flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none] sm:scroll-px-6 sm:gap-4 sm:px-6 lg:scroll-px-[max(1.5rem,calc((100vw-72rem)/2))] lg:px-[max(1.5rem,calc((100vw-72rem)/2))]">
        {CARDS.map((c) => (
          <li key={c.title} className="w-[70vw] max-w-[19.5rem] shrink-0 snap-start sm:w-[19.5rem]">
            <Link
              href={c.href}
              className="group flex h-[19rem] flex-col overflow-hidden rounded-md sm:h-[23rem] transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-1"
              style={{ background: `color-mix(in oklab, ${TONE[c.space]} 7%, var(--color-canvas-2))` }}
            >
              <div className="p-4 sm:p-5">
                <p className="text-xs font-medium" style={{ color: TONE[c.space] }}>
                  {c.space}
                </p>
                <h3 className="mt-1.5 text-title-4 font-medium tracking-[-0.02em] text-ink">{c.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-ink-2">{c.body}</p>
              </div>
              <div className="mt-auto translate-y-1 transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:translate-y-0">{c.art}</div>
            </Link>
          </li>
        ))}
      </ul>
      <div className="mx-auto mt-6 hidden max-w-[72rem] justify-center gap-2 px-6 sm:flex">
        <button type="button" onClick={() => move(-1)} aria-label="Previous" className="tap inline-flex size-10 items-center justify-center rounded-full border border-line text-ink-2 transition-colors duration-200 hover:bg-canvas-2 hover:text-ink">
          <ArrowLeftIcon size={16} weight="bold" aria-hidden />
        </button>
        <button type="button" onClick={() => move(1)} aria-label="Next" className="tap inline-flex size-10 items-center justify-center rounded-full border border-line text-ink-2 transition-colors duration-200 hover:bg-canvas-2 hover:text-ink">
          <ArrowRightIcon size={16} weight="bold" aria-hidden />
        </button>
      </div>
    </div>
  );
}
