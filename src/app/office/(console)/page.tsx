import { CheckCircleIcon, CircleDashedIcon, HandWavingIcon } from "@phosphor-icons/react/ssr";
import type { Metadata } from "next";
import Link from "next/link";
import { Card, PageHeader, StatTile } from "@/components/app/primitives";
import { deploymentConnections, loadOverview } from "@/server/admin/data";
import { usd } from "@/server/admin/summaries";
import { requireStaff } from "@/server/office/access";

export const metadata: Metadata = { title: "Overview" };

const number = new Intl.NumberFormat("en-US");
const monthName = (iso: string) => new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", timeZone: "UTC" }).format(new Date(iso));

/** Money that needs payments connected. Shown as unavailable, never as zero (billing stays not_connected until go-live). */
const BILLING_TILES = ["Monthly recurring revenue", "Trial to paid", "Churn", "Gross margin"] as const;

export default async function OfficeOverview({ searchParams }: { searchParams: Promise<{ welcome?: string }> }) {
  const staff = await requireStaff();
  const [o, { welcome }] = await Promise.all([loadOverview(staff.admin), searchParams]);
  const connections = deploymentConnections();
  const finishedShare = o.runs.lastWeek > 0 ? Math.round((o.runs.finished / o.runs.lastWeek) * 100) : null;

  return (
    <div className="grid gap-8">
      <PageHeader title="Overview" description="Every workspace on this deployment, read live with the server key. Nothing on this page changes data." />

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

      <section aria-label="This month's AI cost" className="grid gap-5 rounded-lg border border-line bg-surface p-6 shadow-e2 sm:p-8 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
        <div>
          <p className="text-sm text-ink-2">AI list cost since {monthName(o.aiCost.since)} (UTC), an estimate</p>
          <p className="mt-2 font-mono text-[clamp(2.5rem,6vw,4rem)] font-medium leading-none tracking-[-0.04em] tabular">{usd(o.aiCost.usd)}</p>
          <p className="mt-3 max-w-[60ch] text-sm leading-relaxed text-ink-2">
            From {number.format(o.aiCost.settledCalls)} settled AI calls at the providers&apos; list prices, before any discounts. Refunded calls aren&apos;t counted. It isn&apos;t yet
            reconciled with the providers&apos; invoices.
          </p>
        </div>
        <dl className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm md:text-right">
          <div>
            <dt className="text-ink-3">Paid workspaces</dt>
            <dd className="font-mono text-lg tabular">{number.format(o.workspaces.paid)}</dd>
          </div>
          <div>
            <dt className="text-ink-3">On a trial</dt>
            <dd className="font-mono text-lg tabular">{number.format(o.workspaces.onTrial)}</dd>
          </div>
        </dl>
      </section>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="People" value={`${number.format(o.people.total)}${o.people.capped ? "+" : ""}`} detail={`${number.format(o.people.newThisWeek)} signed up in the last 7 days.`} href="/people" />
        <StatTile
          label="Workspaces"
          value={number.format(o.workspaces.total)}
          detail={`${number.format(o.workspaces.trialsEndingSoon)} ${o.workspaces.trialsEndingSoon === 1 ? "trial ends" : "trials end"} within 3 days.`}
          href="/workspaces"
        />
        <StatTile
          label="Agent runs, 7 days"
          value={number.format(o.runs.lastWeek)}
          detail={finishedShare === null ? "No cloud runs this week." : finishedShare === 100 ? "All of them finished." : `${finishedShare}% finished; the rest stopped, were cancelled or are still going.`}
          href="/activity"
        />
        <StatTile label="Security checks, 7 days" value={number.format(o.securityChecksLastWeek)} detail="Checks started on any project this week." href="/activity" />
      </div>

      <section aria-labelledby="billing-title" className="grid gap-3">
        <h2 id="billing-title" className="text-lg font-medium">
          Revenue
        </h2>
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {BILLING_TILES.map((label) => (
            <li key={label} className="rounded-md border border-dashed border-line-strong/40 bg-surface px-5 py-4">
              <p className="text-sm text-ink-2">{label}</p>
              <p className="mt-2 flex items-center gap-1.5 text-sm font-medium text-ink-3">
                <CircleDashedIcon size={16} aria-hidden /> Billing not connected
              </p>
            </li>
          ))}
        </ul>
        <p className="text-xs text-ink-3">These appear once payments go live and real payments exist. Until then there&apos;s nothing honest to show.</p>
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <Card>
          <h2 className="text-lg font-medium">Work in Farbaek</h2>
          <dl className="mt-4 grid gap-3 text-sm">
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-ink-2">Active projects</dt>
              <dd className="font-mono tabular">{number.format(o.projects)}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-ink-2">Tasks</dt>
              <dd className="font-mono tabular">{number.format(o.tasks)}</dd>
            </div>
          </dl>
        </Card>

        <Card>
          <h2 className="text-lg font-medium">Connections</h2>
          <p className="mt-1 text-sm text-ink-2">What this deployment can do. Names only: no key or secret is ever shown here.</p>
          <ul className="mt-4 grid gap-3">
            {connections.map((c) => (
              <li key={c.name} className="flex items-start gap-3 text-sm">
                {c.on ? (
                  <CheckCircleIcon size={18} weight="fill" className="mt-0.5 shrink-0 text-verified" aria-label="On" />
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
    </div>
  );
}
