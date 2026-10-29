import { ReceiptIcon } from "@phosphor-icons/react/ssr";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, Notice, PageHeader, UsageMeter } from "@/components/app/primitives";
import { LiveRefresh } from "@/components/app/live-refresh";
import { LocalTime } from "@/components/ui/local-time";
import { buttonClasses } from "@/components/ui/button";
import { WalletCard } from "@/components/app/wallet-card";
import { sessionsLine } from "@/components/pricing/pricing-plans";
import { CancelStep, ChangePlanStep, ChoosePlanStep, SubscriptionSummary } from "@/components/billing/billing-steps";
import { TopupCard, TopupStep } from "@/components/billing/topup-card";
import { isTopupPack } from "@/core/billing/topups";
import { topupErrorMessage } from "@/server/billing/topups";
import { SELF_SERVE_PLANS, TRIAL, getPlan, priceWords, yearlyVersionOf } from "@/core/billing/catalog";
import { isPaidPlanId, planChangeDirection } from "@/core/billing/provider-state";
import { billingDeps } from "@/server/billing/wiring";
import { billingErrorMessage, previewPlanChange } from "@/server/billing/use-cases";
import { loadBillingView } from "@/server/billing/view";
import { loadAppContext } from "@/server/workspace/context";
import { MANAGER_ROLES } from "@/server/workspace/types";
import { UsageMeterList } from "@/components/app/usage-meters";
import { loadUsageMeters, loadUsageSummary } from "@/server/workspace/usage-summary";

export const metadata: Metadata = { title: "Billing and usage" };

