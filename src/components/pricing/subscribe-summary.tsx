import { BuildingsIcon, ClipboardTextIcon, CreditCardIcon, SignInIcon } from "@phosphor-icons/react/ssr";
import type { Icon } from "@phosphor-icons/react";
import Link from "next/link";
import { StatusGlyph } from "@/components/ui/status-badge";
import { getPlan, priceWords } from "@/core/billing/catalog";
import type { PaidPlanId } from "@/core/billing/provider";
import { baseName } from "@/core/billing/subscribe";
import { sessionsLine } from "./pricing-plans";

const number = new Intl.NumberFormat("en-US");

/** The steps between a Subscribe button and a paid plan (ADR 0197), in the order they happen. */
const STEPS: { id: SubscribeStage; icon: Icon; title: string; body: string }[] = [
  { id: "sign-in", icon: SignInIcon, title: "Sign in", body: "Or make your account, with no password to remember." },
  { id: "workspace", icon: BuildingsIcon, title: "Name your workspace", body: "Only the first time. Your projects and your plan belong to it." },
  { id: "review", icon: ClipboardTextIcon, title: "Review and agree", body: "The price, what's included and when it renews, before anything is charged." },
  { id: "pay", icon: CreditCardIcon, title: "Pay on Dodo Payments", body: "Secure checkout, in US dollars or your own currency. Cancel any time in Billing." },
];

export type SubscribeStage = "sign-in" | "workspace" | "review" | "pay";

/**
 * The plan someone is subscribing to, kept in view on the way to checkout:
 * its price and what it includes, then where they are in the steps.
 */
export function SubscribeSummary({ planId, stage }: { planId: PaidPlanId; stage: SubscribeStage }) {
  const plan = getPlan(planId);
  const price = priceWords(plan);
  const l = plan.limits;
  const at = STEPS.findIndex((s) => s.id === stage);
  return (
    <div className="rounded-lg bg-surface-raised/60 p-2 ring-1 ring-line">
      <div className="rounded-md bg-surface p-6 shadow-e2 sm:p-8">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-xl font-medium tracking-[-0.02em]">{baseName(plan)}</h2>
          <Link href="/pricing" className="inline-flex min-h-11 items-center text-sm font-medium text-accent underline-offset-4 hover:underline">
            Change plan
          </Link>
        </div>
        <p data-web-purchase className="mt-2">
          <span className="text-[2.25rem] font-medium leading-none tracking-[-0.04em] tabular">{price.price}</span>
          <span className="ml-1.5 text-sm text-ink-3">{price.per}</span>
          {price.billed ? <span className="mt-1.5 block text-xs text-ink-3 tabular">{price.billed}</span> : null}
        </p>
        <ul className="mt-5 grid gap-1.5 border-t border-line pt-5 text-sm text-ink-2 tabular">
          <li className="font-medium text-ink">{sessionsLine(plan)}</li>
          <li>
            {l.sandboxHours} test space {l.sandboxHours === 1 ? "hour" : "hours"} a month
          </li>
          <li>
            {l.seats === 1 ? "1 seat" : `${l.seats} seats`}, {l.workspaces === 1 ? "1 project" : `${number.format(l.workspaces ?? 0)} projects`}
          </li>
        </ul>

        <ol className="mt-7 grid gap-5" aria-label="Steps to subscribe">
          {STEPS.map((s, i) => {
            const now = i === at;
            const done = i < at;
            return (
              <li key={s.id} aria-current={now ? "step" : undefined} className="flex gap-3.5">
                <span
                  className={`flex size-9 shrink-0 items-center justify-center rounded-full ring-1 ${
                    now ? "bg-primary text-on-primary ring-primary" : done ? "bg-surface text-ink-3 ring-line" : "bg-surface text-ink-2 ring-line"
                  }`}
                >
                  {/* A finished step shows the done kind's check (ADR 0183), and says so to screen readers. */}
                  {done ? <StatusGlyph status="done" /> : <s.icon size={16} weight="bold" aria-hidden />}
                </span>
                <span className={done ? "text-ink-3" : undefined}>
                  <span className={`block text-sm font-medium ${now ? "text-ink" : ""}`}>
                    {s.title}
                    {done ? <span className="sr-only"> (done)</span> : null}
                  </span>
                  <span className="mt-0.5 block max-w-[42ch] text-sm leading-relaxed text-ink-2">{s.body}</span>
                </span>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
