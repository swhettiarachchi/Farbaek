import { ReceiptIcon } from "@phosphor-icons/react/ssr";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Card, Notice, PageHeader, UsageMeter } from "@/components/app/primitives";
import { LocalTime } from "@/components/ui/local-time";
import { WalletCard } from "@/components/app/wallet-card";
import { sessionsLine } from "@/components/pricing/pricing-plans";
import { SELF_SERVE_PLANS, TRIAL, formatUsd, getPlan } from "@/core/billing/catalog";
import { loadAppContext } from "@/server/workspace/context";
import { UsageMeterList } from "@/components/app/usage-meters";
import { loadUsageMeters, loadUsageSummary } from "@/server/workspace/usage-summary";

export const metadata: Metadata = { title: "Billing and usage" };

export default async function BillingPage() {
  const ctx = await loadAppContext();
  if (!ctx?.current) notFound();
  const ws = ctx.current;
  const [usage, meters, agents] = await Promise.all([loadUsageSummary(ctx, ws), loadUsageMeters(ctx, ws), ctx.reader.listAgents(ws.id)]);
  const activeAgents = agents.filter((a) => !a.revokedAt).length;
  const plan = getPlan(ws.plan.planId);
  const limits = ws.plan.limits;

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
              Trial caps: {TRIAL.limits.seats} seats, {TRIAL.limits.agents} agents and {TRIAL.limits.integrations} integration{TRIAL.limits.integrations === 1 ? "" : "s"}. AI usage and governed evaluations are counted across the whole trial.
            </p>
          ) : null}
          <div className="mt-5 flex items-center gap-2 border-t border-line pt-4 text-sm text-ink-3">
            <ReceiptIcon size={18} aria-hidden /> No invoices. Payments aren&apos;t connected.
          </div>
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
                <ul className="mt-4 grid gap-1.5 text-sm text-ink-2 tabular">
                  <li className="font-medium text-ink">{sessionsLine(p)}</li>
                  <li>
                    {p.limits.sandboxHours} sandbox {p.limits.sandboxHours === 1 ? "hour" : "hours"}
                  </li>
                  <li>{p.limits.seats === 1 ? "1 seat" : `${p.limits.seats} seats`}</li>
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
