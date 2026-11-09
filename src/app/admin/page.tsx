import { PlugsConnectedIcon, SquaresFourIcon } from "@phosphor-icons/react/ssr";
import type { Metadata } from "next";
import { Card, CardTitle, PageHeader, StatTile } from "@/components/app/primitives";
import { StatusGlyph } from "@/components/ui/status-badge";
import { adminMetadata, requireAdmin } from "@/server/admin/access";
import { deploymentConnections, loadOverview } from "@/server/admin/data";
import { usd } from "@/server/admin/summaries";

export const generateMetadata = (): Promise<Metadata> => adminMetadata("Overview");

const number = new Intl.NumberFormat("en-US");
const monthName = (iso: string) => new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", timeZone: "UTC" }).format(new Date(iso));

export default async function AdminOverview() {
  const { admin } = await requireAdmin();
  const o = await loadOverview(admin);
  const connections = deploymentConnections();
  const finishedShare = o.runs.lastWeek > 0 ? Math.round((o.runs.finished / o.runs.lastWeek) * 100) : null;

  return (
    <div className="grid gap-8">
      <PageHeader title="Overview" description="Every workspace on this deployment, read live with the server key. Nothing on these pages changes data." />

      <section aria-label="This month's AI cost" className="grid gap-5 rounded-lg border border-line bg-surface p-6 shadow-e2 sm:p-8 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
        <div>
          <p className="text-sm text-ink-2">AI list cost since {monthName(o.aiCost.since)} (UTC)</p>
          <p className="mt-2 text-[clamp(2.5rem,6vw,4rem)] font-medium leading-none tracking-[-0.04em] tabular">{usd(o.aiCost.usd)}</p>
          <p className="mt-3 max-w-[60ch] text-sm leading-relaxed text-ink-2">
            From {number.format(o.aiCost.settledCalls)} settled AI calls at the providers&apos; list prices, before any discounts. Refunded calls aren&apos;t counted. Revenue
            and margin are on Office Space&apos;s overview.
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

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatTile
          label="People"
          value={`${number.format(o.people.total)}${o.people.capped ? "+" : ""}`}
          detail={`${number.format(o.people.newThisWeek)} signed up in the last 7 days.`}
          href="/admin/people"
        />
        <StatTile
          label="Workspaces"
          value={number.format(o.workspaces.total)}
          detail={`${number.format(o.workspaces.trialsEndingSoon)} ${o.workspaces.trialsEndingSoon === 1 ? "trial ends" : "trials end"} within 3 days.`}
          href="/admin/workspaces"
        />
        <StatTile
          label="Agent runs, 7 days"
          value={number.format(o.runs.lastWeek)}
          detail={
            finishedShare === null
              ? "No cloud runs this week."
              : finishedShare === 100
                ? "All of them finished."
                : `${finishedShare}% finished; the rest stopped, were cancelled or are still going.`
          }
          href="/admin/activity"
        />
        <StatTile label="Security checks, 7 days" value={number.format(o.securityChecksLastWeek)} detail="Checks started on any project this week." href="/admin/activity" />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <Card>
          <CardTitle icon={SquaresFourIcon}>Work in Farbaek</CardTitle>
          <dl className="mt-4 grid gap-3 text-sm">
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-ink-2">Active projects</dt>
              <dd className="tabular">{number.format(o.projects)}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-ink-2">Tasks</dt>
              <dd className="tabular">{number.format(o.tasks)}</dd>
            </div>
          </dl>
        </Card>

        <Card>
          <CardTitle icon={PlugsConnectedIcon}>Connections</CardTitle>
          <p className="mt-1 text-sm text-ink-2">What this deployment can do. Names only: no key or secret is ever shown here.</p>
          <ul className="mt-4 grid gap-3">
            {connections.map((c) => (
              <li key={c.name} className="flex items-start gap-3 text-sm">
                <StatusGlyph status={c.on ? "verified" : "off"} className="mt-0.5" />
                <span className="min-w-0">
                  <span className="sr-only">{c.on ? "On: " : "Off: "}</span>
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
