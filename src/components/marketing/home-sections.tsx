import { ArrowRightIcon, CheckIcon, SealCheckIcon, ShieldCheckIcon } from "@phosphor-icons/react/ssr";
import Link from "next/link";
import { Container } from "@/components/ui/container";
import { LEAD, SECTION_TITLE } from "@/components/ui/titles";
import { HomeAsk } from "./home-ask";
import { HomeRail } from "./home-rail";

/** ChatGPT's "for work, life and everything in between", for Farbaek: a centred title over the rail of jobs. */
export function RailSection() {
  return (
    <section aria-labelledby="rail-title" className="py-16 sm:py-24 lg:py-32">
      <Container>
        <div className="mx-auto max-w-[40rem] text-center">
          <h2 id="rail-title" className={SECTION_TITLE}>
            For everything you make, and everything you ask.
          </h2>
        </div>
      </Container>
      <div className="mt-10 sm:mt-12">
        <HomeRail />
      </div>
    </section>
  );
}

const DarkLink = ({ href, children }: { href: string; children: string }) => (
  <Link href={href} className="tap mt-auto inline-flex h-10 items-center gap-1.5 self-start rounded-full bg-primary px-4 text-sm font-medium text-on-primary transition-colors duration-200 hover:bg-primary-hover">
    {children}
  </Link>
);

/** The safeguards every space shares, after ChatGPT's "Designed to keep you safe": hairline cards, a dark pill each. */
export function SafeguardsSection() {
  return (
    <section aria-labelledby="safeguards-title" className="pb-16 sm:pb-24 lg:pb-32">
      <Container>
        <div className="mx-auto max-w-[40rem] text-center">
          <h2 id="safeguards-title" className={SECTION_TITLE}>
            Built in, not bolted on.
          </h2>
          <p className={`mt-3 text-ink-2 sm:mt-4 ${LEAD}`}>The same rules hold in every space, enforced on Farbaek&apos;s servers. A prompt can&apos;t talk its way past them.</p>
        </div>
        <div className="mx-auto mt-10 grid max-w-[64rem] gap-4 sm:mt-12 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
          <div className="flex flex-col rounded-md border border-line bg-surface p-5 sm:p-7 lg:row-span-2">
            <h3 className="text-title-4 font-medium tracking-[-0.02em]">Approval that binds to the change</h3>
            <p className="mt-2 max-w-[44ch] text-sm leading-relaxed text-ink-2">Your yes covers a hash of exactly what you saw. Change one character and it no longer matches, so nothing else ships on it.</p>
            <div aria-hidden className="my-6 flex flex-1 flex-col justify-center rounded-md bg-canvas-2 p-4">
              <p className="text-xs text-ink-3">content/menu.json</p>
              <div className="mt-2 grid gap-1 font-mono text-xs leading-relaxed">
                <span className="rounded-sm px-2" style={{ background: "color-mix(in oklab, var(--color-failed) 10%, transparent)" }}>
                  - &quot;sourdough&quot;: &quot;Rs 950&quot;
                </span>
                <span className="rounded-sm px-2" style={{ background: "color-mix(in oklab, var(--color-verified) 12%, transparent)" }}>
                  + &quot;sourdough&quot;: &quot;Rs 900&quot;
                </span>
              </div>
              <span className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-ink">
                <CheckIcon size={14} weight="bold" className="text-verified" />
                Approved exactly as shown
              </span>
            </div>
            <DarkLink href="/proof#demo">Try it yourself</DarkLink>
          </div>
          <div className="flex flex-col rounded-md border border-line bg-surface p-5 sm:p-7">
            <h3 className="flex items-center gap-2 text-title-4 font-medium tracking-[-0.02em]">
              <ShieldCheckIcon size={20} aria-hidden className="text-ink-3" />
              Security tests in the open
            </h3>
            <p className="mb-5 mt-2 text-sm leading-relaxed text-ink-2">Farbaek runs attack scenarios against itself and publishes what each run found.</p>
            <DarkLink href="/security">Read the latest run</DarkLink>
          </div>
          <div className="flex flex-col rounded-md border border-line bg-surface p-5 sm:p-7">
            <h3 className="flex items-center gap-2 text-title-4 font-medium tracking-[-0.02em]">
              <SealCheckIcon size={20} aria-hidden className="text-ink-3" />
              Proof anyone can check
            </h3>
            <p className="mb-5 mt-2 text-sm leading-relaxed text-ink-2">A ProofPack records what ran, against which files, and what it doesn&apos;t prove. Check one in your browser.</p>
            <DarkLink href="/verify">Check a ProofPack</DarkLink>
          </div>
        </div>
      </Container>
    </section>
  );
}

/** Pricing as one flat band, after ChatGPT's: a title and a sentence on the left, one dark pill on the right. */
export function PricingBand() {
  return (
    <section aria-labelledby="pricing-band-title" className="pb-16 sm:pb-24">
      <Container>
        <div className="mx-auto flex max-w-[64rem] flex-col gap-5 rounded-lg bg-canvas-2 px-5 py-8 sm:flex-row sm:items-center sm:justify-between sm:px-12 sm:py-12">
          <div>
            <h2 id="pricing-band-title" className="text-[1.625rem] font-medium leading-tight tracking-[-0.03em] sm:text-[2rem]">
              Plans and pricing
            </h2>
            <p className="mt-2 max-w-[38rem] text-body leading-relaxed text-ink-2">Start free, no card. Paid plans add more AI usage, stronger models and more people in your workspace.</p>
          </div>
          <Link href="/pricing" className="group inline-flex h-11 shrink-0 items-center gap-1.5 self-start rounded-full bg-primary px-5 text-sm font-medium text-on-primary transition-colors duration-200 hover:bg-primary-hover sm:self-auto">
            See the plans
            <ArrowRightIcon size={14} weight="bold" aria-hidden className="transition-transform duration-200 group-hover:translate-x-0.5" />
          </Link>
        </div>
      </Container>
    </section>
  );
}

/** The last word, after Claude's: not sure where to start? Ask. */
export function FinalCall() {
  return (
    <section aria-labelledby="final-title" className="pb-16 pt-16 sm:pb-28 sm:pt-24">
      <Container>
        <div className="mx-auto flex max-w-[38rem] flex-col items-center text-center">
          <h2 id="final-title" className={SECTION_TITLE}>
            Not sure where to start? Ask Farbaek AI.
          </h2>
          <p className={`mt-3 text-ink-2 ${LEAD}`}>Start free, no card. Chat, the studios and the build box are in your workspace from the first day.</p>
          <div className="mt-8 w-full">
            <HomeAsk id="home-ask-last" starters={false} />
          </div>
        </div>
      </Container>
    </section>
  );
}
