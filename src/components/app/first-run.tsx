import { ChatCenteredTextIcon, EyeIcon, GlobeIcon, PenNibIcon } from "@phosphor-icons/react/ssr";
import type { ReactNode } from "react";
import { CoreMark } from "@/components/build/core-mark";
import { CapabilityStatusPill, capabilityRows } from "@/components/showcase/capabilities";
import { Showroom } from "@/components/showcase/showroom";
import { siteDomain } from "@/server/publish/config";

/**
 * What someone sees under the build box before they have a workspace: their
 * first screen in the apps and after signing up. How a build goes, ideas to
 * start from (the showroom hands a sentence to the build box) and what every
 * build comes with, each with its real status here. Below the first screen,
 * so each section is laid out only as it nears it (ADR 0052).
 */
export function FirstRunTour() {
  const publishes = siteDomain() !== null;
  const steps: { title: string; body: string; node: ReactNode }[] = [
    { title: "Describe it", body: "A sentence is enough: who it's for and what it should do.", node: <ChatCenteredTextIcon size={20} aria-hidden /> },
    { title: "Approve the plan", body: "Farbaek drafts a plan you can read in a minute. Change anything, then approve it.", node: <PenNibIcon size={20} aria-hidden /> },
    { title: "Watch it build", body: "The agent builds in the cloud under your plan, and you can message it while it works.", node: <CoreMark state="working" /> },
    publishes
      ? { title: "Preview and publish", body: "Try it in a live preview, then publish it to its own web address.", node: <GlobeIcon size={20} aria-hidden /> }
      : { title: "Preview and download", body: "Try it in a live preview, then download the code whenever you like.", node: <EyeIcon size={20} aria-hidden /> },
  ];
  const capabilities = capabilityRows();

  return (
    <>
      <section aria-labelledby="first-run-how" className="home-later mt-16">
        <h2 id="first-run-how" className="text-2xl font-medium tracking-[-0.03em]">
          How a build goes
        </h2>
        <div className="mt-5 rounded-lg bg-surface-raised/60 p-2 ring-1 ring-line">
          <ol className="grid gap-7 rounded-md bg-surface p-5 shadow-e1 sm:p-7">
            {steps.map((s, i) => (
              <li key={s.title} className="relative grid grid-cols-[44px_minmax(0,1fr)] items-start gap-4">
                {i < steps.length - 1 ? (
                  <>
                    {/* The thread to the next step. It fills in as it scrolls past, where the browser can tie an animation to scrolling. */}
                    <span aria-hidden className="absolute -bottom-7 left-[21px] top-11 w-px bg-line" />
                    <span aria-hidden className="first-run-thread absolute -bottom-7 left-[21px] top-11 w-px origin-top bg-accent" />
                  </>
                ) : null}
                <span className="relative flex size-11 items-center justify-center rounded-full border border-line bg-surface text-accent shadow-e1">{s.node}</span>
                <div className="pt-1">
                  <h3 className="text-[16px] font-medium tracking-[-0.01em]">{s.title}</h3>
                  <p className="mt-1 text-[14.5px] leading-relaxed text-ink-2">{s.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section aria-labelledby="first-run-ideas" className="home-later mt-16">
        <h2 id="first-run-ideas" className="text-2xl font-medium tracking-[-0.03em]">
          Start from something like these
        </h2>
        <p className="mt-2 max-w-[56ch] text-[15px] leading-relaxed text-ink-2">
          Concept mockups of the kind of thing you can ask for. Pick one, and its sentence goes into the build box for you to change.
        </p>
        <div className="mt-6">
          <Showroom />
        </div>
      </section>

      <section aria-labelledby="first-run-included" className="home-later mt-16">
        <h2 id="first-run-included" className="text-2xl font-medium tracking-[-0.03em]">
          What every build comes with
        </h2>
        {/* A row to swipe on phones (it takes focus, so it scrolls from the keyboard too), two columns on wider screens. */}
        <ul
          tabIndex={0}
          aria-labelledby="first-run-included"
          className="-mx-4 mt-5 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pb-3 [scrollbar-width:none] sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 sm:pb-0"
        >
          {capabilities.map((c) => (
            <li key={c.id} className="flex w-[80%] shrink-0 snap-start flex-col rounded-md border border-line bg-surface p-5 shadow-e1 sm:w-auto">
              <div className="flex items-start justify-between gap-3">
                <span className="flex size-10 items-center justify-center rounded-full bg-accent/[0.08] text-accent">
                  <c.icon size={20} aria-hidden />
                </span>
                <CapabilityStatusPill status={c.status} />
              </div>
              <h3 className="mt-4 text-[16px] font-medium tracking-[-0.01em]">{c.title}</h3>
              <p className="mt-1 text-[14.5px] leading-relaxed text-ink-2">{c.body}</p>
              {c.waiting ? <p className="mt-2 text-xs text-ink-3">{c.waiting}</p> : null}
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
