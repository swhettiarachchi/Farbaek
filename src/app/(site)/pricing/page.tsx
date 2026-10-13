import { InfoIcon } from "@phosphor-icons/react/ssr";
import type { Metadata } from "next";
import { FaqList, type FaqItem } from "@/components/marketing/faq";
import { ComparisonTable } from "@/components/pricing/comparison-table";
import { PricingPlans } from "@/components/pricing/pricing-plans";
import { Container } from "@/components/ui/container";
import { BILLING_CURRENCY, TRIAL } from "@/core/billing/catalog";

export const metadata: Metadata = {
  title: "Pricing",
  description: "Planned Farbaek plans: Free, Developer, Team and Business, with a 14-day Team trial and no card required.",
};

const number = new Intl.NumberFormat("en-US");

const PRICING_FAQ: FaqItem[] = [
  {
    q: "What counts as a governed evaluation?",
    a: "One unique, authenticated action request that enters policy evaluation. Blocked actions count. Failed sign-ins don't. Retries with the same idempotency key count once.",
  },
  {
    q: "What happens when I reach a limit?",
    a: "New governed actions pause until the next period or an upgrade. Audit history, exports, billing, emergency pause and permission revocation keep working. There are no surprise overage charges.",
  },
  {
    q: "How does the trial work?",
    a: `Every eligible new organization gets ${TRIAL.lengthDays} days of Team features, capped at ${TRIAL.limits.seats} seats, ${TRIAL.limits.agents} agents, ${TRIAL.limits.integrations} integrations, ${number.format(TRIAL.limits.evaluationsTotal)} evaluations and ${TRIAL.limits.aiCreditsTotal} AI credits. No card is needed. At the end you move to Free automatically, and nothing is charged.`,
  },
  {
    q: "Is cancelling easy?",
    a: "It will be as easy as signing up, from the Billing page. You keep paid access until the end of the period you paid for.",
  },
  {
    q: "What happens to my data if I downgrade?",
    a: "Nothing is deleted. The new limits apply to new actions, and if you're over a limit you choose which resources stay active.",
  },
  {
    q: "Do AI credits cover my own model API key?",
    a: "No. If you bring your own model provider key, that provider bills you directly for the usage.",
  },
  {
    q: "What about refunds?",
    a: "Refund terms will be published before payments open.",
  },
];

export default function PricingPage() {
  return (
    <>
      <section aria-labelledby="pricing-title" className="pb-16 pt-14 lg:pb-24 lg:pt-20">
        <Container>
          <div className="mx-auto max-w-[40rem] text-center">
            <h1 id="pricing-title" className="text-4xl font-medium leading-[1.1] tracking-[-0.025em] sm:text-5xl">
              Plans for building with proof.
            </h1>
            <p className="mt-5 text-lg leading-relaxed text-ink-2">
              Start with a {TRIAL.lengthDays}-day Team trial, no card required. Then stay on Free or choose a plan.
            </p>
          </div>

          <p className="mx-auto mt-8 flex max-w-[40rem] items-start gap-2.5 rounded-sm border border-info/30 bg-info/[0.06] px-4 py-3 text-sm text-ink">
            <InfoIcon size={18} weight="bold" className="mt-px shrink-0 text-info" aria-hidden />
            Payments aren&apos;t open yet. These are the planned launch plans, and nothing can be bought today.
          </p>

          <div className="mt-12">
            <PricingPlans />
          </div>

          <div className="mt-8 grid gap-4 border-t border-line pt-6 text-sm text-ink-2 md:grid-cols-2">
            <p>
              Prices in {BILLING_CURRENCY}. Applicable taxes are calculated at checkout. Annual plans are charged upfront for the year.
            </p>
            <p className="md:text-right">
              <span className="font-medium text-ink">Enterprise:</span> custom contracts for larger organizations. Enterprise capabilities are
              listed here once they are implemented.
            </p>
          </div>
        </Container>
      </section>

      <section aria-labelledby="compare-title" className="border-t border-line py-16 lg:py-24">
        <Container>
          <h2 id="compare-title" className="text-3xl font-medium tracking-[-0.02em]">
            Compare every plan
          </h2>
          <div className="mt-8">
            <ComparisonTable />
          </div>
        </Container>
      </section>

      <section aria-labelledby="pricing-faq-title" className="border-t border-line py-16 lg:py-24">
        <Container className="grid gap-10 lg:grid-cols-[1fr_1.6fr] lg:gap-16">
          <h2 id="pricing-faq-title" className="text-3xl font-medium tracking-[-0.02em]">
            Billing questions
          </h2>
          <FaqList items={PRICING_FAQ} />
        </Container>
      </section>
    </>
  );
}
