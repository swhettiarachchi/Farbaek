"use client";

import { MoonIcon, RocketLaunchIcon, SunIcon, WarningCircleIcon } from "@phosphor-icons/react";
import Link from "next/link";
import { useActionState, useId, useState } from "react";
import { approveAndBuildAction, type ApproveBuildState } from "@/app/app/new/actions";
import { EffortPicker } from "@/components/app/effort-picker";
import { WebPurchaseOnly } from "@/components/billing/web-purchase-only";
import { buttonClasses } from "@/components/ui/button";
import { CAP_CHOICES, CAP_LABELS, type CapChoice } from "@/core/agent/run-cap";
import type { Effort } from "@/core/agent/routing";
import type { SiteTheme } from "@/core/media/studio-kit";
import type { RunEstimates } from "@/server/workspace/plan-card-data";

const IDLE: ApproveBuildState = { status: "idle" };

/**
 * Approves this exact plan version and starts the agent. The estimate follows
 * the effort; the wallet still meters each step at its real cost.
 */
export function ApproveBuild({
  taskId,
  version,
  expectedTaskVersion,
  sha256,
  estimates,
  disabledReason,
  skills,
  suggested,
  projectSkills,
  heldSkills = [],
  skillsHref,
  kitPro = false,
  defaultCap = "double",
  firstBuildNote = null,
  defaultTheme = "light",
}: {
  taskId: string;
  version: number;
  expectedTaskVersion: number;
  sha256: string;
  estimates: RunEstimates;
  disabledReason: string | null;
  /** Built-in skills to choose from (ADR 0030). */
  skills: { id: string; label: string; description: string }[];
  /** Skills that fit this plan, chosen to begin with. */
  suggested: string[];
  /** The project's own skills in their approved version, which always apply. */
  projectSkills: string[];
  /** The project's skills that are new or changed since approval, which wait for a review (ADR 0043). */
  heldSkills?: string[];
  /** Where the project's skills are reviewed. */
  skillsHref?: string;
  /** Whether the workspace's plan includes Studio kit Pro (ADR 0157). */
  kitPro?: boolean;
  /** The run cap chosen to begin with: none for a first build or a design upgrade, so it isn't cut off halfway (ADR 0158). */
  defaultCap?: CapChoice;
  /** Said when a first build on Free is written by a stronger model. */
  firstBuildNote?: string | null;
  /** The colour theme offered first: light, unless the person asked for dark (ADR 0158). Never dark by default. */
  defaultTheme?: SiteTheme;
}) {
  const [state, action, pending] = useActionState(approveAndBuildAction, IDLE);
  const [effort, setEffort] = useState<Effort>("balanced");
  const [cap, setCap] = useState<CapChoice>(defaultCap);
  const [theme, setTheme] = useState<SiteTheme>(defaultTheme);
  const capId = useId();
  const estimate = estimates[effort];

  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="taskId" value={taskId} />
      <input type="hidden" name="version" value={version} />
      <input type="hidden" name="expectedTaskVersion" value={expectedTaskVersion} />
      <input type="hidden" name="sha256" value={sha256} />
      <fieldset className="grid gap-2" disabled={pending || Boolean(disabledReason)}>
        <legend className="mb-1 text-sm font-medium">Skills for this build</legend>
        <div className="flex flex-wrap gap-2">
          {skills.map((s) => (
            <label
              key={s.id}
              title={s.description}
              className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border border-line bg-surface px-4 text-sm text-ink-2 transition-colors duration-150 has-checked:border-accent has-checked:bg-accent/[0.06] has-checked:text-ink has-focus-visible:outline-2 has-focus-visible:outline-accent"
            >
              <input type="checkbox" name="skills" value={s.id} defaultChecked={suggested.includes(s.id)} className="size-4 accent-[var(--color-accent)]" />
              {s.label}
            </label>
          ))}
        </div>
        <p className="text-xs leading-relaxed text-ink-3">
          Every build follows the Farbaek Studio standard. Skills go deeper on what this one needs;{" "}
          {suggested.length
            ? `motion, 3D and brand identity are on for anything people will see${suggested.includes("flagship-site-craft") ? ", flagship site craft for this website" : ""}, and the others that fit your plan are chosen.`
            : "none stood out for this plan, so tick any that fit."}
          {projectSkills.length ? ` This project's own skills apply too: ${projectSkills.join(", ")}.` : ""}
        </p>
        <p className="text-xs leading-relaxed text-ink-3">
          {kitPro ? (
            "Sites build on the Farbaek Studio kit with Studio kit Pro: story chapters, carousels, a turning product view, magnetic motion and more looks."
          ) : (
            <>
              Sites build on the Farbaek Studio kit. Paid plans add Studio kit Pro: story chapters, carousels, a turning product view, magnetic motion and more looks.{" "}
              <WebPurchaseOnly fallback={null}>
                <Link href="/app/billing" className="font-medium underline underline-offset-2 hover:text-ink">
                  See plans
                </Link>
              </WebPurchaseOnly>
            </>
          )}
        </p>
        {heldSkills.length ? (
          <p className="flex items-start gap-2 text-xs leading-relaxed text-approval">
            <WarningCircleIcon size={14} className="mt-px shrink-0" aria-hidden />
            <span>
              {heldSkills.length === 1 ? "1 skill is" : `${heldSkills.length} skills are`} waiting for review and won&apos;t apply: {heldSkills.join(", ")}.{" "}
              {skillsHref ? (
                <Link href={skillsHref} className="font-medium underline underline-offset-2 hover:text-ink">
                  Review on the project page
                </Link>
              ) : null}
            </span>
          </p>
        ) : null}
      </fieldset>
      <fieldset className="grid min-w-0 gap-1.5" disabled={pending || Boolean(disabledReason)}>
        <legend className="mb-1 text-sm font-medium">Colour theme for the site</legend>
        <div className="inline-flex w-full rounded-full border border-line bg-surface p-1 shadow-e1 sm:w-auto">
          {(
            [
              ["light", "Light", SunIcon],
              ["dark", "Dark", MoonIcon],
            ] as const
          ).map(([value, label, Icon]) => (
            <label key={value} className="relative flex-1 sm:flex-none">
              <input type="radio" name="theme" value={value} checked={theme === value} onChange={() => setTheme(value)} className="peer sr-only" />
              <span className="flex min-h-11 cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-full px-4 text-sm text-ink-2 transition-colors duration-[160ms] peer-checked:bg-primary peer-checked:font-medium peer-checked:text-on-primary peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent peer-disabled:cursor-not-allowed peer-disabled:opacity-50 sm:px-5">
                <Icon size={16} aria-hidden />
                {label}
              </span>
            </label>
          ))}
        </div>
        <p className="text-xs leading-relaxed text-ink-3">{theme === "light" ? "Light surfaces with dark text. An existing dark site is switched to light." : "Dark surfaces with light text. An existing light site is switched to dark."}</p>
      </fieldset>
      <EffortPicker value={effort} onChange={setEffort} disabled={pending || Boolean(disabledReason)} />
      {firstBuildNote ? <p className="text-xs leading-relaxed text-ink-3">{firstBuildNote}</p> : null}
      <p className="text-sm text-ink-2" aria-live="polite">
        {estimate ? (
          <>
            Likely to use <span className="font-medium text-ink tabular">{estimate.low === estimate.high ? `about ${estimate.low}%` : `${estimate.low} to ${estimate.high}%`}</span> of this
            period&apos;s AI usage. Steps that fail are refunded.
          </>
        ) : (
          "Each step is metered from your AI usage at its real cost, and steps that fail are refunded."
        )}
      </p>
      {estimate ? (
        <fieldset className="grid min-w-0 gap-1.5" disabled={pending || Boolean(disabledReason)}>
          <legend className="mb-1 text-sm font-medium">Stop the run at</legend>
          <div className="inline-flex w-full rounded-full border border-line bg-surface p-1 shadow-e1 sm:w-auto">
            {CAP_CHOICES.map((c) => (
              <label key={c} className="relative flex-1 sm:flex-none">
                <input type="radio" name="cap" value={c} checked={cap === c} onChange={() => setCap(c)} aria-describedby={`${capId}-detail`} className="peer sr-only" />
                <span className="flex min-h-11 cursor-pointer items-center justify-center whitespace-nowrap rounded-full px-3 text-sm text-ink-2 transition-colors duration-[160ms] peer-checked:bg-primary peer-checked:font-medium peer-checked:text-on-primary peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent peer-disabled:cursor-not-allowed peer-disabled:opacity-50 sm:px-4">
                  {CAP_LABELS[c].title}
                </span>
              </label>
            ))}
          </div>
          <p id={`${capId}-detail`} className="text-xs leading-relaxed text-ink-3">
            {CAP_LABELS[cap].detail(estimate.high)}
            {cap !== "plan" ? " It never goes past the cap: a step that would go over it is stopped before it starts, and the work so far is kept for your review." : ""}
          </p>
        </fieldset>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending || Boolean(disabledReason)} className={buttonClasses("primary")}>
          <RocketLaunchIcon size={18} weight="bold" aria-hidden />
          {pending ? "Approving and starting…" : "Approve and build"}
        </button>
        <Link href={`/app/tasks/${taskId}`} className={buttonClasses("secondary")}>
          Edit the plan
        </Link>
      </div>
      {disabledReason ? <p className="text-sm text-ink-3">{disabledReason}</p> : null}
      {state.status === "error" ? (
        <p role="alert" className="flex items-start gap-2 text-sm text-failed">
          <WarningCircleIcon size={16} className="mt-0.5 shrink-0" aria-hidden />
          <span>
            {state.message}
            {state.approved ? (
              <>
                {" "}
                <Link href="/app/build" className="font-medium underline">
                  Open Build
                </Link>
              </>
            ) : null}
          </span>
        </p>
      ) : null}
    </form>
  );
}
