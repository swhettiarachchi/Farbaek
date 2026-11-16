import { ChatCircleTextIcon, FilmSlateIcon, HammerIcon, ImageSquareIcon } from "@phosphor-icons/react/ssr";
import Link from "next/link";
import { BrandLogo } from "@/components/brand/brand-logo";
import { Reveal } from "@/components/motion/reveal";
import { space } from "@/components/site/spaces";
import { Container } from "@/components/ui/container";
import { HERO_TITLE, LEAD, SECTION_TITLE } from "@/components/ui/titles";
import { HeroVisual } from "@/components/three/hero-visual";
import { HeroProps, SPACE_TONE } from "./hero-props";
import { HomeAsk } from "./home-ask";
import { HomeDemo } from "./home-demo";
import { HomeTour, type TourItem } from "./home-tour";
import { BuildWindow, ChatWindow, ImagesWindow, VideoWindow } from "./tour-windows";

/**
 * The light around a product window (ADR 0217), after Google Antigravity's: the interface stays neutral, and the spectrum
 * glows from behind its edges. Gradients only, each fading to nothing (ADR 0055). `tones` are the colours at the top, the
 * left, the right and the bottom.
 */
export function Halo({ tones }: { tones: [string, string, string, string] }) {
  const glow = (tone: string, at: string, size: string) => `radial-gradient(${size} at ${at}, color-mix(in oklab, ${tone} 38%, transparent), transparent 72%)`;
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute -inset-3 rounded-[2rem] sm:-inset-5"
      style={{ background: [glow(tones[0], "50% 2%", "58% 34%"), glow(tones[1], "1% 62%", "20% 46%"), glow(tones[2], "99% 46%", "20% 46%"), glow(tones[3], "50% 99%", "46% 22%")].join(", ") }}
    />
  );
}

/**
 * The homepage's first screen (stage 201, ADR 0217; docs/research/homepage-references-2026-11.md): the cat knight with his
 * Loom turning round him, compact and centred, then two lines with the three verbs in the spaces' colours, one sentence and the
 * message box. On wide screens a card for each space floats at the sides. Under it, Farbaek AI itself in a window, on a pale
 * stage with the spectrum glowing behind its edges. The knight is the largest paint and loads first (ADR 0052).
 */
export function Hero() {
  return (
    <section aria-labelledby="hero-title" data-lean className="relative overflow-x-clip pb-10 pt-2 sm:pb-20 sm:pt-8">
      <HeroProps />
      <Container>
        <Reveal className="relative mx-auto flex max-w-[46rem] flex-col items-center text-center">
          <div className="w-[13rem] sm:w-[12.5rem] lg:w-[12.5rem]">
            <HeroVisual sizes="210px" />
          </div>
          <h1 id="hero-title" className={`mt-2 ${HERO_TITLE}`}>
            <span className="text-accent">Ask</span>, <span className="text-spark-rose">create</span> and <span className="text-spark-leaf">build</span> with Farbaek AI.
          </h1>
          <p className={`mt-3 max-w-[34rem] text-ink-2 sm:mt-4 ${LEAD}`}>One assistant for questions, writing and code, pictures and video, and the sites and apps it builds and checks for you.</p>
          <div className="mt-5 w-full max-w-[41rem] sm:mt-7">
            <HomeAsk />
          </div>
        </Reveal>
        <div className="home-settle mx-auto mt-9 max-w-[68rem] rounded-[1.5rem] bg-canvas-2 p-2.5 sm:mt-16 sm:rounded-lg sm:p-8 lg:p-10">
          <div className="relative">
            <Halo tones={[SPACE_TONE.chat, SPACE_TONE.images, SPACE_TONE.video, SPACE_TONE.build]} />
            <div className="relative">
              <HomeDemo />
            </div>
          </div>
          <p className="mt-2.5 text-center text-xs text-ink-3 sm:mt-8">A sample conversation, drawn from Farbaek AI&apos;s chat.</p>
        </div>
      </Container>
    </section>
  );
}

