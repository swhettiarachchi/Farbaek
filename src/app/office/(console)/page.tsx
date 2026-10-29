import { CheckCircleIcon, CircleDashedIcon, HandWavingIcon, ProhibitIcon, StopCircleIcon, WarningCircleIcon, XCircleIcon } from "@phosphor-icons/react/ssr";
import type { Metadata } from "next";
import Link from "next/link";
import { AdminTable, Cell } from "@/components/admin/table";
import { Card, Notice, PageHeader } from "@/components/app/primitives";
import { KpiTile, Sparkline } from "@/components/office/kpi";
import { deploymentConnections, loadOverview } from "@/server/admin/data";
import { usd } from "@/server/admin/summaries";
import { requireStaff } from "@/server/office/access";
import { loadOfficeMetrics } from "@/server/office/metrics";
import { loadRevenue } from "@/server/office/revenue-data";
import { paymentsLiveSince, refreshPlatformState } from "@/server/platform/state";
import { ECONOMICS } from "@/core/billing/allowance";

export const metadata: Metadata = { title: "Overview" };

const number = new Intl.NumberFormat("en-US");
const monthName = (iso: string) => new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", timeZone: "UTC" }).format(new Date(iso));

/** Shown as unavailable, never as zero, while live payments are off (ADR 0104). */
const BILLING_TILES = ["Monthly recurring revenue", "Top-ups this month", "Trial to paid", "Margin this month"] as const;

const dollars = (cents: number) => usd(cents / 100);
const percent = (share: number) => `${Math.round(share * 100)}%`;

