import { ArrowDownIcon, ArrowRightIcon } from "@phosphor-icons/react/ssr";
import Link from "next/link";
import { PromptComposer } from "@/components/build/prompt-composer";
import { Reveal } from "@/components/motion/reveal";
import { Container } from "@/components/ui/container";
import { HERO_TITLE, LEAD, SECTION_TITLE } from "@/components/ui/titles";
import { BuildGlimpse, ChatGlimpse, ProofGlimpse, SurveyGlimpse } from "./glimpses";
import { PlatformWindow } from "./platform-window";

/**
 * The homepage's first screen (ADR 0214): one line, the build box, and below them the platform window with a tab for
 * each space. The headline is the largest paint, in the HTML, so a phone shows it before any script runs (ADR 0052).
 */
export function Hero() {
  return (
    <section aria-labelledby="hero-title" className="relative overflow-hidden">
      {/* Engineering paper, and a pool of signal light behind the headline: gradients only (ADR 0055). */}
      <div aria-hidden className="dot-grid pointer-events-none absolute inset-0" />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[44rem]"
        style={{
          background:
            "radial-gradient(48% 46% at 50% 18%, color-mix(in oklab, var(--color-accent) 9%, transparent), color-mix(in oklab, var(--color-accent-2) 4%, transparent) 55%, transparent 78%)",
        }}
      />
      <Container className="relative pb-6 pt-10 sm:pb-10 sm:pt-16 lg:pt-20">
        <Reveal className="mx-auto flex max-w-[60rem] flex-col items-center text-center">
          <h1 id="hero-title" className={HERO_TITLE}>
            Vibe coding you can prove.
          </h1>
          <p className={`mt-5 max-w-[40rem] text-ink-2 sm:mt-6 ${LEAD}`}>
            Describe the app or website you want. Farbaek&apos;s AI agent plans it, builds it, runs the real checks and waits for your approval before anything ships.
          </p>
          <div className="aurora mt-7 w-full max-w-[40rem] text-left sm:mt-9">
            <PromptComposer mode="public" size="compact" />
          </div>
          <p className="mt-4 flex flex-wrap items-center justify-center gap-x-6 gap-y-1 text-sm">
            <Link href="#spaces" className="inline-flex min-h-11 items-center gap-1.5 font-medium text-ink-2 hover:text-ink">
              See the four spaces <ArrowDownIcon size={14} weight="bold" aria-hidden />
            </Link>
            <Link href="#film" className="inline-flex min-h-11 items-center gap-1.5 font-medium text-ink-2 hover:text-ink">
              Watch a build <ArrowRightIcon size={14} weight="bold" aria-hidden />
            </Link>
          </p>
        </Reveal>

      </Container>
    </section>
  );
}

/** Directly under the hero: the platform window, with a tab for each space. */
export function SpacesSection() {
  return (
    <section id="spaces" aria-labelledby="spaces-title" className="scroll-mt-20 pb-14 pt-10 sm:pb-20 sm:pt-14 lg:pb-28">
      <Container>
        <div className="mx-auto max-w-[68rem]">
          <div className="mx-auto mb-16 max-w-[40rem] text-center sm:mb-20">
            <h2 id="spaces-title" className={SECTION_TITLE}>
              Four spaces. One workspace.
            </h2>
            <p className={`mt-3 text-ink-2 sm:mt-4 ${LEAD}`}>
              Each part of Farbaek has a place of its own, made for its job. They share your projects, your rules and your proof.
            </p>
          </div>
          <PlatformWindow
            glimpses={{
              build: <BuildGlimpse />,
              chat: <ChatGlimpse />,
              survey: <SurveyGlimpse />,
              proof: <ProofGlimpse />,
            }}
          />
        </div>
      </Container>
    </section>
  );
}
