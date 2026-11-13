import { ArrowRightIcon } from "@phosphor-icons/react/ssr";
import Link from "next/link";
import { Reveal } from "@/components/motion/reveal";
import { HeroWord } from "@/components/marketing/hero-word";
import { PromptComposer } from "@/components/build/prompt-composer";
import { HeroVisual } from "@/components/three/hero-visual";
import { Container } from "@/components/ui/container";

export function Hero() {
  return (
    <section aria-labelledby="hero-title" className="relative overflow-hidden">
      <div aria-hidden className="dot-grid pointer-events-none absolute inset-0" />
      <Container className="relative grid items-center gap-8 pb-16 pt-10 sm:pt-14 lg:min-h-[calc(100dvh-4rem)] lg:grid-cols-12 lg:gap-6 lg:py-12">
        <Reveal className="relative z-10 lg:col-span-7">
          <h1
            id="hero-title"
            className="max-w-[12ch] text-balance text-[2.9rem] font-medium leading-[1.02] tracking-[-0.045em] sm:text-[4.2rem] lg:text-[5.2rem]"
          >
            {/* "Vibe coding" leads: it's what people search for. "Verified" is what Farbaek adds (stage 186). */}
            <span className="sr-only">Vibe coding for verified software, websites and apps.</span>
            <span aria-hidden>Vibe coding for verified </span>
            <HeroWord />
          </h1>
          <p className="mt-6 max-w-[34rem] text-lg leading-relaxed text-ink-2 sm:text-xl">
            Describe the app or website you want. Farbaek&apos;s AI agent plans and builds it, runs the real checks, and waits for your approval before anything ships.
          </p>
          <div className="aurora mt-8 max-w-[36rem]">
            <PromptComposer mode="public" size="compact" />
          </div>
          <p className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
            <Link href="#film" className="inline-flex min-h-11 items-center gap-1.5 font-medium text-ink-2 hover:text-ink">
              Watch a build <ArrowRightIcon size={14} weight="bold" aria-hidden />
            </Link>
            <Link href="/pricing" className="inline-flex min-h-11 items-center gap-1.5 font-medium text-ink-2 hover:text-ink">
              See pricing <ArrowRightIcon size={14} weight="bold" aria-hidden />
            </Link>
          </p>
          <Link href="#status" className="inline-flex min-h-11 items-center text-sm text-ink-3 underline-offset-4 hover:text-ink-2 hover:underline">
            See what works today
          </Link>
        </Reveal>

        <Reveal className="lg:col-span-5" delay={0.1}>
          <HeroVisual />
        </Reveal>
      </Container>
    </section>
  );
}