const TOUR: TourItem[] = [
  {
    id: "chat",
    tone: SPACE_TONE.chat,
    icon: <ChatCircleTextIcon size={16} weight="fill" />,
    title: "Chat",
    promise: "For questions, writing, code and thinking things through.",
    body: "Ask anything, add your PDFs and pictures, and get answers that arrive as they're written, with tables, code and maths drawn properly. Every version of an answer is kept.",
    href: "/chat",
    cta: "Explore Chat",
    visual: <ChatWindow />,
  },
  {
    id: "images",
    tone: SPACE_TONE.images,
    icon: <ImageSquareIcon size={16} weight="fill" />,
    title: "Images",
    promise: "For pictures with studio light and finish.",
    body: "Describe a picture and pick a style: Farbaek AI writes the brief a photographer or illustrator would, then makes it. Edit your own photos the same way.",
    href: "/images",
    cta: "Explore Images",
    visual: <ImagesWindow />,
  },
  {
    id: "video",
    tone: SPACE_TONE.video,
    icon: <FilmSlateIcon size={16} weight="fill" />,
    title: "Video",
    promise: "For short films with sound.",
    body: "From a sentence or one of your pictures, wide or vertical, up to ten seconds. Farbaek AI plans the shots, and the film keeps rendering if you leave.",
    href: "/video",
    cta: "Explore Video",
    visual: <VideoWindow />,
  },
  {
    id: "build",
    tone: SPACE_TONE.build,
    icon: <HammerIcon size={16} weight="fill" />,
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
      <div className="mt-5 sm:mt-12 lg:mt-0">
        <HomeTour items={TOUR} />
      </div>
    </section>
  );
}

const MODELS: { label: string; tone: string }[] = [
  { label: "Writing", tone: SPACE_TONE.chat },
  { label: "Code", tone: SPACE_TONE.build },
  { label: "Pictures", tone: SPACE_TONE.images },
  { label: "Video", tone: SPACE_TONE.video },
];

/** One assistant over many models (ADR 0215), drawn: a question goes to Farbaek AI, and on to the model for the job. */
function Routing() {
  return (
    <div className="relative mx-auto aspect-[480/264] w-full max-w-[30rem]" role="img" aria-label="A question goes to Farbaek AI, which sends it to the model for the job: writing, code, pictures or video.">
      <svg viewBox="0 0 480 264" className="routing absolute inset-0 size-full" aria-hidden>
        <g fill="none" strokeWidth="1.75" strokeLinecap="round">
          <path d="M118 132 H178" stroke="var(--color-line-strong)" />
          {MODELS.map((m, i) => (
            <path key={m.label} d={`M262 132 C 300 132, 312 ${42 + i * 60}, 352 ${42 + i * 60}`} stroke={m.tone} className="routing-live" style={{ animationDelay: `${i * 90}ms` }} pathLength={1} />
          ))}
        </g>
      </svg>
      <span aria-hidden className="absolute left-0 top-1/2 flex h-[15%] w-[24.5%] -translate-y-1/2 items-center justify-center rounded-full border border-line bg-surface text-xs text-ink-2 shadow-e1">
        You ask
      </span>
      <span aria-hidden className="absolute left-[37.1%] top-1/2 flex h-[25%] w-[17.5%] -translate-y-1/2 items-center justify-center rounded-full border border-line bg-surface shadow-e2">
        <BrandLogo height={34} />
      </span>
      {MODELS.map((m, i) => (
        <span
          key={m.label}
          aria-hidden
          className="absolute right-0 flex h-[14%] w-[26%] -translate-y-1/2 items-center justify-center rounded-full border text-xs font-medium"
          style={{ top: `${((42 + i * 60) / 264) * 100}%`, color: m.tone, borderColor: `color-mix(in oklab, ${m.tone} 35%, var(--color-surface))`, background: `color-mix(in oklab, ${m.tone} 8%, var(--color-surface))` }}
        >
          {m.label}
        </span>
      ))}
    </div>
  );
}

/** One band, not three cards: what Farbaek AI is, beside how a question finds its model. */
export function IntelligenceSection() {
  return (
    <section aria-labelledby="intelligence-title" className="py-10 sm:py-24 lg:py-32">
      <Container>
        <div className="mx-auto grid max-w-[72rem] items-center gap-6 rounded-[1.5rem] bg-canvas-2 px-5 py-7 sm:gap-10 sm:rounded-lg sm:px-10 sm:py-14 lg:grid-cols-2 lg:gap-16 lg:px-14">
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
    <section aria-label="Also in Farbaek" className="pb-10 sm:pb-24">
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
