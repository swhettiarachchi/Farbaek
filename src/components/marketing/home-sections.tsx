import { ArrowRightIcon, ArrowUpRightIcon, CheckSquareOffsetIcon, FilePdfIcon, SealCheckIcon, ShieldCheckIcon } from "@phosphor-icons/react/ssr";
import type { Icon } from "@phosphor-icons/react";
import Link from "next/link";
import type { ReactNode } from "react";
import { SPACES, spaceStart, type Space } from "@/components/site/spaces";
import { Container } from "@/components/ui/container";
import { BEZEL } from "@/components/ui/surfaces";
import { LEAD, SECTION_TITLE } from "@/components/ui/titles";
import { SectionHeading } from "./section-heading";

const space = (id: Space["id"]) => SPACES.find((s) => s.id === id)!;

/* The jobs, each drawn as a small piece of its space: blocks and lines in tokens, never a picture of a real product. */

function SiteArt() {
  return (
    <div className="grid w-[78%] gap-2.5 rounded-sm border border-line bg-surface p-3.5 shadow-e2">
      <span className="h-1.5 w-1/3 rounded-full bg-line-strong" />
      <span className="h-3 w-3/4 rounded-full bg-ink/80" />
      <span className="h-3 w-1/2 rounded-full bg-ink/80" />
      <span className="mt-1 h-6 w-20 rounded-full bg-primary" />
    </div>
  );
}

function FileArt() {
  return (
    <div className="grid w-[82%] justify-items-end gap-2">
      <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1.5 text-xs text-ink-2 shadow-e1">
        <FilePdfIcon size={14} weight="bold" aria-hidden className="text-ink-3" />
        Report, PDF
      </span>
      <span className="h-9 w-3/4 rounded-[1rem] rounded-br-md bg-surface shadow-e1" />
      <span className="h-14 w-full justify-self-start rounded-[1rem] rounded-bl-md border border-line bg-surface/70" />
    </div>
  );
}

function PlotArt() {
  return (
    <svg viewBox="0 0 160 110" className="h-auto w-[70%]" aria-hidden>
      <path d="M22 86 L40 18 L118 12 L142 70 L84 98 Z" fill="color-mix(in oklab, var(--color-accent) 7%, var(--color-surface))" stroke="var(--color-ink)" strokeWidth="1.4" />
      <path d="M40 18 L84 98" stroke="var(--color-ink-3)" strokeWidth="1" strokeDasharray="3 3" />
      {[
        [22, 86],
        [40, 18],
        [118, 12],
        [142, 70],
        [84, 98],
      ].map(([x, y]) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r="3.2" fill="var(--color-surface)" stroke="var(--color-accent)" strokeWidth="1.6" />
      ))}
    </svg>
  );
}

function DiffArt() {
  return (
    <div className="grid w-[82%] gap-1 rounded-sm border border-line bg-surface p-3 shadow-e2">
      <span className="h-2 rounded-full w-2/3 bg-line-strong" />
      <span className="h-2 rounded-full w-3/4" style={{ background: "color-mix(in oklab, var(--color-failed) 30%, var(--color-surface))" }} />
      <span className="h-2 rounded-full w-5/6" style={{ background: "color-mix(in oklab, var(--color-verified) 34%, var(--color-surface))" }} />
      <span className="h-2 rounded-full w-1/2" style={{ background: "color-mix(in oklab, var(--color-verified) 34%, var(--color-surface))" }} />
      <span className="h-2 rounded-full w-2/5 bg-line-strong" />
    </div>
  );
}

function CodeArt() {
  return (
    <div className="grid w-[82%] gap-1.5 rounded-sm bg-media p-3.5 shadow-e2">
      {[
        ["w-1/4", "w-1/3"],
        ["w-1/6", "w-1/2"],
        ["w-1/3", "w-1/4"],
        ["w-1/5", "w-2/5"],
      ].map(([a, b], i) => (
        <span key={i} className="flex gap-1.5" style={{ paddingLeft: `${(i % 2) * 12}px` }}>
          <span className={`h-2 rounded-full bg-media-cyan/80 ${a}`} />
          <span className={`h-2 rounded-full bg-media-ink-3/70 ${b}`} />
        </span>
      ))}
    </div>
  );
}

function SealArt() {
  return (
    <div className="flex items-center gap-3 rounded-full border border-line bg-surface py-2 pl-2 pr-4 shadow-e2">
      <span className="flex size-9 items-center justify-center rounded-full bg-verified/12 text-verified">
        <SealCheckIcon size={20} weight="fill" aria-hidden />
      </span>
      <span className="grid gap-1.5">
        <span className="h-2 rounded-full w-28 bg-ink/70" />
        <span className="h-2 rounded-full w-16 bg-line-strong" />
      </span>
    </div>
  );
}

