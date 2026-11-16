import { ArrowRightIcon } from "@phosphor-icons/react/ssr";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { PromptComposer } from "@/components/build/prompt-composer";
import { FeatureFilmsSection } from "@/components/films/film-sections";
import { AnchorLayout } from "@/components/marketing/anchor-layout";
import { BuildToolsSection } from "@/components/marketing/build-tools";
import { OtherSpaces } from "@/components/marketing/other-spaces";
import { Reveal } from "@/components/motion/reveal";
import { ShowcaseSection } from "@/components/showcase/showcase-section";
import { HeroVisual } from "@/components/three/hero-visual";
import { Container } from "@/components/ui/container";
import { LEAD, PUBLIC_TITLE } from "@/components/ui/titles";

export const metadata: Metadata = {
  title: "Build sites and apps with an AI agent",
  description:
    "Describe the website or app you want. Farbaek's AI agent drafts a plan for you to approve, builds in the open, runs real security checks and waits for your approval before anything goes live.",
  alternates: { canonical: "/build" },
};

function Later({ children }: { children: ReactNode }) {
  return <div className="home-later">{children}</div>;
}

/**
 * Build, the space where the agent makes sites and apps (ADR 0214). Its hero keeps the Loom: the stages of a build on a
 * ring round the knight, drawn in 2D everywhere and in 3D on capable desktops (ADR 0056).
 */
export default function BuildPage() {
  return (
    <>
      <AnchorLayout />
      <section aria-labelledby="build-title" className="relative overflow-hidden">
        <div aria-hidden className="dot-grid pointer-events-none absolute inset-0" />
        <Container className="relative grid items-center gap-8 pb-12 pt-8 sm:pb-16 sm:pt-14 lg:min-h-[calc(100dvh-4rem)] lg:grid-cols-12 lg:gap-6 lg:py-12">
          <Reveal className="relative z-10 lg:col-span-7">
            <h1 id="build-title" className={`max-w-[14ch] ${PUBLIC_TITLE}`}>
              From one sentence to a site you can trust.
            </h1>
            <p className={`mt-5 max-w-[34rem] text-ink-2 sm:mt-6 ${LEAD}`}>
              Describe the app or website you want. Farbaek&apos;s agent drafts a plan for you to approve, builds in the open, runs the real checks and waits for your yes before anything goes live.
            </p>
            <div className="aurora mt-6 max-w-[36rem] sm:mt-8">
              <PromptComposer mode="public" size="compact" />
            </div>
            <p className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
              <Link href="#showcase" className="inline-flex min-h-11 items-center gap-1.5 font-medium text-ink-2 hover:text-ink">
                Start from a concept <ArrowRightIcon size={14} weight="bold" aria-hidden />
              </Link>
              <Link href="/#film" className="inline-flex min-h-11 items-center gap-1.5 font-medium text-ink-2 hover:text-ink">
                Watch a whole build <ArrowRightIcon size={14} weight="bold" aria-hidden />
              </Link>
            </p>
          </Reveal>
          <Reveal className="lg:col-span-5" delay={0.1}>
            <HeroVisual />
          </Reveal>
        </Container>
      </section>
      <Later>
        <FeatureFilmsSection />
      </Later>
      <Later>
        <ShowcaseSection />
      </Later>
      <Later>
        <BuildToolsSection />
      </Later>
      <OtherSpaces current="build" />
    </>
  );
}
