import { ArrowRightIcon } from "@phosphor-icons/react/ssr";
import Image from "next/image";
import { LOGO, PLATE_BACKGROUND } from "@/components/brand/brand-logo";
import { Reveal } from "@/components/motion/reveal";
import { ButtonLink } from "@/components/ui/button";
import { Container } from "@/components/ui/container";

export function Hero() {
  return (
    <section aria-labelledby="hero-title" className="relative">
      <Container className="grid items-center gap-10 pb-16 pt-10 sm:pt-14 lg:min-h-[calc(100dvh-4rem)] lg:grid-cols-12 lg:gap-8 lg:py-16">
        <Reveal className="lg:col-span-7">
          <p className="font-mono text-[13px] text-ink-3">{"// now in development"}</p>
          <h1
            id="hero-title"
            className="mt-5 max-w-[14ch] pb-1 text-[2.6rem] font-medium leading-[1.1] tracking-[-0.025em] sm:text-6xl lg:text-[4.25rem]"
          >
            From idea to <em className="font-serif font-normal tracking-[-0.01em]">verified</em> software.
          </h1>
          <p className="mt-6 max-w-[34rem] text-lg leading-relaxed text-ink-2">
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

        <Reveal className="lg:col-span-5" delay={0.08}>
          <div
            className="relative mx-auto aspect-[4/5] w-full max-w-[400px] overflow-hidden rounded-xl border border-line lg:max-w-none"
            style={{ background: PLATE_BACKGROUND }}
          >
            <span aria-hidden className="pointer-events-none absolute inset-3 rounded-[18px] border border-gold/30" />
            <Image
              src={LOGO.src}
              alt="Farbaek"
              fill
              preload
              sizes="(min-width: 1024px) 40vw, (min-width: 640px) 400px, 90vw"
              className="object-contain p-8 sm:p-10"
            />
          </div>
        </Reveal>
      </Container>
    </section>
  );
}
