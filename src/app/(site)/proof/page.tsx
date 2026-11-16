import { ArrowRightIcon, FileMagnifyingGlassIcon, ScrollIcon, ShieldCheckIcon } from "@phosphor-icons/react/ssr";
import type { Icon } from "@phosphor-icons/react";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { ProofFilmSection } from "@/components/films/film-sections";
import { AnchorLayout } from "@/components/marketing/anchor-layout";
import { DemoSection } from "@/components/marketing/demo-section";
import { EvidenceSection } from "@/components/marketing/evidence-section";
import { OtherSpaces } from "@/components/marketing/other-spaces";
import { StatusSection } from "@/components/marketing/status-section";
import { Reveal } from "@/components/motion/reveal";
import { ProofPackSeal } from "@/components/proof/proofpack-seal";
import { Container } from "@/components/ui/container";
import { LEAD, PART_TITLE, PUBLIC_TITLE } from "@/components/ui/titles";
import { buildSampleProofPack } from "@/content/samples";
import { canonicalHash } from "@/core/trust/canonical-json";

export const metadata: Metadata = {
  title: "Proof and approvals",
  description:
    "In Farbaek, a change that waits for you is approved exactly as you saw it, checked by tests that really ran, and recorded in a ProofPack anyone can verify. See what works today, and what doesn't yet.",
  alternates: { canonical: "/proof" },
};

function Later({ children }: { children: ReactNode }) {
  return <div className="home-later">{children}</div>;
}

const DEEPER: { icon: Icon; title: string; body: string; href: string }[] = [
  { icon: ShieldCheckIcon, title: "Security tests", body: "The attack scenarios Farbaek runs against itself, and what the latest run found.", href: "/security" },
  { icon: FileMagnifyingGlassIcon, title: "Check a ProofPack", body: "Drop in a ProofPack and check its record in your browser. Nothing is uploaded.", href: "/verify" },
  { icon: ScrollIcon, title: "The ProofPack format", body: "The open format, field by field, so anyone can read or check one without Farbaek.", href: "/proofpack/v1" },
];

/**
 * Proof, the space that holds everything else to account (ADR 0214): the Seal leads, then the film, the approval demo,
 * the ProofPack, and what works today.
 */
export default async function ProofPage() {
  const digest = await canonicalHash(await buildSampleProofPack());
  return (
    <>
      <AnchorLayout />
      <section aria-labelledby="proof-title" className="relative overflow-hidden">
        <div aria-hidden className="dot-grid pointer-events-none absolute inset-0" />
        <Container className="relative grid items-center gap-10 pb-12 pt-10 sm:pb-16 sm:pt-16 lg:grid-cols-12 lg:gap-6 lg:py-20">
          <Reveal className="lg:col-span-7">
            <h1 id="proof-title" className={`max-w-[14ch] ${PUBLIC_TITLE}`}>
              Proof, not promises.
            </h1>
            <p className={`mt-5 max-w-[36rem] text-ink-2 sm:mt-6 ${LEAD}`}>
              A change that waits for you is approved exactly as you saw it, checked by tests that really ran, and recorded in a ProofPack anyone can verify. You decide which changes wait. And this page says plainly what isn&apos;t proven yet.
            </p>
            <p className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
              <Link href="#demo" className="inline-flex min-h-11 items-center gap-1.5 font-medium text-ink-2 hover:text-ink">
                Try an approval <ArrowRightIcon size={14} weight="bold" aria-hidden />
              </Link>
              <Link href="#status" className="inline-flex min-h-11 items-center gap-1.5 font-medium text-ink-2 hover:text-ink">
                What works today <ArrowRightIcon size={14} weight="bold" aria-hidden />
              </Link>
            </p>
          </Reveal>
          <Reveal className="flex justify-center lg:col-span-5" delay={0.1}>
            <div className="relative">
              <div
                aria-hidden
                className="pointer-events-none absolute inset-[-30%]"
                style={{ background: "radial-gradient(closest-side, color-mix(in oklab, var(--color-accent) 10%, transparent), transparent)" }}
              />
              <ProofPackSeal hash={digest} caption="Sample ProofPack" className="relative w-60 sm:w-72" idSuffix="-proof-hero" />
            </div>
          </Reveal>
        </Container>
      </section>
      <Later>
        <ProofFilmSection />
      </Later>
      <Later>
        <DemoSection />
      </Later>
      <Later>
        <EvidenceSection />
      </Later>
      <Later>
        <StatusSection />
      </Later>
      <section aria-labelledby="deeper-title" className="pb-14 sm:pb-20 lg:pb-28">
        <Container>
          <h2 id="deeper-title" className={PART_TITLE}>
            Go deeper
          </h2>
          <ul className="mt-6 grid gap-3 sm:mt-8 sm:grid-cols-3 sm:gap-4">
            {DEEPER.map(({ icon: DeepIcon, title, body, href }) => (
              <li key={href}>
                <Link href={href} className="group flex h-full flex-col rounded-md border border-line bg-surface p-5 shadow-e1 transition-[transform,box-shadow] duration-300 hover:-translate-y-0.5 hover:shadow-e2">
                  <span className="flex size-10 items-center justify-center rounded-full bg-canvas-2 text-ink-2 ring-1 ring-line">
                    <DeepIcon size={20} aria-hidden />
                  </span>
                  <span className="mt-4 text-title-4 font-medium tracking-[-0.01em] text-ink">{title}</span>
                  <span className="mt-1.5 text-sm leading-relaxed text-ink-2">{body}</span>
                  <span className="mt-auto inline-flex items-center gap-1.5 pt-4 text-sm font-medium text-accent">
                    Open <ArrowRightIcon size={14} weight="bold" aria-hidden className="transition-transform duration-200 group-hover:translate-x-0.5" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Container>
      </section>
      <OtherSpaces current="proof" />
    </>
  );
}