const JOBS: { space: Space["id"]; title: string; body: string; art: ReactNode }[] = [
  { space: "build", title: "A website for your shop", body: "Say what you sell and how it should feel. Approve the plan, watch it built, and publish once the check is clean.", art: <SiteArt /> },
  { space: "chat", title: "Questions about a long document", body: "Add a PDF and ask what it says, in plain words. Your chats are private to you.", art: <FileArt /> },
  { space: "survey", title: "A land plan from a field book", body: "Type the bearings and distances, see how the traverse closes, and print the sheet at true scale.", art: <PlotArt /> },
  { space: "build", title: "A change to a site you already have", body: "Bring a project from GitHub and ask for the change. Every edit is shown line by line before it lands.", art: <DiffArt /> },
  { space: "chat", title: "Code, explained or written", body: "Paste code and ask what it does, or ask for it. Code comes back tinted and ready to copy.", art: <CodeArt /> },
  { space: "proof", title: "A change you can sign off", body: "Your approval covers exactly the change you saw, and the ProofPack keeps the record.", art: <SealArt /> },
];

/** What people come to do, each tagged with its space. A swipeable rail on phones, a grid from tablets up. */
export function JobsSection() {
  return (
    <section aria-labelledby="jobs-title" className="py-14 sm:py-20 lg:py-28">
      <Container>
        <SectionHeading id="jobs-title" title="Start with something you need.">
          A few of the jobs people bring to Farbaek, and the space each one starts in.
        </SectionHeading>
        <ul className="-mx-4 mt-10 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none] sm:mx-0 sm:mt-12 sm:grid sm:grid-cols-2 sm:gap-4 sm:overflow-visible sm:px-0 sm:pb-0 lg:grid-cols-3">
          {JOBS.map((job) => {
            const s = space(job.space);
            const SpaceIcon = s.icon;
            return (
              <li key={job.title} className="w-[82%] shrink-0 snap-start sm:w-auto">
                <Link
                  href={s.page}
                  className="group flex h-full flex-col overflow-hidden rounded-md border border-line bg-surface shadow-e1 transition-[transform,box-shadow] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-0.5 hover:shadow-e2"
                >
                  <div
                    aria-hidden
                    className="flex h-40 items-center justify-center border-b border-line transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] sm:h-44"
                    style={{ background: "radial-gradient(80% 90% at 50% 100%, color-mix(in oklab, var(--color-accent) 7%, var(--color-canvas-2)), var(--color-canvas-2))" }}
                  >
                    <div className="flex w-full justify-center transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:-translate-y-1">{job.art}</div>
                  </div>
                  <div className="flex flex-1 flex-col p-5">
                    <span className="inline-flex items-center gap-1.5 text-sm text-ink-3">
                      <SpaceIcon size={16} weight="bold" aria-hidden />
                      {s.name}
                    </span>
                    <h3 className="mt-2 text-title-4 font-medium tracking-[-0.01em] text-ink">{job.title}</h3>
                    <p className="mt-1.5 text-sm leading-relaxed text-ink-2">{job.body}</p>
                    <span className="mt-auto inline-flex items-center gap-1.5 pt-4 text-sm font-medium text-accent">
                      Explore {s.name}
                      <ArrowRightIcon size={14} weight="bold" aria-hidden className="transition-transform duration-200 group-hover:translate-x-0.5" />
                    </span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      </Container>
    </section>
  );
}

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
                Start with one sentence.
              </h2>
              <p className={`mt-3 text-ink-2 ${LEAD}`}>Start free, no card. Every space is in the same workspace from the first day.</p>
              <div className="mt-7 flex flex-wrap justify-center gap-2">
                <Link
                  href={spaceStart(space("build"))}
                  className="group inline-flex h-11 items-center gap-2 rounded-full bg-primary pl-5 pr-1.5 text-sm font-medium text-on-primary shadow-e1 transition-[transform,background-color] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-primary-hover active:scale-[0.98]"
                >
                  Start building
                  <span className="flex size-8 items-center justify-center rounded-full bg-on-primary/15 transition-transform duration-300 group-hover:-translate-y-px group-hover:translate-x-0.5">
                    <ArrowUpRightIcon size={16} weight="bold" aria-hidden />
                  </span>
                </Link>
                <Link
                  href={spaceStart(space("chat"))}
                  className="inline-flex h-11 items-center rounded-full border border-line bg-surface px-5 text-sm font-medium text-ink transition-colors duration-200 hover:bg-surface-raised"
                >
                  Open Chat
                </Link>
              </div>
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
