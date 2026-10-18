import { ArrowRightIcon } from "@phosphor-icons/react/ssr";
import Link from "next/link";
import { Container } from "@/components/ui/container";
import { sessionsLine } from "@/components/pricing/pricing-plans";
import { SELF_SERVE_PLANS, TRIAL, formatUsd, getPlan } from "@/core/billing/catalog";
import { SectionHeading } from "./section-heading";

export function PricingTeaser() {
  return (
    <section aria-labelledby="pricing-teaser-title" className="py-20 lg:py-28">
      <Container>
        <SectionHeading id="pricing-teaser-title" title="One subscription. The models, sandboxes and checks are included.">
          No API keys to bring. Every new organization gets a {TRIAL.lengthDays}-day {getPlan(TRIAL.basePlan).name} trial with no card. When it
          ends you move to Free, and nothing is charged.
        </SectionHeading>

        {/* gap-px over the line colour draws the dividers for any number of plans. */}
        <dl className="mt-12 grid gap-px overflow-hidden rounded-md border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
          {SELF_SERVE_PLANS.map((plan) => (
            <div key={plan.id} className="bg-surface p-5 sm:p-6">
              <dt className="flex items-center justify-between gap-2 text-[15px] font-medium">
                {plan.name}
                {plan.recommendedFor ? <span className="rounded-full bg-accent/[0.08] px-2 py-0.5 text-xs font-medium text-accent">Recommended</span> : null}
              </dt>
              <dd className="mt-3">
                <span className="text-3xl font-medium tracking-[-0.02em] tabular">{plan.pricing.kind === "paid" ? formatUsd(plan.pricing.monthlyCents) : "$0"}</span>
                <span className="ml-1 text-sm text-ink-3">{plan.pricing.kind === "paid" ? "per month" : "forever"}</span>
              </dd>
              <dd className="mt-4 grid gap-1 text-sm text-ink-2 tabular">
                <span>{sessionsLine(plan)}</span>
                <span>
                  {plan.limits.sandboxHours} sandbox {plan.limits.sandboxHours === 1 ? "hour" : "hours"}, {plan.limits.seats === 1 ? "1 seat" : `${plan.limits.seats} seats`}
                </span>
              </dd>
            </div>
          ))}
        </dl>

        <Link href="/pricing" className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-sm text-[15px] font-medium text-accent hover:underline">
          Compare plans <ArrowRightIcon size={16} weight="bold" aria-hidden />
        </Link>
      </Container>
    </section>
  );
}
