import { ArrowRightIcon, ArrowUpRightIcon, CheckSquareOffsetIcon, SealCheckIcon, ShieldCheckIcon } from "@phosphor-icons/react/ssr";
import type { Icon } from "@phosphor-icons/react";
import Link from "next/link";
import { space, spaceStart } from "@/components/site/spaces";
import { Container } from "@/components/ui/container";
import { BEZEL } from "@/components/ui/surfaces";
import { LEAD, SECTION_TITLE } from "@/components/ui/titles";
import { SectionHeading } from "./section-heading";


const SAFEGUARDS: { icon: Icon; title: string; body: string; href: string; link: string }[] = [
  {
    icon: CheckSquareOffsetIcon,
    title: "Approval that binds to the change",
    body: "Your yes covers a hash of exactly what you saw. Change one character and it no longer matches, so nothing else ships on it.",
    href: "/proof#demo",
    link: "Try it yourself",
  },
  {
    icon: ShieldCheckIcon,
    title: "Security tests in the open",
    body: "Farbaek runs attack scenarios against itself, mapped to the OWASP lists, and publishes what each run found.",
    href: "/security",
    link: "Read the latest run",
  },
  {
    icon: SealCheckIcon,
    title: "Proof anyone can check",
    body: "A ProofPack records what ran, against which files, and what it doesn't prove. Anyone can check one in a browser.",
    href: "/verify",
    link: "Check a ProofPack",
  },
];

/** The safeguards every space shares, each linking to the page that shows it working. */
export function SafeguardsSection() {
  return (
    <section aria-labelledby="safeguards-title" className="py-14 sm:py-20 lg:py-28">
      <Container>
        <div className="grid gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-16">
          <div className="lg:sticky lg:top-28 lg:self-start">
            <SectionHeading id="safeguards-title" title="Built in, not bolted on.">
              The same rules hold in every space, and they&apos;re enforced on Farbaek&apos;s servers. A prompt can&apos;t talk its way past them.
            </SectionHeading>
          </div>
          <ul className="grid gap-4">
            {SAFEGUARDS.map(({ icon: GuardIcon, title, body, href, link }) => (
              <li key={title} className="rounded-md border border-line bg-surface p-5 shadow-e1 sm:p-6">
                <span className="flex size-10 items-center justify-center rounded-full bg-canvas-2 text-ink-2 ring-1 ring-line">
                  <GuardIcon size={20} aria-hidden />
                </span>
                <h3 className="mt-4 text-title-4 font-medium tracking-[-0.01em]">{title}</h3>
                <p className="mt-1.5 max-w-[52ch] text-body leading-relaxed text-ink-2">{body}</p>
                <Link href={href} className="group mt-3 inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-accent">
                  {link}
                  <ArrowRightIcon size={14} weight="bold" aria-hidden className="transition-transform duration-200 group-hover:translate-x-0.5" />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </Container>
    </section>
  );
}

/** The last word: start with a sentence, or open any space. */
export function FinalCall() {
  return (
    <section aria-labelledby="final-title" className="pb-16 pt-6 sm:pb-24 sm:pt-10">
      <Container>
        <div className={BEZEL}>
          <div className="relative overflow-hidden rounded-md bg-surface px-5 py-12 text-center sm:px-10 sm:py-16">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0"
              style={{ background: "radial-gradient(60% 80% at 50% 110%, color-mix(in oklab, var(--color-accent) 12%, transparent), color-mix(in oklab, var(--color-accent-2) 5%, transparent) 50%, transparent 75%)" }}
            />
            <div className="relative mx-auto max-w-[36rem]">
              <h2 id="final-title" className={SECTION_TITLE}>
                Start with a question.
              </h2>
              <p className={`mt-3 text-ink-2 ${LEAD}`}>Start free, no card. Chat, the studios and the build box are in the same workspace from the first day.</p>
              <div className="mt-7 flex flex-wrap justify-center gap-2">
                <Link
                  href={spaceStart(space("chat"))}
                  className="group inline-flex h-11 items-center gap-2 rounded-full bg-primary pl-5 pr-1.5 text-sm font-medium text-on-primary shadow-e1 transition-[transform,background-color] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-primary-hover active:scale-[0.98]"
                >
                  Ask Farbaek AI
                  <span className="flex size-8 items-center justify-center rounded-full bg-on-primary/15 transition-transform duration-300 group-hover:-translate-y-px group-hover:translate-x-0.5">
                    <ArrowUpRightIcon size={16} weight="bold" aria-hidden />
                  </span>
                </Link>
                <Link
                  href={spaceStart(space("build"))}
                  className="inline-flex h-11 items-center rounded-full border border-line bg-surface px-5 text-sm font-medium text-ink transition-colors duration-200 hover:bg-surface-raised"
                >
                  Start building
                </Link>
              </div>
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
