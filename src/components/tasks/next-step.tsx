import { ArrowDownIcon, ArrowRightIcon, CheckCircleIcon, CircleNotchIcon, InfoIcon, PencilSimpleLineIcon, WarningCircleIcon } from "@phosphor-icons/react/ssr";
import type { Icon } from "@phosphor-icons/react";
import Link from "next/link";
import { buttonClasses } from "@/components/ui/button";
import { JumpLink } from "@/components/ui/disclosure";
import type { NextStep, NextStepTarget, NextStepTone } from "@/core/realityloop/next-step";

// Every tone has its own icon and word: status never relies on colour alone.
const TONES: Record<NextStepTone, { icon: Icon; word: string; className: string }> = {
  action: { icon: PencilSimpleLineIcon, word: "Your turn", className: "text-accent" },
  working: { icon: CircleNotchIcon, word: "In progress", className: "text-info" },
  done: { icon: CheckCircleIcon, word: "Done", className: "text-verified" },
  problem: { icon: WarningCircleIcon, word: "Needs attention", className: "text-failed" },
  idle: { icon: InfoIcon, word: "For your information", className: "text-ink-2" },
};

const ANCHORS: Record<Exclude<NextStepTarget, "project" | "run">, string> = {
  plan: "contract",
  change: "change",
  checks: "checks",
  undo: "undo",
  fix: "fix",
  details: "details",
};

/**
 * The first thing on a task's page (ADR 0170): where it stands and the one
 * thing to do next, in plain words. A double-bezel panel, 28px around a 20px
 * card, so it reads as the page's main object.
 */
export function NextStepCard({ step, projectId, runId = null }: { step: NextStep; projectId: string; runId?: string | null }) {
  const tone = TONES[step.tone];
  const button = `${buttonClasses("primary", "md", "w-full justify-center sm:w-auto")} whitespace-nowrap`;
  return (
    <section aria-labelledby="next-step" className="rounded-lg bg-surface-raised/60 p-2 ring-1 ring-line motion-safe:animate-[usage-in_260ms_cubic-bezier(0.16,1,0.3,1)_both]">
      <div className="grid gap-4 rounded-md bg-surface p-5 shadow-e1 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:p-6">
        <div className="min-w-0">
          <p className={`flex items-center gap-1.5 text-[0.8125rem] font-medium ${tone.className}`}>
            <tone.icon size={16} weight="bold" aria-hidden className={step.tone === "working" ? "motion-safe:animate-spin" : ""} /> {tone.word}
          </p>
          <h2 id="next-step" className="mt-2 text-balance text-[1.25rem] font-medium leading-snug tracking-[-0.02em]">
            {step.title}
          </h2>
          <p className="mt-1.5 max-w-[60ch] text-[0.9375rem] leading-relaxed text-ink-2">{step.body}</p>
        </div>
        {step.action?.target === "project" || (step.action?.target === "run" && runId) ? (
          <Link href={step.action.target === "run" ? `/app/build/${runId}` : `/app/projects/${projectId}`} className={button}>
            {step.action.label} <ArrowRightIcon size={16} weight="bold" aria-hidden />
          </Link>
        ) : step.action && step.action.target !== "run" ? (
          <JumpLink target={ANCHORS[step.action.target]} className={button}>
            {step.action.label} <ArrowDownIcon size={16} weight="bold" aria-hidden />
          </JumpLink>
        ) : null}
      </div>
    </section>
  );
}
