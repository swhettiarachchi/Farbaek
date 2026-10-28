import { CalendarXIcon, CheckCircleIcon, CreditCardIcon, PauseCircleIcon, WarningIcon } from "@phosphor-icons/react/ssr";
import Link from "next/link";
import type { ReactNode } from "react";
import { cancelPlanAction, changePlanAction, openPortalAction, resumePlanAction, startCheckoutAction } from "@/app/app/billing/actions";
import { Notice } from "@/components/app/primitives";
import { sessionsLine } from "@/components/pricing/pricing-plans";
import { LocalTime } from "@/components/ui/local-time";
import { buttonClasses } from "@/components/ui/button";
import { formatUsd, getPlan } from "@/core/billing/catalog";
import { checkoutConsentText, formatMinorUnits } from "@/core/billing/provider-state";
import type { PaidPlanId } from "@/core/billing/provider";
import type { PlanChangePreview } from "@/server/billing/use-cases";
import type { BillingView } from "@/server/billing/view";
import { BillingSubmit } from "./billing-submit";

/** The double bezel for the one step in progress: a raised shell around the card, so it reads as the thing to finish. */
function StepShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section id="billing-step" aria-labelledby="billing-step-title" className="scroll-mt-24 rounded-lg bg-surface-raised/60 p-2 ring-1 ring-line motion-safe:animate-[usage-in_260ms_cubic-bezier(0.16,1,0.3,1)_both]">
      <div className="rounded-md border border-line bg-surface p-5 shadow-e1 sm:p-6">
        <h2 id="billing-step-title" className="text-lg font-medium tracking-[-0.02em]">
          {title}
        </h2>
        {children}
      </div>
    </section>
  );
}

const backLink = (
  <Link href="/app/billing" className={buttonClasses("ghost", "sm")}>
    Back to plans
  </Link>
);

export function ChoosePlanStep({ planId, onTrial, error }: { planId: PaidPlanId; onTrial: boolean; error: string | null }) {
  const plan = getPlan(planId);
  if (plan.pricing.kind !== "paid") return null;
  return (
    <StepShell title={`Choose ${plan.name}`}>
      <p className="mt-2 flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
        <span className="text-2xl font-medium tracking-[-0.02em] tabular">{formatUsd(plan.pricing.monthlyCents)}</span>
        <span className="text-sm text-ink-3">a month, plus applicable tax, calculated at checkout</span>
      </p>
      <ul className="mt-4 grid gap-1.5 text-sm text-ink-2 tabular">
        <li className="font-medium text-ink">{sessionsLine(plan)}</li>
        <li>
          {plan.limits.sandboxHours} sandbox {plan.limits.sandboxHours === 1 ? "hour" : "hours"} a month
        </li>
        <li>{plan.limits.seats === 1 ? "1 seat" : `${plan.limits.seats} seats`}</li>
      </ul>
      <p className="mt-4 text-sm leading-relaxed text-ink-2">
        Pay in US dollars or your own currency: Dodo Payments shows the exact amount before you pay. Another currency adds its conversion fee of up to 4%.
      </p>
      {onTrial ? (
        <p className="mt-4 text-sm text-ink">
          <span className="font-medium">Billing starts today, and your remaining trial days end now.</span> Your projects and usage history stay as they are.
        </p>
      ) : null}
      {error ? (
        <div className="mt-4">
          <Notice tone="warning">{error}</Notice>
        </div>
      ) : null}
      <form action={startCheckoutAction} className="mt-5 grid gap-4">
        <input type="hidden" name="plan" value={planId} />
        <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-sm border border-line bg-canvas-2 p-4 text-sm leading-relaxed text-ink">
          <input type="checkbox" name="consent" value="yes" required className="mt-0.5 size-5 shrink-0 accent-[var(--color-accent)]" />
          <span>{checkoutConsentText(planId, onTrial)}</span>
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <BillingSubmit label="Continue to secure checkout" pending="Opening checkout…" leaves />
          {backLink}
        </div>
      </form>
      <p className="mt-4 text-xs leading-relaxed text-ink-3">
        Checkout opens on Dodo Payments, which takes the payment as Farbaek&apos;s merchant of record. Your plan changes once Dodo Payments confirms it, usually within a minute.
      </p>
    </StepShell>
  );
}

