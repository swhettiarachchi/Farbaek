import { ArrowRightIcon } from "@phosphor-icons/react/ssr";
import Link from "next/link";
import { Container } from "@/components/ui/container";
import { PlanCardLink } from "@/components/pricing/plan-card-link";
import { sessionsLine } from "@/components/pricing/pricing-plans";
import { SELF_SERVE_PLANS, TRIAL, getPlan, priceWords } from "@/core/billing/catalog";
import { isPaidPlanId } from "@/core/billing/provider-state";
import { subscribePath } from "@/core/billing/subscribe";
import { SectionHeading } from "./section-heading";

export function PricingTeaser() {
  return (
    <section aria-labelledby="pricing-teaser-title" className="py-20 lg:py-28">
      <Container>
        <SectionHeading id="pricing-teaser-title" title="One subscription. The models, test spaces and checks are included.">
          No API keys to bring. New workspaces get a {TRIAL.lengthDays}-day {getPlan(TRIAL.basePlan).name} trial with no card, one per email address.
          When it ends you move to Free, and nothing is charged.
        </SectionHeading>

        {/* gap-px over the line colour draws the dividers for any number of plans. Each card is one link to its plan (ADR 0197). */}
        <ul aria-label="Plans" className="mt-12 grid gap-px overflow-hidden rounded-md border border-line bg-line sm:grid-cols-2 lg:grid-cols-5">
          {SELF_SERVE_PLANS.map((plan) => {
            const featured = plan.recommendedFor !== undefined;
            const paid = isPaidPlanId(plan.id) ? plan.id : null;
            const price = priceWords(plan);
            return (
              <li key={plan.id} className="group relative flex flex-col bg-surface p-5 transition-colors duration-150 hover:bg-canvas-2 sm:p-6">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-body font-medium">{plan.name}</h3>
                  {featured ? <span className="rounded-full bg-primary px-2.5 py-0.5 text-xs font-medium text-on-primary">Recommended</span> : null}
                </div>
                <p data-web-purchase className="mt-3">
                  <span className="text-3xl font-medium tracking-[-0.02em] tabular">{price.price}</span>
                  <span className="ml-1 text-sm text-ink-3">{price.per}</span>
                  {price.billed ? <span className="mt-1 block text-xs text-ink-3 tabular">{price.billed}</span> : null}
                </p>
                <p className="mt-4 grid gap-1 text-sm text-ink-2 tabular">
                  <span>{sessionsLine(plan)}</span>
                  <span>
                    {plan.limits.sandboxHours} test space {plan.limits.sandboxHours === 1 ? "hour" : "hours"}, {plan.limits.seats === 1 ? "1 seat" : `${plan.limits.seats} seats`}
                  </span>
                </p>
                {/* Store apps sell nothing from the web (ADR 0150, ADR 0177): their paid cards have no link at all. */}
                <div className="mt-auto pt-5" data-web-purchase={paid ? "" : undefined}>
                  {paid ? (
                    <PlanCardLink href={subscribePath(paid)} featured={featured} label="Subscribe" planName={plan.name} />
                  ) : (
                    <PlanCardLink href="/sign-in" featured={featured} label="Start free" />
                  )}
                </div>
              </li>
            );
          })}
        </ul>

        <Link href="/pricing" className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-sm text-body font-medium text-accent hover:underline">
          Compare plans <ArrowRightIcon size={16} weight="bold" aria-hidden />
        </Link>
      </Container>
    </section>
  );
}
