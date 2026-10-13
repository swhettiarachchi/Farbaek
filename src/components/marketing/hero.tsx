import { ArrowRightIcon } from "@phosphor-icons/react/ssr";
import Link from "next/link";
import { Reveal } from "@/components/motion/reveal";
import { HeroVisual } from "@/components/three/hero-visual";
import { ButtonLink } from "@/components/ui/button";
import { Container } from "@/components/ui/container";

export function Hero() {
  return (
    <section aria-labelledby="hero-title" className="relative overflow-hidden">
      <div aria-hidden className="dot-grid pointer-events-none absolute inset-0" />
      <Container className="relative grid items-center gap-8 pb-16 pt-10 sm:pt-14 lg:min-h-[calc(100dvh-4rem)] lg:grid-cols-12 lg:gap-6 lg:py-12">
        <Reveal className="relative z-10 lg:col-span-7">
          <Link
            href="#status"
            className="inline-flex items-center gap-2 rounded-full border border-line bg-surface py-1.5 pl-3 pr-2.5 text-[13px] text-ink-2 shadow-e1 transition-colors hover:text-ink"
          >
            In development. See what works today
            <ArrowRightIcon size={13} weight="bold" aria-hidden />
          </Link>
          <h1
            id="hero-title"
            className="mt-7 max-w-[12ch] text-balance text-[2.9rem] font-medium leading-[1.02] tracking-[-0.045em] sm:text-[4.2rem] lg:text-[5.2rem]"
          >
            From idea to verified software.
          </h1>
          <p className="mt-6 max-w-[34rem] text-lg leading-relaxed text-ink-2 sm:text-xl">
            Farbaek plans each change, runs the real checks, keeps the evidence and waits for your approval before anything ships.
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
            <ButtonLink href="#demo">
              Try the demo <ArrowRightIcon size={16} weight="bold" aria-hidden />
            </ButtonLink>
            <ButtonLink href="/pricing" variant="secondary">
              See pricing
            </ButtonLink>
          </div>
        </Reveal>

        <Reveal className="lg:col-span-5" delay={0.1}>
          <HeroVisual />
        </Reveal>
      </Container>
    </section>
  );
}
