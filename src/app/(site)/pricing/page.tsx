import { ArrowCounterClockwiseIcon, ArrowsClockwiseIcon, InfoIcon, ShieldCheckIcon, WalletIcon } from "@phosphor-icons/react/ssr";
import type { Metadata } from "next";
import { FaqList, type FaqItem } from "@/components/marketing/faq";
import { ComparisonTable } from "@/components/pricing/comparison-table";
import { AndroidPlansNotice } from "@/components/billing/android-plans";
import { WebPurchaseOnly } from "@/components/billing/web-purchase-only";
import { PricingPlans } from "@/components/pricing/pricing-plans";
import { Container } from "@/components/ui/container";
import { CONTACT } from "@/config/contact";
import { TRIAL, chargeCents, formatUsd, getPlan } from "@/core/billing/catalog";

export const metadata: Metadata = {
  title: "Pricing",
  description: "Farbaek plans from $0.99 to $300 a month, with AI, sandboxes and previews included, usage that rolls over, and a 14-day Pro trial with no card.",
};

const trialBase = getPlan(TRIAL.basePlan).name;

/** What makes a Farbaek plan worth more than its price elsewhere. Each line is a rule the platform enforces. */
const PROMISES = [
  { icon: ArrowsClockwiseIcon, title: "Nothing expires at the end of the month", body: "Unused AI usage rolls over for two months, oldest first." },
  { icon: ArrowCounterClockwiseIcon, title: "Failed attempts are given back", body: "When an AI call fails, or the agent's fix for failed checks doesn't pass them either, that usage returns to you, up to a monthly cap." },
  { icon: WalletIcon, title: "No surprise bills", body: "Plans never run into overage. You see the share used and when it resets." },
  { icon: ShieldCheckIcon, title: "Security checks from Plus", body: "Others keep them for business plans. Farbaek includes them at $19.99." },
] as const;

const PRICING_FAQ: FaqItem[] = [
  {
    q: "Do I need my own AI or API key?",
    a: "No. Farbaek runs the models for you, and everything is included in your plan: the AI, the sandboxes your code runs in, and previews.",
  },
  {
    q: "What's an agent session?",
    a: "A typical stretch of agent work on Claude Sonnet: reading your project, writing code and checking it. Plans show about how many fit in a month. Real sessions vary with the task; fast models stretch your usage further and stronger models use it faster.",
  },
  {
    q: "What happens to usage I don't use?",
    a: "It rolls over. Each month's AI usage lasts two months, and Farbaek always spends the oldest first, so nothing you paid for disappears at the end of a month.",
  },
  {
    q: "What if the AI gets it wrong?",
    a: "When a call fails, times out or returns nothing usable, its usage is given back automatically. And when you ask the agent to fix what failed checks found and the fix doesn't pass them either, the fix's usage is given back too, up to about 5% of your monthly AI usage, on paid plans and during the trial.",
  },
  {
    q: "What happens when I reach a limit?",
    a: "AI work pauses until your usage resets or rolls over; nothing is charged beyond your plan. Editing, previews of static sites, downloads, audit history and billing keep working.",
  },
  {
    q: "How does the trial work?",
    a: `Every eligible new workspace gets ${TRIAL.lengthDays} days of ${trialBase} features, with ${TRIAL.limits.sandboxHours} sandbox hours and AI usage equal to a month of Starter. No card is needed. At the end you move to Free automatically, and nothing is charged.`,
  },
  {
    q: "Can I pay yearly or monthly?",
    a: `Every plan is billed monthly. Lite and Maker can also be paid yearly, at ${formatUsd(chargeCents(getPlan("lite")))} and ${formatUsd(chargeCents(getPlan("maker")))} a year, with more AI usage; we email you about 30 days before each yearly renewal.`,
  },
  {
    q: "What currency are prices in, and is tax included?",
    a: "Prices are in US dollars, without tax. Tax is added at checkout based on where you are. You can also pay in your own currency, for Dodo Payments' conversion fee of up to 4%; you see the exact amount before you pay.",
  },
  {
    q: "Can I cancel, and what about refunds?",
    a: `Cancel any time in Billing. Your plan keeps working to the end of the period you paid for, then the workspace moves to Free. Payments aren't refunded for part of a period once it has started, except where the law requires a refund. If something went wrong on Farbaek's side, write to ${CONTACT.support} and we'll put it right.`,
  },
  {
    q: "Is there a plan for larger teams?",
    a: `Enterprise: committed usage at a custom rate, with governance and evidence exports. Write to ${CONTACT.hello}.`,
  },
];

export default function PricingPage() {
  return (
    <>
      <section aria-labelledby="pricing-title" className="pb-16 pt-14 lg:pb-24 lg:pt-20">
        <Container>
          <div className="max-w-[46rem]">
            <h1 id="pricing-title" className="text-4xl font-medium leading-[1.08] tracking-[-0.03em] sm:text-5xl">
              Build, preview and ship. One subscription.
            </h1>
            <p className="mt-5 max-w-[58ch] text-lg leading-relaxed text-ink-2">
              Every plan includes Farbaek&apos;s AI, sandboxes and previews. No API keys to bring. Start with a {TRIAL.lengthDays}-day {trialBase} trial, no card
              required.
            </p>
          </div>

          <div className="mt-10 rounded-lg bg-surface-raised/60 p-2 ring-1 ring-line">
            <ul aria-label="What every plan promises" className="grid gap-x-8 gap-y-6 rounded-md bg-surface p-6 shadow-e1 sm:grid-cols-2 lg:grid-cols-4">
              {PROMISES.map(({ icon: Icon, title, body }) => (
                <li key={title} className="grid content-start gap-2">
                  <span className="flex size-10 items-center justify-center rounded-full bg-accent/[0.08] text-accent">
                    <Icon size={20} aria-hidden />
                  </span>
                  <p className="mt-1 font-medium leading-snug">{title}</p>
                  <p className="text-sm leading-relaxed text-ink-2">{body}</p>
                </li>
              ))}
            </ul>
          </div>

          <p className="mt-6 flex items-start gap-2.5 rounded-sm border border-info/30 bg-info/[0.06] px-4 py-3 text-sm text-ink">
            <InfoIcon size={18} weight="bold" className="mt-px shrink-0 text-info" aria-hidden />
            Every plan is charged monthly. Lite and Maker can also be paid yearly, with more AI usage, and we email you before each yearly renewal. Cancel any time in
            Billing, and your plan runs to the end of the period you paid for.
          </p>

          <div className="mt-10">
            {/* Names the plan list for screen readers, so the plan names (h3) sit under a heading. */}
            <h2 className="sr-only">Plans</h2>
            {/* Inside Farbaek for Android: one notice instead of a pill on every plan (ADR 0150). */}
            <WebPurchaseOnly
              fallback={
                <div className="mb-6">
                  <AndroidPlansNotice />
                </div>
              }
            >
              {null}
            </WebPurchaseOnly>
            <PricingPlans />
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
            Questions about plans
          </h2>
          <FaqList items={PRICING_FAQ} />
        </Container>
      </section>
    </>
  );
}
