"use client";

import { CheckIcon } from "@phosphor-icons/react";
import { useState } from "react";
import {
  FEATURE_LABELS,
  SELF_SERVE_PLANS,
  annualMonthlyEquivalentCents,
  annualSavingsCents,
  formatUsd,
  type BillingInterval,
  type FeatureKey,
  type Plan,
} from "@/core/billing/catalog";

const number = new Intl.NumberFormat("en-US");

function newFeatures(plan: Plan, index: number): FeatureKey[] {
  const previous = SELF_SERVE_PLANS[index - 1];
  return previous ? plan.features.filter((f) => !previous.features.includes(f)) : [...plan.features];
}

function Price({ plan, interval }: { plan: Plan; interval: BillingInterval }) {
  if (plan.pricing.kind !== "paid") {
    return (
      <>
        <p>
          <span className="text-4xl font-medium tracking-[-0.02em] tabular">$0</span>
          <span className="ml-1.5 text-sm text-ink-3">forever</span>
        </p>
        <p className="mt-2 text-[15px] text-ink-2">No card, no trial clock.</p>
      </>
    );
  }
  if (interval === "month") {
    return (
      <>
        <p>
          <span className="text-4xl font-medium tracking-[-0.02em] tabular">{formatUsd(plan.pricing.monthlyCents)}</span>
          <span className="ml-1.5 text-sm text-ink-3">per month</span>
        </p>
        <p className="mt-2 text-[15px] text-ink-2">Billed monthly.</p>
      </>
    );
  }
  return (
    <>
      <p>
        <span className="text-4xl font-medium tracking-[-0.02em] tabular">{formatUsd(plan.pricing.annualCents)}</span>
        <span className="ml-1.5 text-sm text-ink-3">per year</span>
      </p>
      {/* Same weight as the monthly line: the upfront annual charge is never hidden behind the equivalent. */}
      <p className="mt-2 text-[15px] text-ink-2 tabular">
        Billed yearly upfront. That&apos;s {formatUsd(annualMonthlyEquivalentCents(plan))} a month, saving {formatUsd(annualSavingsCents(plan))}.
      </p>
    </>
  );
}

export function PricingPlans() {
  const [interval, setBillingInterval] = useState<BillingInterval>("month");

  return (
    <div>
      <div className="flex justify-center">
        <div role="radiogroup" aria-label="Billing interval" className="inline-flex rounded-full border border-line bg-surface p-1">
          {(["month", "year"] as const).map((value) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={interval === value}
              onClick={() => setBillingInterval(value)}
              className={`h-10 rounded-full px-5 text-sm font-medium transition-colors duration-[140ms] ${
                interval === value ? "bg-primary text-on-primary" : "text-ink-2 hover:text-ink"
              }`}
            >
              {value === "month" ? "Monthly" : "Annual"}
            </button>
          ))}
        </div>
      </div>

      <ul
        aria-label="Plans"
        className="-mx-4 mt-10 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-4 sm:-mx-6 sm:px-6 lg:mx-0 lg:grid lg:grid-cols-4 lg:overflow-visible lg:px-0 lg:pb-0"
      >
        {SELF_SERVE_PLANS.map((plan, i) => (
          <li
            key={plan.id}
            className={`flex w-[84%] max-w-[340px] shrink-0 snap-start flex-col rounded-md border bg-surface p-6 sm:w-[46%] lg:w-auto lg:max-w-none ${
              plan.recommendedFor ? "border-accent/50" : "border-line"
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-lg font-medium">{plan.name}</h2>
              {plan.recommendedFor ? (
                <span className="rounded-full border border-accent/40 bg-accent/[0.06] px-2.5 py-0.5 text-xs font-medium text-accent">
                  Recommended for {plan.recommendedFor}
                </span>
              ) : null}
            </div>
            <p className="mt-1 text-sm text-ink-2">{plan.summary}</p>

            <div className="mt-6 min-h-[6.5rem]">
              <Price plan={plan} interval={interval} />
            </div>

            <ul className="mt-6 grid gap-1.5 border-t border-line pt-5 text-sm text-ink-2 tabular">
              <li>{number.format(plan.limits.evaluationsPerMonth ?? 0)} governed evaluations a month</li>
              <li>{plan.limits.agents} registered agents</li>
              <li>{plan.limits.seats === 1 ? "1 seat" : `Up to ${plan.limits.seats} seats`}</li>
              <li>{plan.limits.historyDays}-day activity history</li>
              <li>{number.format(plan.limits.aiCreditsPerMonth ?? 0)} AI credits a month</li>
            </ul>

            <ul className="mt-5 grid gap-2 text-sm">
              {i > 0 ? <li className="text-ink-3">Everything in {SELF_SERVE_PLANS[i - 1]!.name}, plus:</li> : null}
              {newFeatures(plan, i)
                .slice(0, 5)
                .map((feature) => (
                  <li key={feature} className="flex gap-2">
                    <CheckIcon size={16} weight="bold" className="mt-0.5 shrink-0 text-verified" aria-hidden />
                    {FEATURE_LABELS[feature]}
                  </li>
                ))}
            </ul>

            <p className="mt-auto pt-8 text-center text-sm text-ink-3">
              <span className="block rounded-sm border border-dashed border-line-strong/60 px-3 py-2.5">Sign-up opens at launch</span>
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
