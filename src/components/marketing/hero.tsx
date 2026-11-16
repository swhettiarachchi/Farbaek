import Link from "next/link";
import { BrandLogo } from "@/components/brand/brand-logo";
import { Reveal } from "@/components/motion/reveal";
import { space } from "@/components/site/spaces";
import { Container } from "@/components/ui/container";
import { HERO_TITLE, LEAD, SECTION_TITLE } from "@/components/ui/titles";
import { HomeAsk } from "./home-ask";
import { HomeDemo } from "./home-demo";
import { HomeTour, type TourItem } from "./home-tour";
import { BuildWindow, ChatWindow, ImagesWindow, VideoWindow } from "./tour-windows";

/**
 * The homepage's first screen (stage 201, docs/research/homepage-references-2026-11.md): two lines, one sentence, a quiet
 * message box, then Farbaek AI itself in a window, the way ChatGPT's overview leads with its product. Flat white: no dot grid,
 * no pools of light. The headline is the largest paint, in the HTML, before any script runs (ADR 0052).
 */
export function Hero() {
  return (
    <section aria-labelledby="hero-title" className="pb-16 pt-14 sm:pb-24 sm:pt-20 lg:pt-24">
      <Container>
        <Reveal className="mx-auto flex max-w-[46rem] flex-col items-center text-center">
          <h1 id="hero-title" className={HERO_TITLE}>
            Ask, create and build with Farbaek AI.
          </h1>
          <p className={`mt-5 max-w-[34rem] text-ink-2 ${LEAD}`}>One assistant for questions, writing and code, pictures and video, and the sites and apps it builds and checks for you.</p>
          <div className="mt-8 w-full max-w-[41rem]">
            <HomeAsk />
          </div>
        </Reveal>
        <div className="home-settle mt-14 sm:mt-20">
          <HomeDemo />
        </div>
      </Container>
    </section>
  );
}

const TOUR: TourItem[] = [
  {
    id: "chat",
    title: "Chat",
    promise: "For questions, writing, code and thinking things through.",
    body: "Ask anything, add your PDFs and pictures, and get answers that arrive as they're written, with tables, code and maths drawn properly. Every version of an answer is kept.",
    href: "/chat",
    cta: "Explore Chat",
    visual: <ChatWindow />,
  },
  {
    id: "images",
    title: "Images",
    promise: "For pictures with studio light and finish.",
    body: "Describe a picture and pick a style: Farbaek AI writes the brief a photographer or illustrator would, then makes it. Edit your own photos the same way.",
    href: "/images",
    cta: "Explore Images",
    visual: <ImagesWindow />,
  },
  {
    id: "video",
    title: "Video",
    promise: "For short films with sound.",
    body: "From a sentence or one of your pictures, wide or vertical, up to ten seconds. Farbaek AI plans the shots, and the film keeps rendering if you leave.",
    href: "/video",
    cta: "Explore Video",
    visual: <VideoWindow />,
  },
  {
    id: "build",
    title: "Build",
    promise: "For websites and apps, by describing them.",
    body: "The agent drafts a plan for you to approve, builds in the open, runs the real checks and waits for your yes before anything goes live.",
    href: "/build",
    cta: "Explore Build",
    visual: <BuildWindow />,
  },
];

/** The four main spaces, as ChatGPT's overview tours its own: a sticky list beside one window that changes. */
export function TourSection() {
  return (
    <section id="spaces" aria-labelledby="spaces-title" className="scroll-mt-20 pt-6 sm:pt-10">
      <Container>
        <div className="mx-auto max-w-[40rem] text-center">
          <h2 id="spaces-title" className={SECTION_TITLE}>
            Four spaces, one assistant.
          </h2>
          <p className={`mt-3 text-ink-2 sm:mt-4 ${LEAD}`}>Each is made for its job, and they share Farbaek AI, your files and your plan.</p>
        </div>
      </Container>
      <div className="mt-10 sm:mt-12 lg:mt-0">
        <HomeTour items={TOUR} />
      </div>
    </section>
  );
}

