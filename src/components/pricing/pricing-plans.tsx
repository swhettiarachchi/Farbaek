import { CheckIcon, ClockCounterClockwiseIcon } from "@phosphor-icons/react/ssr";
import Link from "next/link";
import { FEATURE_LABELS, FEATURE_STATUS, SELF_SERVE_PLANS, getPlan, monthlyVersionOf, planSessionsGuide, priceWords, type FeatureKey, type Plan } from "@/core/billing/catalog";
import { buttonClasses } from "@/components/ui/button";

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

/** How much less AI usage the monthly version has than the yearly plan, as a whole percent. */
const lessUsagePercent = (yearly: Plan, monthly: Plan) => Math.round((1 - (monthly.limits.aiUnitsPerMonth ?? 0) / (yearly.limits.aiUnitsPerMonth ?? 1)) * 100);

/** Sign in first, then straight to the plan's step in Billing. */
const choosePath = (id: string) => `/sign-in?next=${encodeURIComponent(`/app/billing?choose=${id}#billing-step`)}`;

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
 * and projects. Free starts with sign-in; a paid plan goes on to Billing,
 * where checkout runs after sign-in.
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
        const price = priceWords(plan);
        const monthlyId = monthlyVersionOf(plan.id);
        const monthly = monthlyId ? getPlan(monthlyId) : null;
        const added = newFeatures(plan, i).filter((f) => f !== "usage_rollover");
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
              <span className="text-[2.75rem] font-medium leading-none tracking-[-0.04em] tabular">{price.price}</span>
              <span className="ml-1.5 text-sm text-ink-3">{price.per}</span>
            </p>
            <p className="mt-1.5 min-h-5 text-xs text-ink-3 tabular">{price.billed ?? (plan.pricing.kind === "paid" ? "Billed monthly" : "")}</p>

            <ul className="mt-5 grid gap-1.5 border-t border-line pt-5 text-sm text-ink-2">
              <li className="font-medium text-ink">{sessionsLine(plan)}</li>
              <li className="tabular">
                {l.sandboxHours} sandbox {l.sandboxHours === 1 ? "hour" : "hours"}
              </li>
              <li className="tabular">
                {l.seats === 1 ? "1 seat" : `${l.seats} seats`}, {l.workspaces === 1 ? "1 project" : `${number.format(l.workspaces ?? 0)} projects`}
              </li>
              <li>{plan.features.includes("usage_rollover") ? "Unused usage carries over a month" : "Fast models only"}</li>
            </ul>

            <ul className="mt-5 grid gap-2 text-sm">
              {i > 0 ? <li className="text-ink-3">Everything in {SELF_SERVE_PLANS[i - 1]!.name}{added.length > 0 ? ", plus:" : ", with more usage"}</li> : null}
              {added
                .slice(0, 5)
                .map((feature) => (
                  <Feature key={feature} feature={feature} />
                ))}
            </ul>

            <div className="mt-auto grid gap-2 pt-8">
              <Link
                href={plan.pricing.kind === "paid" ? choosePath(plan.id) : "/sign-in"}
                className={buttonClasses(featured ? "primary" : "secondary", "md", "min-h-11 w-full")}
              >
                {plan.pricing.kind === "paid" ? `Choose ${plan.name}${monthly ? " yearly" : ""}` : "Start free"}
              </Link>
              {monthly ? (
                <>
                  <Link href={choosePath(monthly.id)} className={buttonClasses("ghost", "md", "min-h-11 w-full")}>
                    Pay monthly instead
                  </Link>
                  <p className="text-center text-xs leading-relaxed text-ink-3">Paid monthly: about {lessUsagePercent(plan, monthly)}% less AI usage, everything else the same.</p>
                </>
              ) : null}
            </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

