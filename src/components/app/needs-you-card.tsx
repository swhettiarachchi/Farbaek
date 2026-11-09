import { ArrowCircleRightIcon, ArrowRightIcon, InfoIcon } from "@phosphor-icons/react/ssr";
import Link from "next/link";
import { buttonClasses } from "@/components/ui/button";
import type { NeedsYou } from "@/core/realityloop/needs-you";

/**
 * What needs this person, first thing on Home (ADR 0174), with the same words and shape as a task's next step. The line
 * above the title says whose turn it is with its icon and words (ADR 0183), so it never relies on colour. Home is an
 * everyday screen, so nothing about this animates.
 */
export function NeedsYouCard({ step }: { step: NeedsYou }) {
  const yours = step.tone === "action";
  const ToneIcon = yours ? ArrowCircleRightIcon : InfoIcon;
  return (
    <section aria-labelledby="needs-you" className="rounded-lg bg-surface-raised/60 p-2 ring-1 ring-line">
      <div className="grid gap-4 rounded-md bg-surface p-5 shadow-e1 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:p-6">
        <div className="min-w-0">
          <p className={`flex items-center gap-1.5 text-label font-medium ${yours ? "text-accent" : "text-ink-2"}`}>
            <ToneIcon size={16} weight="fill" className="shrink-0" aria-hidden /> {yours ? "Your turn" : "For your information"}
          </p>
          <h2 id="needs-you" className="mt-2 text-balance text-xl font-medium leading-snug tracking-[-0.02em]">
            {step.title}
          </h2>
          <p className="mt-1.5 line-clamp-3 max-w-[60ch] text-body leading-relaxed text-ink-2">{step.body}</p>
        </div>
        {step.action ? (
          <Link href={step.action.href} className={`${buttonClasses("primary", "md", "w-full justify-center sm:w-auto")} whitespace-nowrap`}>
            {step.action.label} <ArrowRightIcon size={16} weight="bold" aria-hidden />
          </Link>
        ) : null}
      </div>
    </section>
  );
}
