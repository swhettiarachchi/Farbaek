import { CheckIcon } from "@phosphor-icons/react/ssr";
import Link from "next/link";
import { StatusGlyph } from "@/components/ui/status-badge";
import { FEATURE_LABELS, FEATURE_STATUS, SELF_SERVE_PLANS, chargeCents, formatUsd, getPlan, planSessionsGuide, priceWords, yearlyVersionOf, type FeatureKey, type Plan } from "@/core/billing/catalog";
import { buttonClasses } from "@/components/ui/button";
import { WebPurchaseOnly } from "@/components/billing/web-purchase-only";
import { PlayPrice } from "@/components/billing/play-billing";
import { googlePlayProductForPlan } from "@/core/billing/google-play";
import { isPaidPlanId } from "@/core/billing/provider-state";
import { subscribePath } from "@/core/billing/subscribe";
import { PlanCardLink } from "./plan-card-link";

const number = new Intl.NumberFormat("en-US");

function newFeatures(plan: Plan, index: number): FeatureKey[] {
  const previous = SELF_SERVE_PLANS[index - 1];
  return previous ? plan.features.filter((f) => !previous.features.includes(f)) : [...plan.features];
}

export function sessionsLine(plan: Plan): string {
  const n = planSessionsGuide(plan);
  if (n === null) return "Custom AI usage";
  if (n < 1) return "Enough to try the agent";
  return n === 1 ? "About 1 agent session a month" : `About ${number.format(n)} agent sessions a month`;
}

/** How much more AI usage the yearly version has than the monthly plan, as a whole percent. */
const moreUsagePercent = (monthly: Plan, yearly: Plan) => Math.round(((yearly.limits.aiUnitsPerMonth ?? 0) / (monthly.limits.aiUnitsPerMonth ?? 1) - 1) * 100);


function Feature({ feature }: { feature: FeatureKey }) {
  const coming = FEATURE_STATUS[feature] === "coming";
  return (
    <li className="flex gap-2">
      {/* A check for what's included; a feature still to come carries the waiting mark and says so in words. */}
      {coming ? <StatusGlyph status="pending" className="mt-0.5" /> : <CheckIcon size={16} weight="bold" className="mt-0.5 shrink-0 text-verified" aria-hidden />}
      <span>
        {FEATURE_LABELS[feature]}
        {coming ? <span className="ml-1.5 whitespace-nowrap rounded-full border border-dashed border-line-strong px-2 py-px text-xs text-ink-3">Coming soon</span> : null}
      </span>
    </li>
  );
}

/**
 * The self-serve plans, from the catalog. Every number shown is derived from
 * it: the price, the agent-session guidance (rate card), sandbox hours, seats
 * and projects. Free starts with sign-in. A paid plan's whole card leads to
 * /subscribe/<plan>, which signs in, makes a first workspace if needed, and
 * ends at the plan's review step in Billing before checkout (ADR 0197).
 */
export function PricingPlans() {
  return (
    <>
      {/* On a phone the plans scroll sideways, so say how many there are before the first card. */}
      <p className="mb-3 text-sm text-ink-3 lg:hidden">
        {SELF_SERVE_PLANS.length} plans. Swipe sideways to compare them.
      </p>
    <ul
      aria-label="Plans"
      className="-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-4 sm:-mx-6 sm:px-6 lg:mx-0 lg:grid lg:grid-cols-5 lg:overflow-visible lg:px-0 lg:pb-0"
    >
      {SELF_SERVE_PLANS.map((plan, i) => {
        const featured = plan.recommendedFor !== undefined;
        const l = plan.limits;
        const price = priceWords(plan);
        const yearlyId = yearlyVersionOf(plan.id);
        const yearly = yearlyId ? getPlan(yearlyId) : null;
        const added = newFeatures(plan, i).filter((f) => f !== "usage_rollover");
        const paidId = plan.pricing.kind === "paid" && isPaidPlanId(plan.id) ? plan.id : null;
        return (
          <li
            key={plan.id}
            className={`relative flex w-[82%] shrink-0 snap-start rounded-lg p-2 ring-1 sm:w-[46%] lg:w-auto ${
              featured ? "bg-surface-raised/60 ring-ink/15" : "bg-surface-raised/60 ring-line"
            }`}
          >
            <div
              className={`group relative flex w-full flex-col rounded-md bg-surface p-6 transition-[transform,box-shadow] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:-translate-y-0.5 ${
                featured ? "shadow-e2 ring-1 ring-ink" : "shadow-e1 hover:shadow-e2"
              }`}
            >
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-lg font-medium">{plan.name}</h3>
              {featured ? <span className="rounded-full bg-primary px-2.5 py-0.5 text-xs font-medium text-on-primary">Recommended</span> : null}
            </div>
            <p className="mt-1 min-h-[2.5rem] text-sm text-ink-2">{plan.summary}</p>

            <p className="mt-5">
              {/* Inside Farbaek for Android, Google Play's own price when Google Play sells the plan (ADR 0154). */}
              <PlayPrice ready productId={googlePlayProductForPlan(plan.id)?.productId ?? null} amountClass="text-[2.75rem] font-medium leading-none tracking-[-0.04em] tabular" perClass="ml-1.5 text-sm text-ink-3">
                <span className="text-[2.75rem] font-medium leading-none tracking-[-0.04em] tabular">{price.price}</span>
                <span className="ml-1.5 text-sm text-ink-3">{price.per}</span>
              </PlayPrice>
            </p>
            <p className="mt-1.5 min-h-5 text-xs text-ink-3 tabular">{price.billed ?? (plan.pricing.kind === "paid" ? "Billed monthly" : "")}</p>

            <ul className="mt-5 grid gap-1.5 border-t border-line pt-5 text-sm text-ink-2">
              <li className="font-medium text-ink">{sessionsLine(plan)}</li>
              <li className="tabular">
                {l.sandboxHours} test space {l.sandboxHours === 1 ? "hour" : "hours"}
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
              {paidId ? (
                // Inside Farbaek for Android, Google Play's Payments policy rules out selling plans (ADR 0150).
                <WebPurchaseOnly fallback={null}>
                  <PlanCardLink href={subscribePath(paidId)} featured={featured} label="Subscribe" planName={plan.name} size="md" />
                  {yearly && isPaidPlanId(yearly.id) ? (
                    <>
                      {/* Above the card's stretched link, so it stays its own target. */}
                      <Link href={subscribePath(yearly.id)} className={buttonClasses("ghost", "md", "relative z-10 min-h-11 w-full")}>
                        Pay yearly instead
                      </Link>
                      <p className="relative z-10 text-center text-xs leading-relaxed text-ink-3">
                        Paid yearly ({formatUsd(chargeCents(yearly))} a year): about {moreUsagePercent(plan, yearly)}% more AI usage, everything else the same.
                      </p>
                    </>
                  ) : null}
                </WebPurchaseOnly>
              ) : (
                <PlanCardLink href="/sign-in" featured={featured} label="Start free" size="md" />
              )}
            </div>
            </div>
          </li>
        );
      })}
    </ul>
    </>
  );
}

