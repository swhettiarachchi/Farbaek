import { CheckIcon, ClockCounterClockwiseIcon, InfoIcon } from "@phosphor-icons/react/ssr";
import { FEATURE_LABELS, FEATURE_STATUS, SELF_SERVE_PLANS, formatUsd, planSessionsGuide, type FeatureKey, type Plan } from "@/core/billing/catalog";

const number = new Intl.NumberFormat("en-US");

function newFeatures(plan: Plan, index: number): FeatureKey[] {
  const previous = SELF_SERVE_PLANS[index - 1];
  return previous ? plan.features.filter((f) => !previous.features.includes(f)) : [...plan.features];
}

export function sessionsLine(plan: Plan): string {
  const n = planSessionsGuide(plan);
  if (n === null) return "Custom AI usage";
  return n < 2 ? "A taste of the agent each month" : `About ${number.format(n)} agent sessions a month`;
}

function Feature({ feature }: { feature: FeatureKey }) {
  const coming = FEATURE_STATUS[feature] === "coming";
  return (
    <li className="flex gap-2">
      {coming ? <ClockCounterClockwiseIcon size={16} className="mt-0.5 shrink-0 text-ink-3" aria-hidden /> : <CheckIcon size={16} weight="bold" className="mt-0.5 shrink-0 text-verified" aria-hidden />}
      <span>
        {FEATURE_LABELS[feature]}
        {coming ? <span className="ml-1.5 whitespace-nowrap rounded-full border border-line px-2 py-px text-xs text-ink-3">Coming soon</span> : null}
      </span>
    </li>
  );
}

/**
 * The self-serve plans, from the catalog. Every number shown is derived from
 * it: the price, the agent-session guidance (rate card), sandbox hours, seats
 * and projects. Nothing can be bought yet; the button says so.
 */
export function PricingPlans() {
  return (
    <ul
      aria-label="Plans"
      className="-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-4 sm:-mx-6 sm:px-6 lg:mx-0 lg:grid lg:grid-cols-4 lg:overflow-visible lg:px-0 lg:pb-0"
    >
      {SELF_SERVE_PLANS.map((plan, i) => {
        const featured = plan.recommendedFor !== undefined;
        const l = plan.limits;
        return (
          <li
            key={plan.id}
            className={`relative flex w-[82%] shrink-0 snap-start rounded-lg p-2 ring-1 sm:w-[46%] lg:w-auto ${
              featured ? "aurora bg-accent/[0.06] ring-accent/30" : "bg-surface-raised/60 ring-line"
            }`}
          >
            <div
              className={`flex w-full flex-col rounded-md bg-surface p-6 transition-[transform,box-shadow] duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] hover:-translate-y-0.5 ${
                featured ? "shadow-e3 ring-1 ring-accent" : "shadow-e1 hover:shadow-e2"
              }`}
            >
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-lg font-medium">{plan.name}</h3>
              {featured ? <span className="rounded-full bg-accent px-2.5 py-0.5 text-xs font-medium text-on-accent">Recommended</span> : null}
            </div>
            <p className="mt-1 min-h-[2.5rem] text-sm text-ink-2">{plan.summary}</p>

            <p className="mt-5">
              <span className="text-[2.75rem] font-medium leading-none tracking-[-0.04em] tabular">{plan.pricing.kind === "paid" ? formatUsd(plan.pricing.monthlyCents) : "$0"}</span>
              <span className="ml-1.5 text-sm text-ink-3">{plan.pricing.kind === "paid" ? "a month" : "forever"}</span>
            </p>

            <ul className="mt-5 grid gap-1.5 border-t border-line pt-5 text-sm text-ink-2">
              <li className="font-medium text-ink">{sessionsLine(plan)}</li>
              <li className="tabular">
                {l.sandboxHours} sandbox {l.sandboxHours === 1 ? "hour" : "hours"}
              </li>
              <li className="tabular">
                {l.seats === 1 ? "1 seat" : `${l.seats} seats`}, {l.workspaces === 1 ? "1 project" : `${number.format(l.workspaces ?? 0)} projects`}
              </li>
              <li>{plan.pricing.kind === "paid" ? "Unused usage carries over a month" : "Fast models only"}</li>
            </ul>

            <ul className="mt-5 grid gap-2 text-sm">
              {i > 0 ? <li className="text-ink-3">Everything in {SELF_SERVE_PLANS[i - 1]!.name}, plus:</li> : null}
              {newFeatures(plan, i)
                .filter((f) => f !== "usage_rollover")
                .slice(0, 5)
                .map((feature) => (
                  <Feature key={feature} feature={feature} />
                ))}
            </ul>

            <p className="mt-auto pt-8 text-center text-sm text-ink-3">
              <span className="block rounded-full border border-dashed border-line-strong/60 px-3 py-2.5">Sign-up opens at launch</span>
            </p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** Small print under the cards: what "agent session" means. */
export function SessionsNote() {
  return (
    <p className="flex items-start gap-2 text-sm text-ink-2">
      <InfoIcon size={16} className="mt-0.5 shrink-0 text-ink-3" aria-hidden />
      An agent session is a typical stretch of work on Claude Sonnet: reading the project, writing code and checking it. Real sessions vary with the task. Fast models stretch your usage further, and stronger models use it faster.
    </p>
  );
}
