import { ArrowRightIcon, ArrowsClockwiseIcon, GitForkIcon, ListMagnifyingGlassIcon } from "@phosphor-icons/react/ssr";
import type { Icon } from "@phosphor-icons/react";
import Link from "next/link";
import { BrandLogo } from "@/components/brand/brand-logo";
import { Reveal } from "@/components/motion/reveal";
import { SPACES } from "@/components/site/spaces";
import { Container } from "@/components/ui/container";
import { HERO_TITLE, LEAD, SECTION_TITLE } from "@/components/ui/titles";
import { BuildGlimpse, ChatGlimpse, ImagesGlimpse, VideoGlimpse } from "./glimpses";
import { HomeAsk } from "./home-ask";
import { PlatformWindow } from "./platform-window";

/**
 * The homepage's first screen (ADR 0216): Farbaek AI, and a message box to ask it something. Chat leads the platform, so the
 * first thing a visitor can do is ask. The headline is the largest paint, in the HTML, before any script runs (ADR 0052).
 */
export function Hero() {
  return (
    <section aria-labelledby="hero-title" className="relative overflow-hidden">
      <div aria-hidden className="dot-grid pointer-events-none absolute inset-0" />
      {/* A pool of signal light behind the message box: gradients only (ADR 0055). */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[46rem]"
        style={{
          background:
            "radial-gradient(46% 42% at 50% 40%, color-mix(in oklab, var(--color-accent) 10%, transparent), color-mix(in oklab, var(--color-accent-2) 4%, transparent) 55%, transparent 78%)",
        }}
      />
      <Container className="relative pb-10 pt-8 sm:pb-14 sm:pt-14 lg:pt-16">
        <Reveal className="mx-auto flex max-w-[52rem] flex-col items-center text-center">
          <BrandLogo height={84} className="h-16 w-auto sm:h-[5.25rem]" />
          <h1 id="hero-title" className={`mt-5 ${HERO_TITLE}`}>
            Ask, create and build with Farbaek AI.
          </h1>
          <p className={`mt-5 max-w-[38rem] text-ink-2 ${LEAD}`}>
            One assistant for questions, writing and code, pictures and video, and the sites and apps it builds and checks for you.
          </p>
          <div className="mt-8 w-full max-w-[42rem] sm:mt-10">
            <HomeAsk />
          </div>
        </Reveal>
      </Container>
    </section>
  );
}

/** Under the hero: the window onto Farbaek AI's four main spaces, Chat first. */
export function SpacesSection() {
  return (
    <section id="spaces" aria-labelledby="spaces-title" className="scroll-mt-20 pb-14 pt-10 sm:pb-20 sm:pt-14 lg:pb-28">
      <Container>
        <div className="mx-auto max-w-[68rem]">
          <div className="mx-auto mb-16 max-w-[40rem] text-center sm:mb-20">
            <h2 id="spaces-title" className={SECTION_TITLE}>
              Everything Farbaek AI can do, in one place.
            </h2>
            <p className={`mt-3 text-ink-2 sm:mt-4 ${LEAD}`}>
              Each space is made for its job: a conversation, a picture, a film, a website. They share one assistant, your files and your plan.
            </p>
          </div>
          <PlatformWindow
            glimpses={{
              chat: <ChatGlimpse />,
              images: <ImagesGlimpse />,
              video: <VideoGlimpse />,
              build: <BuildGlimpse />,
            }}
          />
        </div>
      </Container>
    </section>
  );
}

const STEPS: { icon: Icon; title: string; body: string }[] = [
  {
    icon: ListMagnifyingGlassIcon,
    title: "Reads what you need",
    body: "A question about code, a long document, a letter to write or a quick fact: Farbaek AI reads what kind of help it is before it answers.",
  },
  {
    icon: GitForkIcon,
    title: "Chooses the model for it",
    body: "Each question goes to the model best placed to answer it within your plan, from the leading AI labs. One writes, another paints, another films.",
  },
  {
    icon: ArrowsClockwiseIcon,
    title: "Keeps going when one is busy",
    body: "If a model can't answer, another takes the question before you've waited for nothing. Your conversation carries on as one.",
  },
];

/** One assistant over many models (ADR 0215), said plainly, without making the providers the headline. */
export function IntelligenceSection() {
  return (
    <section aria-labelledby="intelligence-title" className="py-14 sm:py-20 lg:py-28">
      <Container>
        <div className="mx-auto max-w-[44rem] text-center">
          <h2 id="intelligence-title" className={SECTION_TITLE}>
            One assistant. The right model behind every answer.
          </h2>
          <p className={`mt-3 text-ink-2 sm:mt-4 ${LEAD}`}>
            You talk to Farbaek AI. Behind it, Farbaek&apos;s intelligence layer sends each request to the model that does it best, and keeps the cost of your plan in view.
          </p>
        </div>
        <ol className="mx-auto mt-12 grid max-w-[64rem] gap-4 sm:mt-14 md:grid-cols-3">
          {STEPS.map(({ icon: StepIcon, title, body }) => (
            <li key={title} className="flex flex-col items-center rounded-md border border-line bg-surface px-5 py-7 text-center shadow-e1 sm:px-6">
              <span className="flex size-12 items-center justify-center rounded-full bg-canvas-2 text-accent ring-1 ring-line">
                <StepIcon size={24} aria-hidden />
              </span>
              <h3 className="mt-4 text-title-4 font-medium tracking-[-0.01em]">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-2">{body}</p>
            </li>
          ))}
        </ol>
        <p className="mx-auto mt-8 max-w-[44rem] text-center text-sm leading-relaxed text-ink-3">
          Farbaek AI runs on models made by other companies; ask it which one answered and it will tell you. It can make mistakes, so check what matters.
        </p>
      </Container>
    </section>
  );
}

/** The specialist spaces: there for the people who need them, without taking the front of the stage. */
export function AlsoSection() {
  const also = SPACES.filter((s) => s.secondary);
  return (
    <section aria-labelledby="also-title" className="pb-14 sm:pb-20">
      <Container>
        <div className="mx-auto max-w-[64rem]">
          <h2 id="also-title" className="text-center text-title-4 font-medium tracking-[-0.02em]">
            Also in Farbaek
          </h2>
          <ul className="mt-6 grid gap-3 sm:grid-cols-2">
            {also.map((s) => {
              const SpaceIcon = s.icon;
              return (
                <li key={s.id}>
                  <Link href={s.page} className="group flex h-full items-center gap-4 rounded-md border border-line bg-surface p-4 shadow-e1 transition-[transform,box-shadow] duration-300 hover:-translate-y-0.5 hover:shadow-e2 sm:p-5">
                    <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-canvas-2 text-ink-2 ring-1 ring-line group-hover:text-accent">
                      <SpaceIcon size={20} aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-body font-medium text-ink">{s.name}</span>
                      <span className="mt-0.5 block text-sm leading-snug text-ink-2">{s.promise}</span>
                    </span>
                    <ArrowRightIcon size={16} weight="bold" aria-hidden className="shrink-0 text-ink-3 transition-transform duration-200 group-hover:translate-x-0.5" />
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      </Container>
    </section>
  );
}
