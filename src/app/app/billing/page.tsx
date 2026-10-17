import { CheckIcon, ReceiptIcon } from "@phosphor-icons/react/ssr";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Card, Notice, PageHeader, UsageMeter } from "@/components/app/primitives";
import { LocalTime } from "@/components/ui/local-time";
import { CREDIT_COSTS } from "@/config/credits";
import { FEATURE_LABELS, SELF_SERVE_PLANS, TRIAL, formatUsd, getPlan } from "@/core/billing/catalog";
import { loadAppContext } from "@/server/workspace/context";
import { loadUsageSummary } from "@/server/workspace/usage-summary";

export const metadata: Metadata = { title: "Billing and usage" };

const dateFmt = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

export default async function BillingPage() {
  const ctx = await loadAppContext();
  if (!ctx?.current) notFound();
  const ws = ctx.current;
  const usage = await loadUsageSummary(ctx, ws);
  const plan = getPlan(ws.plan.planId);
  const limits = ws.plan.limits;
  const periodLabel =
    usage.period.kind === "trial"
      ? `For the whole trial, ${dateFmt(usage.period.start)} to ${dateFmt(usage.period.end)} (UTC).`
      : `This month, ${dateFmt(usage.period.start)} to ${dateFmt(new Date(usage.period.end.getTime() - 1))} (UTC).`;

  return (
    <div className="grid gap-8">
      <PageHeader title="Billing and usage" description="Your plan, its limits and what this workspace has used. Usage comes from your records." />

      <Notice tone="warning">
        Payments aren&apos;t connected yet, so no plan can be bought and nothing is ever charged. Paid plans open once checkout is live and
        verified.
      </Notice>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] lg:items-start">
        <Card>
          <p className="text-sm text-ink-2">Current plan</p>
          <p className="mt-1 text-2xl font-medium tracking-[-0.02em]">
            {plan.name}
            {ws.plan.source === "trial" ? " trial" : ""}
          </p>
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
            <p className="mt-3 text-sm text-ink-2">Trials are one per person. This workspace started on Free.</p>
          )}
          {ws.plan.source === "trial" ? (
            <p className="mt-3 text-xs text-ink-3">
              Trial caps: {TRIAL.limits.seats} seats, {TRIAL.limits.agents} agents, {TRIAL.limits.integrations} integrations, {TRIAL.limits.aiCreditsTotal} AI credits.
            </p>
          ) : null}
          <div className="mt-5 flex items-center gap-2 border-t border-line pt-4 text-sm text-ink-3">
            <ReceiptIcon size={18} aria-hidden /> No invoices. Payments aren&apos;t connected.
          </div>
        </Card>

        <Card>
          <h2 className="text-lg font-medium">Usage</h2>
          <p className="mt-1 text-xs text-ink-3">{periodLabel}</p>
          <div className="mt-5 grid gap-5">
            <UsageMeter label="Governed evaluations" used={usage.evaluations} limit={limits.evaluationsPerMonth} detail="Blocked actions count. Retries with the same key count once." reached="Limit reached. New governed actions pause until the next period or an upgrade; exports, billing and emergency pause keep working." />
            <UsageMeter label="Projects" used={usage.projects.length} limit={limits.workspaces} detail="Active projects in this workspace." reached="Project limit reached. Archive a project or choose a bigger plan to add another." />
            <UsageMeter label="Seats" used={usage.members} limit={limits.seats} detail="People in this workspace." reached="Seat limit reached. Adding people needs a bigger plan." />
            {usage.aiCredits === null ? (
              <div>
                <div className="flex items-baseline justify-between gap-3">
                  <p className="text-sm font-medium">AI credits</p>
                  <p className="text-sm text-ink-3">Unavailable</p>
                </div>
                <p className="mt-1.5 text-xs text-ink-3">AI credit usage couldn&apos;t be read, so AI drafting is paused until it can be.</p>
              </div>
            ) : (
              <UsageMeter
                label="AI credits"
                used={usage.aiCredits}
                limit={limits.aiCreditsPerMonth}
                detail={`Drafting a contract uses ${CREDIT_COSTS.contract_draft} credit and proposing a change uses ${CREDIT_COSTS.change_proposal}. Calls that return nothing usable are refunded.`}
                reached="AI credits used up. AI drafting pauses until the allowance resets or you upgrade. Writing contracts yourself keeps working."
              />
            )}
            <UsageMeter label="Registered agents" used={0} limit={limits.agents} detail="Agents arrive in Stage 4." />
            <UsageMeter label="Integrations" used={0} limit={limits.integrations} detail="None connected. GitHub import isn't built yet; projects import files from a folder instead." />
          </div>
        </Card>
      </div>

      <section aria-labelledby="plans-heading" className="grid gap-4">
        <h2 id="plans-heading" className="text-lg font-medium">
          Plans
        </h2>
        <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {SELF_SERVE_PLANS.map((p) => {
            const isCurrent = p.id === ws.plan.planId && ws.plan.source !== "trial";
            return (
              <li key={p.id} className={`flex flex-col rounded-md border bg-surface p-5 shadow-e1 ${isCurrent ? "border-accent/50" : "border-line"}`}>
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium">{p.name}</p>
                  {isCurrent ? <span className="rounded-full bg-accent/[0.08] px-2.5 py-0.5 text-xs font-medium text-accent">Current</span> : null}
                </div>
                <p className="mt-2 text-2xl font-medium tracking-[-0.02em] tabular">
                  {p.pricing.kind === "paid" ? formatUsd(p.pricing.monthlyCents) : "$0"}
                  <span className="ml-1 text-sm font-normal text-ink-3">{p.pricing.kind === "paid" ? "per month" : "forever"}</span>
                </p>
                <ul className="mt-4 grid gap-1.5 text-sm text-ink-2">
                  {p.features.slice(-3).map((f) => (
                    <li key={f} className="flex gap-2">
                      <CheckIcon size={15} weight="bold" className="mt-0.5 shrink-0 text-verified" aria-hidden />
                      {FEATURE_LABELS[f]}
                    </li>
                  ))}
                </ul>
                <p className="mt-auto pt-5">
                  <span
                    className="block rounded-full border border-dashed border-line-strong/50 px-3 py-2 text-center text-xs text-ink-3"
                  >
                    {isCurrent ? "Your current plan" : p.pricing.kind === "paid" ? "Unavailable until payments open" : "Available after the trial"}
                  </span>
                </p>
              </li>
            );
          })}
        </ul>
        <p className="text-xs text-ink-3">Prices in USD. Applicable taxes are calculated at checkout once payments open.</p>
      </section>
    </div>
  );
}
