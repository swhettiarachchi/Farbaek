import { ArrowRightIcon } from "@phosphor-icons/react/ssr";
import Link from "next/link";
import { Container } from "@/components/ui/container";
import { SELF_SERVE_PLANS, TRIAL, formatUsd } from "@/core/billing/catalog";
import { SectionHeading } from "./section-heading";

const number = new Intl.NumberFormat("en-US");

export function PricingTeaser() {
  return (
    <section aria-labelledby="pricing-teaser-title" className="py-20 lg:py-28">
      <Container>
        <SectionHeading id="pricing-teaser-title" title="Predictable plans and a real free tier.">
          Every new organization gets a {TRIAL.lengthDays}-day Team trial with no card. When it ends you move to Free, and nothing is
          charged.
        </SectionHeading>

        <dl className="mt-12 grid overflow-hidden rounded-md border border-line bg-surface sm:grid-cols-2 lg:grid-cols-4">
          {SELF_SERVE_PLANS.map((plan) => (
            <div key={plan.id} className="border-line p-5 sm:p-6 [&:not(:last-child)]:border-b sm:[&:nth-child(odd)]:border-r lg:border-b-0 lg:[&:not(:last-child)]:border-r">
              <dt className="text-[15px] font-medium">{plan.name}</dt>
              <dd className="mt-3">
                <span className="text-3xl font-medium tracking-[-0.02em] tabular">
                  {plan.pricing.kind === "paid" ? formatUsd(plan.pricing.monthlyCents) : "$0"}
                </span>
                <span className="ml-1 text-sm text-ink-3">{plan.pricing.kind === "paid" ? "per month" : "forever"}</span>
              </dd>
              <dd className="mt-4 grid gap-1 text-sm text-ink-2 tabular">
                <span>{number.format(plan.limits.evaluationsPerMonth ?? 0)} evaluations a month</span>
                <span>
                  {plan.limits.seats === 1 ? "1 seat" : `Up to ${plan.limits.seats} seats`}, {plan.limits.historyDays}-day history
                </span>
              </dd>
            </div>
          ))}
        </dl>

        <Link href="/pricing" className="mt-6 inline-flex items-center gap-2 rounded-sm text-[15px] font-medium text-accent hover:underline">
          Compare plans <ArrowRightIcon size={16} weight="bold" aria-hidden />
        </Link>
      </Container>
    </section>
  );
}