type Search = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function BillingPage({ searchParams }: { searchParams: Promise<Search> }) {
  const ctx = await loadAppContext();
  if (!ctx?.current) notFound();
  const ws = ctx.current;
  const sp = await searchParams;
  const [usage, meters, agents, billing] = await Promise.all([
    loadUsageSummary(ctx, ws),
    loadUsageMeters(ctx, ws),
    ctx.reader.listAgents(ws.id),
    loadBillingView(ws.id, ctx.mode === "demo"),
  ]);
  const activeAgents = agents.filter((a) => !a.revokedAt).length;
  const plan = getPlan(ws.plan.planId);
  const limits = ws.plan.limits;
  const canManage = Boolean(ctx.role && MANAGER_ROLES.includes(ctx.role)) && ctx.writes.enabled;
  const onTrial = ws.plan.source === "trial";
  const sub = billing.subscription;
  const error = billingErrorMessage(one(sp.error));
  const done = one(sp.done);
  const donePlan = one(sp.plan);

  // The one step in progress, from the address: choosing a plan, switching, or cancelling.
  const choose = one(sp.choose);
  const change = one(sp.change);
  const step =
    billing.open && canManage
      ? !sub && isPaidPlanId(choose)
        ? { kind: "choose" as const, planId: choose }
        : sub && isPaidPlanId(change) && change !== sub.planId
          ? { kind: "change" as const, preview: await previewPlanChange(billingDeps(), { id: ws.id, onTrial }, { userId: ctx.user.id, email: ctx.user.email, role: ctx.role }, change) }
          : sub && one(sp.cancel) === "1" && sub.state !== "cancellation_scheduled"
            ? { kind: "cancel" as const }
            : sub && billing.topups && isTopupPack(Number(one(sp.topup)))
              ? { kind: "topup" as const, pack: Number(one(sp.topup)) as 1000 | 2500 | 5000 }
              : null
      : null;
  const topupError = topupErrorMessage(one(sp.topup_error));
  // Back from a top-up checkout: the page refreshes itself until the payment's webhook has added the usage.
  const topupReturned = billing.open && one(sp.topup) === "done";
  // Back from checkout: the page refreshes itself until the webhook has applied the plan.
  const returned = billing.open && !sub && one(sp.checkout) === "done";

  return (
    <div className="grid gap-8">
      <PageHeader title="Billing and usage" description="Your plan, its limits and what this workspace has used. Usage comes from your records." />

      {!billing.open ? (
        <Notice tone="warning">
          Payments aren&apos;t connected yet, so no plan can be bought and nothing is ever charged. Paid plans open once checkout is live and verified.
        </Notice>
      ) : billing.mode === "test" ? (
        <Notice>
          Payments are in test mode for this workspace. Checkout takes Dodo Payments&apos; test cards only, and nothing real is charged.
        </Notice>
      ) : null}

      {error && !step ? <Notice tone="warning">{error}</Notice> : null}
      {done === "cancelled" && sub ? (
        <Notice>
          {sub.planName} is cancelled. It keeps working until {sub.paidThrough ? <LocalTime iso={sub.paidThrough} /> : "the end of the period"}, then this workspace moves to Free.
        </Notice>
      ) : null}
      {done === "resumed" && sub ? <Notice>{sub.planName} continues and renews as before.</Notice> : null}
      {done === "upgraded" && isPaidPlanId(donePlan) ? <Notice>Switching to {getPlan(donePlan).name}. Its limits apply as soon as Dodo Payments confirms the payment.</Notice> : null}
      {done === "downgrade_scheduled" && isPaidPlanId(donePlan) ? <Notice>You&apos;ll move to {getPlan(donePlan).name} when this period ends. Until then nothing changes.</Notice> : null}
      {returned ? (
        <Notice>
          Waiting for Dodo Payments to confirm your checkout. This page updates by itself, usually within a minute. If you closed the checkout, nothing was charged.
          <LiveRefresh active />
        </Notice>
      ) : billing.openCheckout && !step ? (
        <Notice>
          A checkout for {getPlan(billing.openCheckout.planId).name} was started <LocalTime iso={billing.openCheckout.startedAt} /> and isn&apos;t confirmed. If you didn&apos;t finish it,
          nothing was charged, and you can choose a plan again below.
        </Notice>
      ) : null}

      {step?.kind === "choose" ? <ChoosePlanStep planId={step.planId} onTrial={onTrial} error={error} /> : null}
      {step?.kind === "change" ? <ChangePlanStep preview={step.preview.ok ? step.preview.value : null} error={step.preview.ok ? error : step.preview.message} /> : null}
      {step?.kind === "cancel" && sub ? <CancelStep subscription={sub} error={error} /> : null}
      {step?.kind === "topup" && sub ? <TopupStep planId={sub.planId} pack={step.pack} error={topupError} /> : null}
      {done === "topup_cap" ? <Notice>Top-up limit saved.</Notice> : null}
      {topupReturned ? (
        <Notice>
          Waiting for Dodo Payments to confirm your top-up. It shows in the usage wallet as soon as it does, usually within a minute. If you closed the checkout, nothing was charged.
          <LiveRefresh active />
        </Notice>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] lg:items-start">
        <Card>
          <p className="text-sm text-ink-2">Current plan</p>
          <p className="mt-1 text-2xl font-medium tracking-[-0.02em]">
            {plan.name}
            {ws.plan.source === "trial" ? " trial" : ""}
          </p>
          {sub ? (
            <SubscriptionSummary subscription={sub} canManage={canManage} />
          ) : (
            <>
              {ws.trial ? (
                <p className="mt-3 text-sm leading-relaxed text-ink-2">
                  {ws.trial.phase.phase === "active" ? (
                    <>
                      {ws.trial.phase.daysRemaining} {ws.trial.phase.daysRemaining === 1 ? "day" : "days"} left. Ends <LocalTime iso={ws.trial.endsAt} />. Then
                      this workspace moves to Free automatically and nothing is charged.
                    </>
                  ) : (
                    <>
                      Your trial ended <LocalTime iso={ws.trial.endsAt} />. You&apos;re on Free and nothing was charged.
                    </>
                  )}
                </p>
              ) : (
                <p className="mt-3 text-sm leading-relaxed text-ink-2">
                  {ws.trialWithheld === "disposable_address"
                    ? "This workspace started on Free. Trials need a lasting email address, and yours is from a disposable-email service. Sign in with another address to start one."
                    : ws.trialWithheld === "address_used"
                      ? "This workspace started on Free, since your email address has already had its trial. Trials are one per address."
                      : "Trials are one per person. This workspace started on Free."}
                </p>
              )}
              {ws.plan.source === "trial" ? (
                <p className="mt-3 text-xs text-ink-3">
                  Trial caps: {TRIAL.limits.seats} seats, {TRIAL.limits.agents} agents and {TRIAL.limits.integrations} integration{TRIAL.limits.integrations === 1 ? "" : "s"}. AI usage and governed evaluations are counted across the whole trial.
                </p>
              ) : null}
              <div className="mt-5 flex items-center gap-2 border-t border-line pt-4 text-sm text-ink-3">
                <ReceiptIcon size={18} aria-hidden /> {billing.open ? "No invoices yet. They appear in Dodo Payments' portal after a checkout." : "No invoices. Payments aren't connected."}
              </div>
            </>
          )}
        </Card>

        <Card>
          <h2 className="text-lg font-medium">Usage</h2>
          <p className="mt-1 text-sm text-ink-2">How much of each limit this workspace has used, and when it resets.</p>
          <div className="mt-6">
            <UsageMeterList meters={meters} detailed />
          </div>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
        <WalletCard wallet={usage.wallet} paid={ws.plan.source === "paid"} />
        <Card>
          <h2 className="text-lg font-medium">Workspace</h2>
          <div className="mt-5 grid gap-6 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
            <UsageMeter label="Projects" used={usage.projects.length} limit={limits.workspaces} detail="Active projects in this workspace." reached="Project limit reached. Archive a project or choose a bigger plan to add another." />
            <UsageMeter label="Seats" used={usage.members} limit={limits.seats} detail="People in this workspace." reached="Seat limit reached. Adding people needs a bigger plan." />
            <UsageMeter label="Registered agents" used={activeAgents} limit={limits.agents} detail="Desktop agents paired with this workspace and not revoked." />
            <UsageMeter label="Integrations" used={0} limit={limits.integrations} detail="None connected. Public GitHub repositories import without one, from Projects; private ones need a connection, which isn't available yet." />
          </div>
        </Card>
      </div>

      {sub && billing.topups && sub.state !== "suspended" ? (
        <TopupCard planId={sub.planId} planName={sub.planName} topups={billing.topups} canManage={canManage} error={step?.kind === "topup" ? null : topupError} />
      ) : null}

      <section aria-labelledby="plans-heading" className="grid gap-4">
        <h2 id="plans-heading" className="text-lg font-medium">
          Plans
        </h2>
        <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {SELF_SERVE_PLANS.map((p) => {
            const yearlyId = yearlyVersionOf(p.id);
            // Lite yearly and Maker yearly live on their monthly plan's card (ADR 0105).
            const onYearly = yearlyId !== null && sub?.planId === yearlyId;
            const isCurrent = sub ? p.id === sub.planId || onYearly : p.id === ws.plan.planId && ws.plan.source !== "trial";
            return (
              <li key={p.id} className={`flex flex-col rounded-md border bg-surface p-5 shadow-e1 ${isCurrent ? "border-accent/50" : "border-line"}`}>
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium">{p.name}</p>
                  {isCurrent ? <span className="rounded-full bg-accent/[0.08] px-2.5 py-0.5 text-xs font-medium text-accent">{onYearly ? "Current, yearly" : "Current"}</span> : null}
                </div>
                <p className="mt-2 text-2xl font-medium tracking-[-0.02em] tabular">
                  {priceWords(p).price}
                  <span className="ml-1 text-sm font-normal text-ink-3">{priceWords(p).per}</span>
                </p>
                {priceWords(p).billed ? <p className="mt-1 text-xs text-ink-3 tabular">{priceWords(p).billed}</p> : null}
                <ul className="mt-4 grid gap-1.5 text-sm text-ink-2 tabular">
                  <li className="font-medium text-ink">{sessionsLine(p)}</li>
                  <li>
                    {p.limits.sandboxHours} sandbox {p.limits.sandboxHours === 1 ? "hour" : "hours"}
                  </li>
                  <li>{p.limits.seats === 1 ? "1 seat" : `${p.limits.seats} seats`}</li>
                </ul>
                <div className="mt-auto grid gap-2 pt-5">
                  <PlanAction planId={p.id} isCurrent={isCurrent && !onYearly} open={billing.open} canManage={canManage} currentPaid={sub?.planId ?? null} cancelling={sub?.state === "cancellation_scheduled"} />
                  {yearlyId && billing.open && canManage ? (
                    <PlanAction planId={yearlyId} isCurrent={onYearly} open={billing.open} canManage={canManage} currentPaid={sub?.planId ?? null} cancelling={sub?.state === "cancellation_scheduled"} />
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
        <p className="text-xs text-ink-3">Prices in USD. {billing.open ? "At checkout you can pay in your own currency for a conversion fee of up to 4%, and tax is added there." : "Applicable taxes are calculated at checkout once payments open."}</p>
      </section>
    </div>
  );
}

function Unavailable({ children }: { children: string }) {
  return <span className="block rounded-full border border-dashed border-line-strong/50 px-3 py-2 text-center text-xs text-ink-3">{children}</span>;
}

/** What a plan card offers: a real next step when payments are open to this workspace, otherwise the honest reason there isn't one. */
function PlanAction({ planId, isCurrent, open, canManage, currentPaid, cancelling }: { planId: string; isCurrent: boolean; open: boolean; canManage: boolean; currentPaid: string | null; cancelling: boolean }) {
  if (isCurrent) return <Unavailable>Your current plan</Unavailable>;
  if (planId === "free") return <Unavailable>{currentPaid ? "Cancel a plan to move to Free" : "Available after the trial"}</Unavailable>;
  if (!open) return <Unavailable>Unavailable until payments open</Unavailable>;
  if (!canManage) return <Unavailable>Owners and admins choose plans</Unavailable>;
  const name = getPlan(planId as Parameters<typeof getPlan>[0]).name;
  if (currentPaid && isPaidPlanId(currentPaid) && isPaidPlanId(planId)) {
    if (cancelling) return <Unavailable>Keep your plan to switch</Unavailable>;
    const direction = planChangeDirection(currentPaid, planId);
    return (
      <Link href={`/app/billing?change=${planId}#billing-step`} className={buttonClasses(direction === "upgrade" ? "primary" : "secondary", "sm", "w-full")}>
        {direction === "upgrade" ? `Upgrade to ${name}` : `Switch to ${name}`}
      </Link>
    );
  }
  return (
    <Link href={`/app/billing?choose=${planId}#billing-step`} className={buttonClasses("primary", "sm", "w-full")}>
      Choose {name}
    </Link>
  );
}