export default async function OfficeOverview({ searchParams }: { searchParams: Promise<{ welcome?: string }> }) {
  const staff = await requireStaff();
  const [o, m, { welcome }] = await Promise.all([loadOverview(staff.admin), loadOfficeMetrics(staff.admin), searchParams, refreshPlatformState(true)]);
  // Revenue sets this month's money against this month's AI list cost (ADR 0106).
  const revenue = await loadRevenue(staff.admin, o.aiCost.usd);
  const liveSince = paymentsLiveSince();
  const target = ECONOMICS.margin;
  const connections = deploymentConnections();
  const aiWeek = m.aiUsdByDay.slice(-7).reduce((a, b) => a + b, 0);
  const trialsTotal = m.trials.active + m.trials.ended;
  const activeShare = trialsTotal > 0 ? (m.trials.active / trialsTotal) * 100 : 0;

  return (
    <div className="grid gap-8">
      <PageHeader title="Overview" description="Farbaek right now, read live with the server key. Nothing on this page changes data." />

      {welcome ? (
        <p className="flex items-start gap-3 rounded-md border border-accent/20 bg-accent/[0.05] px-5 py-4 text-sm">
          <HandWavingIcon size={20} className="mt-px shrink-0 text-accent" aria-hidden />
          <span>
            <span className="font-medium text-ink">You&apos;re in.</span>{" "}
            <span className="text-ink-2">
              Add a second authenticator on another device in{" "}
              <Link href="/security" className="text-accent underline-offset-4 hover:underline">
                My security
              </Link>
              , so a lost phone never locks you out.
            </span>
          </span>
        </p>
      ) : null}

      <section aria-label="This week" className="grid gap-4 sm:grid-cols-6">
        <KpiTile
          className="sm:col-span-3"
          label="Sign-ups, 7 days"
          value={number.format(m.signups.last7)}
          detail={`${number.format(m.signups.last30)} in 30 days, ${number.format(m.signups.total)} in all.`}
          trend={<Sparkline values={m.signups.byDay} label="Sign-ups per day" />}
          href="/people"
        />
        <KpiTile
          className="sm:col-span-3"
          label="AI cost, 7 days"
          value={usd(aiWeek)}
          detail="An estimate: providers' list prices, before discounts, not yet matched to invoices."
          trend={<Sparkline values={m.aiUsdByDay} label="AI list cost per day, US dollars" format={(v) => usd(v)} />}
        />
        <KpiTile
          className="sm:col-span-2"
          label="Active workspaces, 7 days"
          value={number.format(m.workspaces.active7)}
          detail={`Of ${number.format(m.workspaces.total)}. ${number.format(m.workspaces.new7)} new this week${m.workspaces.suspended ? `, ${m.workspaces.suspended} suspended` : ""}.`}
          href="/workspaces"
        />
        <KpiTile
          className="sm:col-span-2"
          label="Activation"
          value={m.activationRate === null ? "Not yet" : `${m.activationRate}%`}
          detail={
            m.activationRate === null
              ? "Needs workspaces at least 8 days old. Counts a plan approved, then a verified change or a published site, within a week."
              : `Of ${number.format(m.activation.cohort)} workspaces aged 8 to 60 days: a plan approved, then a verified change or a published site, within a week.`
          }
        />
        <KpiTile className="sm:col-span-2" label="Live sites" value={number.format(m.sites.live)} detail={m.sites.blocked ? `${m.sites.blocked} taken offline by Farbaek.` : "None taken offline."} href="/sites" />
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <Card>
          <h2 className="text-lg font-medium">Trials</h2>
          <p className="mt-1 text-sm text-ink-2">
            {number.format(m.trials.started30)} started in the last 30 days{m.trials.extended ? `, ${m.trials.extended} extended by Farbaek` : ""}.
          </p>
          {trialsTotal > 0 ? (
            <div className="mt-5">
              <div className="flex h-3 overflow-hidden rounded-full bg-surface-raised" role="img" aria-label={`${m.trials.active} active, ${m.trials.ended} ended`}>
                <span className="h-full bg-accent" style={{ width: `${activeShare}%` }} />
                <span className="h-full bg-[repeating-linear-gradient(135deg,var(--color-line-strong)_0_3px,transparent_3px_6px)]" style={{ width: `${100 - activeShare}%` }} />
              </div>
              <dl className="mt-3 grid grid-cols-3 gap-3 text-sm">
                <div>
                  <dt className="flex items-center gap-1.5 text-ink-3">
                    <span aria-hidden className="size-2.5 rounded-full bg-accent" /> Active
                  </dt>
                  <dd className="text-lg tabular">{number.format(m.trials.active)}</dd>
                </div>
                <div>
                  <dt className="flex items-center gap-1.5 text-ink-3">
                    <span aria-hidden className="size-2.5 rounded-full bg-[repeating-linear-gradient(135deg,var(--color-line-strong)_0_2px,transparent_2px_4px)] ring-1 ring-line-strong" /> Ended
                  </dt>
                  <dd className="text-lg tabular">{number.format(m.trials.ended)}</dd>
                </div>
                <div>
                  <dt className="text-ink-3">Became paid</dt>
                  <dd className="flex items-center gap-1 pt-1 text-xs text-ink-3">
                    <CircleDashedIcon size={14} aria-hidden /> Billing not connected
                  </dd>
                </div>
              </dl>
            </div>
          ) : (
            <p className="mt-4 text-sm text-ink-3">No trials yet. One starts with each person&apos;s first workspace.</p>
          )}
        </Card>

        <Card>
          <h2 className="text-lg font-medium">Agent runs, 7 days</h2>
          <p className="mt-1 text-[2rem] font-medium leading-none tracking-[-0.03em] tabular">{number.format(m.runs7.total)}</p>
          <ul className="mt-4 grid gap-2 text-sm">
            <li className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-2 text-ink-2">
                <CheckCircleIcon size={16} weight="fill" className="text-verified" aria-hidden /> Finished
              </span>
              <span className="tabular">{number.format(m.runs7.finished)}</span>
            </li>
            <li className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-2 text-ink-2">
                <XCircleIcon size={16} weight="fill" className="text-failed" aria-hidden /> Failed
              </span>
              <span className="tabular">{number.format(m.runs7.failed)}</span>
            </li>
            <li className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-2 text-ink-2">
                <StopCircleIcon size={16} weight="fill" className="text-ink-3" aria-hidden /> Stopped or interrupted
              </span>
              <span className="tabular">{number.format(m.runs7.stopped)}</span>
            </li>
          </ul>
        </Card>
      </div>

      <section aria-label="This month's AI cost" className="grid gap-5 rounded-lg border border-line bg-surface p-6 shadow-e2 sm:p-8 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
        <div>
          <p className="text-sm text-ink-2">AI list cost since {monthName(o.aiCost.since)} (UTC), an estimate</p>
          <p className="mt-2 text-[clamp(2.5rem,6vw,4rem)] font-medium leading-none tracking-[-0.04em] tabular">{usd(o.aiCost.usd)}</p>
          <p className="mt-3 max-w-[60ch] text-sm leading-relaxed text-ink-2">
            From {number.format(o.aiCost.settledCalls)} settled AI calls at the providers&apos; list prices, before any discounts. Refunded calls aren&apos;t counted.
          </p>
        </div>
        <dl className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm md:text-right">
          <div>
            <dt className="text-ink-3">Paid workspaces</dt>
            <dd className="text-lg tabular">{number.format(o.workspaces.paid)}</dd>
          </div>
          <div>
            <dt className="text-ink-3">On a trial</dt>
            <dd className="text-lg tabular">{number.format(o.workspaces.onTrial)}</dd>
          </div>
        </dl>
      </section>

      <section aria-labelledby="billing-title" className="grid gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 id="billing-title" className="text-lg font-medium">
            Revenue
          </h2>
          <Link href="/payments" className="inline-flex min-h-11 items-center text-sm text-accent underline-offset-4 hover:underline">
            Payments and webhooks
          </Link>
        </div>
        {!liveSince && (!revenue || revenue.payingWorkspaces === 0) ? (
          <>
            <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {BILLING_TILES.map((label) => (
                <li key={label} className="rounded-md border border-dashed border-line-strong/40 bg-surface px-5 py-4">
                  <p className="text-sm text-ink-2">{label}</p>
                  <p className="mt-2 flex items-center gap-1.5 text-sm font-medium text-ink-3">
                    <CircleDashedIcon size={16} aria-hidden /> Live payments are off
                  </p>
                </li>
              ))}
            </ul>
            <p className="text-xs text-ink-3">These appear once an owner turns live payments on in Payments. Test-mode payments are never counted.</p>
          </>
        ) : !revenue ? (
          <Notice tone="warning">The billing records couldn&apos;t be read just now, so no figure is shown. Reload to try again.</Notice>
        ) : (
          <>
            <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <li>
                <KpiTile
                  label="Monthly recurring revenue"
                  value={dollars(revenue.mrrCents)}
                  detail={`${number.format(revenue.payingWorkspaces)} paying ${revenue.payingWorkspaces === 1 ? "workspace" : "workspaces"}, at list price before tax. A yearly plan counts a twelfth.`}
                  className="h-full"
                />
              </li>
              <li>
                <KpiTile
                  label="Top-ups this month"
                  value={dollars(revenue.topupsCents)}
                  detail={`${number.format(revenue.topupsCount)} paid since ${monthName(o.aiCost.since)}.`}
                  className="h-full"
                />
              </li>
              <li>
                <KpiTile
                  label="Trial to paid"
                  value={revenue.trials.ended > 0 ? `${revenue.trials.converted} of ${revenue.trials.ended}` : "None yet"}
                  detail="Trials that ended in the last 90 days, and how many of those workspaces pay now."
                  className="h-full"
                />
              </li>
              <li>
                <KpiTile
                  label="Margin this month, estimated"
                  value={revenue.margin ? percent(revenue.margin.share) : "No revenue yet"}
                  trend={
                    revenue.margin ? (
                      revenue.margin.share >= target ? (
                        <CheckCircleIcon size={22} weight="fill" className="text-verified" aria-label={`At or above the ${percent(target)} target`} />
                      ) : (
                        <WarningCircleIcon size={22} weight="fill" className="text-approval" aria-label={`Below the ${percent(target)} target`} />
                      )
                    ) : null
                  }
                  detail={
                    revenue.margin
                      ? `${revenue.margin.share >= target ? "At or above" : "Below"} the ${percent(target)} target. ${dollars(revenue.margin.revenueCents)} in, less ${dollars(revenue.margin.feesCents)} of Dodo's worst-case fees and ${dollars(revenue.margin.aiCents)} of AI list cost, free and trial users included. Before fixed costs.`
                      : "Shown once a live plan or top-up is paid for."
                  }
                  className="h-full"
                />
              </li>
            </ul>
            {revenue.byPlan.length > 0 ? (
              <AdminTable caption="Paying workspaces by plan" columns={["Plan", "Workspaces", "A month, at list price"]}>
                {revenue.byPlan.map((p) => (
                  <tr key={p.planId} className="border-b border-line last:border-0">
                    <Cell>{p.name}</Cell>
                    <Cell mono>{number.format(p.workspaces)}</Cell>
                    <Cell mono>{dollars(p.monthlyCents)}</Cell>
                  </tr>
                ))}
              </AdminTable>
            ) : null}
            <p className="text-xs leading-relaxed text-ink-3">
              Estimates from Farbaek&apos;s own records: live plans and top-ups only. Dodo Payments adds tax and converts currencies, so its payouts are the exact figures.
              {revenue.cancellationsScheduled > 0 ? ` ${number.format(revenue.cancellationsScheduled)} set to cancel at the end of their period.` : ""}
              {revenue.pastDue > 0 ? ` ${number.format(revenue.pastDue)} with a payment overdue.` : ""}
            </p>
          </>
        )}
      </section>

      <Card>
        <h2 className="text-lg font-medium">Connections</h2>
        <p className="mt-1 text-sm text-ink-2">What this deployment can do. Names only: no key or secret is ever shown here.</p>
        <ul className="mt-4 grid gap-3 md:grid-cols-2">
          {connections.map((c) => (
            <li key={c.name} className="flex items-start gap-3 text-sm">
              {c.on ? (
                <CheckCircleIcon size={18} weight="fill" className="mt-0.5 shrink-0 text-verified" aria-label="On" />
              ) : c.detail.toLowerCase().includes("paused") ? (
                <ProhibitIcon size={18} weight="bold" className="mt-0.5 shrink-0 text-approval" aria-label="Paused" />
              ) : (
                <CircleDashedIcon size={18} className="mt-0.5 shrink-0 text-ink-3" aria-label="Off" />
              )}
              <span className="min-w-0">
                <span className="font-medium text-ink">{c.name}</span>
                <span className="block text-ink-2">{c.detail}</span>
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