export function ChangePlanStep({ preview, error }: { preview: PlanChangePreview | null; error: string | null }) {
  if (!preview) {
    return (
      <StepShell title="Switch plans">
        <div className="mt-3">
          <Notice tone="warning">{error ?? "That plan change couldn't be prepared. Nothing changed."}</Notice>
        </div>
        <div className="mt-4">{backLink}</div>
      </StepShell>
    );
  }
  const to = getPlan(preview.to);
  const from = getPlan(preview.from);
  const monthly = to.pricing.kind === "paid" ? formatUsd(to.pricing.monthlyCents) : "";
  const upgrade = preview.direction === "upgrade";
  return (
    <StepShell title={`Switch to ${to.name}`}>
      {upgrade ? (
        <p className="mt-2 text-sm leading-relaxed text-ink">
          {preview.amountCents !== null && preview.currency ? (
            <>
              Dodo Payments charges <span className="font-medium tabular">{formatMinorUnits(preview.amountCents, preview.currency)}</span> today for the rest of this period,
            </>
          ) : (
            <>Dodo Payments charges the difference for the rest of this period today,</>
          )}{" "}
          then {monthly} a month, plus applicable tax. {to.name}&apos;s limits apply as soon as the payment goes through.
        </p>
      ) : (
        <p className="mt-2 text-sm leading-relaxed text-ink">
          You keep {from.name} until{" "}
          {preview.effectiveAt ? <LocalTime iso={preview.effectiveAt.toISOString()} /> : "the end of this period"}, then move to {to.name} at {monthly} a month. Nothing extra is
          charged. Projects and data over {to.name}&apos;s limits are kept; you can&apos;t add more until you&apos;re under them.
        </p>
      )}
      {error ? (
        <div className="mt-4">
          <Notice tone="warning">{error}</Notice>
        </div>
      ) : null}
      <form action={changePlanAction} className="mt-5 flex flex-wrap items-center gap-2">
        <input type="hidden" name="plan" value={preview.to} />
        <BillingSubmit label={upgrade ? `Switch to ${to.name} now` : `Switch to ${to.name} at period end`} pending="Switching…" />
        {backLink}
      </form>
    </StepShell>
  );
}

export function CancelStep({ subscription, error }: { subscription: NonNullable<BillingView["subscription"]>; error: string | null }) {
  return (
    <StepShell title={`Cancel ${subscription.planName}`}>
      <p className="mt-2 text-sm leading-relaxed text-ink">
        {subscription.planName} keeps working until{" "}
        <span className="font-medium">{subscription.paidThrough ? <LocalTime iso={subscription.paidThrough} /> : "the end of the period you paid for"}</span>. Then this workspace
        moves to Free and nothing more is charged. Your projects and data stay; anything over Free&apos;s limits is kept, and you can choose a plan again at any time.
      </p>
      {error ? (
        <div className="mt-4">
          <Notice tone="warning">{error}</Notice>
        </div>
      ) : null}
      <form action={cancelPlanAction} className="mt-5 flex flex-wrap items-center gap-2">
        <BillingSubmit label="Cancel at the end of the period" pending="Cancelling…" tone="danger" />
        <Link href="/app/billing" className={buttonClasses("secondary", "sm")}>
          Keep {subscription.planName}
        </Link>
      </form>
    </StepShell>
  );
}

const STATE_LINES = {
  active: { icon: CheckCircleIcon, tone: "text-verified", label: "Active" },
  past_due: { icon: WarningIcon, tone: "text-approval", label: "Payment due" },
  cancellation_scheduled: { icon: CalendarXIcon, tone: "text-ink-2", label: "Cancelled" },
  suspended: { icon: PauseCircleIcon, tone: "text-failed", label: "Paused" },
} as const;

/** The subscription inside the Current plan card: its state in words with an icon, its date, and what an owner or admin can do. */
export function SubscriptionSummary({ subscription, canManage }: { subscription: NonNullable<BillingView["subscription"]>; canManage: boolean }) {
  const line = STATE_LINES[subscription.state as keyof typeof STATE_LINES] ?? STATE_LINES.active;
  const StateIcon = line.icon;
  const date = subscription.paidThrough ? <LocalTime iso={subscription.paidThrough} /> : null;
  return (
    <div className="mt-4 grid gap-4">
      <p className="flex items-start gap-2 text-sm text-ink">
        <StateIcon size={18} weight="bold" className={`mt-px shrink-0 ${line.tone}`} aria-hidden />
        <span>
          <span className="font-medium">{line.label}.</span>{" "}
          {subscription.state === "active" ? <>Renews {date ?? "each month"}.</> : null}
          {subscription.state === "cancellation_scheduled" ? <>Runs until {date ?? "the end of the period"}, then this workspace moves to Free.</> : null}
          {subscription.state === "past_due" ? <>The last payment didn&apos;t go through. Paid features keep working while you update your payment method.</> : null}
          {subscription.state === "suspended"
            ? subscription.suspendedReason === "paused"
              ? <>The subscription is paused, so paid features are paused too. Your data is kept.</>
              : <>Paid features are paused until a payment goes through. Your data is kept, and exports, billing and safety controls still work.</>
            : null}
        </span>
      </p>
      {canManage ? (
        <div className="flex flex-wrap gap-2">
          {subscription.hasCustomer ? (
            <form action={openPortalAction}>
              <BillingSubmit label={subscription.state === "past_due" || subscription.state === "suspended" ? "Update payment method" : "Payment method and invoices"} pending="Opening…" tone="secondary" />
            </form>
          ) : null}
          {subscription.state === "cancellation_scheduled" ? (
            <form action={resumePlanAction}>
              <BillingSubmit label={`Keep ${subscription.planName}`} pending="Keeping…" />
            </form>
          ) : (
            <Link href="/app/billing?cancel=1#billing-step" className={buttonClasses("ghost", "sm")}>
              Cancel plan
            </Link>
          )}
        </div>
      ) : (
        <p className="text-xs text-ink-3">Only the workspace&apos;s owners and admins change its plan or payment method.</p>
      )}
      <p className="flex items-center gap-2 border-t border-line pt-4 text-sm text-ink-3">
        <CreditCardIcon size={18} aria-hidden /> Invoices and receipts are in Dodo Payments&apos; portal.
      </p>
    </div>
  );
}
