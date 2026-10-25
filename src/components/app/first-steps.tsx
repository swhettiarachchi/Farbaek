import { ArrowRightIcon, CheckIcon, LockSimpleIcon } from "@phosphor-icons/react/ssr";
import Link from "next/link";
import type { ReactNode } from "react";
import type { FirstStep, FirstSteps } from "@/core/workspace/first-steps";
import { hideFirstStepsAction, showFirstStepsAction } from "@/app/app/actions";

const STATE_WORDS: Record<FirstStep["state"], string> = { done: "done", next: "next", later: "to do", unavailable: "not available here" };

function Station({ step, n }: { step: FirstStep; n: number }) {
  const ring =
    step.state === "done"
      ? "border-verified/45 bg-[color-mix(in_oklab,var(--color-verified)_9%,var(--color-surface))] text-verified"
      : step.state === "next"
        ? "border-primary bg-primary text-on-primary shadow-e2"
        : step.state === "unavailable"
          ? "border-line bg-canvas-2 text-ink-3"
          : "border-dashed border-line-strong bg-surface text-ink-3";
  return (
    <li className="relative grid justify-items-center gap-2 text-center" aria-current={step.state === "next" ? "step" : undefined}>
      <span className={`relative flex size-11 items-center justify-center rounded-full border text-sm font-medium tabular ${ring}`} aria-hidden>
        {step.state === "next" ? <span className="absolute inset-0 rounded-full border border-primary motion-safe:animate-[core-call_2.4s_cubic-bezier(0.16,1,0.3,1)_infinite]" /> : null}
        {step.state === "done" ? <CheckIcon size={18} weight="bold" /> : step.state === "unavailable" ? <LockSimpleIcon size={16} /> : n}
      </span>
      <span className={`text-xs font-medium ${step.state === "next" ? "text-ink" : step.state === "done" ? "text-ink-2" : "text-ink-3"}`}>
        {step.short}
        <span className="sr-only">: {step.title}, {STATE_WORDS[step.state]}</span>
      </span>
    </li>
  );
}

/**
 * First steps on Mission Control (ADR 0073): the loop from one sentence to a
 * live, verified site as five stations, ticked off from the workspace's
 * records. The next step opens below the track with its one action, or with
 * the build box itself while nothing has been described yet.
 */
export function FirstStepsPanel({ data, composer }: { data: FirstSteps; composer?: ReactNode }) {
  const { steps, done } = data;
  const next = steps.find((s) => s.state === "next") ?? null;
  const unavailable = steps.filter((s) => s.state === "unavailable");
  // The proven part of the track: from the first station's centre to the last done one (five equal columns, centres 10% to 90%).
  const proven = Math.max(done - 1, 0);

  return (
    <section aria-labelledby="first-steps-heading" className="rounded-lg bg-surface-raised/60 p-2 ring-1 ring-line motion-safe:animate-[usage-in_420ms_cubic-bezier(0.16,1,0.3,1)_both]">
      <div className="rounded-md bg-surface p-5 shadow-e1 sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
          <div className="min-w-0">
            <h2 id="first-steps-heading" className="text-xl font-medium tracking-[-0.02em]">
              First steps
            </h2>
            <p className="mt-1 max-w-[56ch] text-sm leading-relaxed text-ink-2">From one sentence to a live, verified site. Each step ticks itself off from your workspace&apos;s records.</p>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-sm text-ink-3 tabular">
              {done} of {steps.length} done
            </span>
            <form action={hideFirstStepsAction}>
              <button type="submit" className="inline-flex min-h-11 items-center rounded-full px-3 text-sm text-ink-2 transition-colors duration-200 hover:bg-surface-raised hover:text-ink">
                Hide
              </button>
            </form>
          </div>
        </div>

        <div className="relative mt-7">
          <div className="absolute left-[10%] right-[10%] top-[21.5px] h-px bg-line" aria-hidden />
          <div
            className="absolute left-[10%] top-[21px] h-[2px] origin-left rounded-full bg-verified motion-safe:animate-[steps-fill_900ms_cubic-bezier(0.16,1,0.3,1)_120ms_both]"
            style={{ width: `${proven * 20}%` }}
            aria-hidden
          />
          <ol aria-label="Your first steps" className="relative grid grid-cols-5">
            {steps.map((s, i) => (
              <Station key={s.key} step={s} n={i + 1} />
            ))}
          </ol>
        </div>

        {next ? (
          <div className="mt-7 grid gap-4 rounded-md border border-line bg-canvas-2/60 p-4 sm:p-5">
            <div className={composer ? "" : "grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"}>
              <div className="min-w-0">
                <h3 className="text-lg font-medium tracking-[-0.02em]">{next.title}</h3>
                <p className="mt-1 max-w-[62ch] text-sm leading-relaxed text-ink-2">{next.detail}</p>
              </div>
              {composer || !next.href ? null : (
                <Link
                  href={next.href}
                  className="group inline-flex h-11 items-center justify-between gap-2 justify-self-start rounded-full bg-primary pl-4 pr-1.5 text-sm font-medium text-on-primary shadow-e1 transition-[transform,background-color] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-primary/90 active:scale-[0.98]"
                >
                  {next.action}
                  <span className="flex size-8 items-center justify-center rounded-full bg-on-primary/15 transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:translate-x-0.5">
                    <ArrowRightIcon size={15} weight="bold" aria-hidden />
                  </span>
                </Link>
              )}
            </div>
            {composer ? <div id="start">{composer}</div> : null}
          </div>
        ) : null}

        {unavailable.length > 0 ? (
          <ul className="mt-4 grid gap-1.5">
            {unavailable.map((s) => (
              <li key={s.key} className="flex items-start gap-2 text-xs leading-relaxed text-ink-3">
                <LockSimpleIcon size={14} className="mt-px shrink-0" aria-hidden />
                <span>
                  <span className="font-medium text-ink-2">{s.title}:</span> {s.reason}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </section>
  );
}

/** The quiet line left after hiding the first steps, so they're one press away. */
export function FirstStepsHidden({ data }: { data: FirstSteps }) {
  return (
    <form action={showFirstStepsAction} className="flex flex-wrap items-center gap-x-2 text-sm text-ink-3">
      <span>
        First steps hidden, {data.done} of {data.steps.length} done.
      </span>
      <button type="submit" className="inline-flex min-h-11 items-center rounded-full px-3 font-medium text-accent transition-colors duration-200 hover:bg-surface-raised">
        Show them
      </button>
    </form>
  );
}