const MODELS = ["Writing", "Code", "Pictures", "Video"];

/** One assistant over many models (ADR 0215), drawn: a question goes to Farbaek AI, and on to the model for the job. */
function Routing() {
  return (
    <div className="relative mx-auto aspect-[480/264] w-full max-w-[30rem]" role="img" aria-label="A question goes to Farbaek AI, which sends it to the model for the job: writing, code, pictures or video.">
      <svg viewBox="0 0 480 264" className="routing absolute inset-0 size-full" aria-hidden>
        <g fill="none" strokeWidth="1.5" strokeLinecap="round">
          <path d="M118 132 H178" stroke="var(--color-line-strong)" />
          {MODELS.map((m, i) => (
            <path key={m} d={`M262 132 C 300 132, 312 ${42 + i * 60}, 352 ${42 + i * 60}`} stroke={i === 1 ? "var(--color-accent)" : "var(--color-line-strong)"} className={i === 1 ? "routing-live" : undefined} pathLength={1} />
          ))}
        </g>
      </svg>
      <span aria-hidden className="absolute left-0 top-1/2 flex h-[15%] w-[24.5%] -translate-y-1/2 items-center justify-center rounded-full border border-line bg-surface text-xs text-ink-2">
        Your question
      </span>
      <span aria-hidden className="absolute left-[37.1%] top-1/2 flex h-[23%] w-[17.5%] -translate-y-1/2 items-center justify-center rounded-full border border-line-strong bg-surface">
        <BrandLogo height={30} />
      </span>
      {MODELS.map((m, i) => (
        <span
          key={m}
          aria-hidden
          className={`absolute right-0 flex h-[14%] w-[26%] -translate-y-1/2 items-center justify-center rounded-full border text-xs font-medium ${i === 1 ? "border-accent bg-accent/10 text-accent" : "border-line bg-surface text-ink-2"}`}
          style={{ top: `${((42 + i * 60) / 264) * 100}%` }}
        >
          {m}
        </span>
      ))}
    </div>
  );
}

/** One band, not three cards: what Farbaek AI is, beside how a question finds its model. */
export function IntelligenceSection() {
  return (
    <section aria-labelledby="intelligence-title" className="py-16 sm:py-24 lg:py-32">
      <Container>
        <div className="mx-auto grid max-w-[72rem] items-center gap-10 rounded-lg bg-canvas-2 px-5 py-10 sm:px-10 sm:py-14 lg:grid-cols-2 lg:gap-16 lg:px-14">
          <div>
            <h2 id="intelligence-title" className={SECTION_TITLE}>
              The right model behind every answer.
            </h2>
            <p className={`mt-4 text-ink-2 ${LEAD}`}>
              You talk to Farbaek AI. Behind it, each request goes to the model that does that job best within your plan, from the leading AI labs, and another steps in if one is busy.
            </p>
            <p className="mt-4 text-sm leading-relaxed text-ink-3">Ask Farbaek AI which model answered and it will tell you. It can make mistakes, so check what matters.</p>
          </div>
          <Routing />
        </div>
      </Container>
    </section>
  );
}

/** The specialist spaces, in one quiet line: there for the people who need them. */
export function AlsoSection() {
  const survey = space("survey");
  const proof = space("proof");
  return (
    <section aria-label="Also in Farbaek" className="pb-16 sm:pb-24">
      <Container>
        <p className="mx-auto max-w-[44rem] text-balance text-center text-body leading-relaxed text-ink-2">
          Also in Farbaek:{" "}
          <Link href={survey.page} className="font-medium text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink">
            Survey Studio
          </Link>{" "}
          for land survey plans drawn to scale, and{" "}
          <Link href={proof.page} className="font-medium text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink">
            Proof
          </Link>
          , for approvals bound to exactly what you saw and records anyone can verify.
        </p>
      </Container>
    </section>
  );
}
