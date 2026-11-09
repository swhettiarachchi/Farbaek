import { ArrowCounterClockwiseIcon, ArrowsClockwiseIcon, ClockCounterClockwiseIcon, ShieldCheckIcon, WalletIcon, WarningCircleIcon } from "@phosphor-icons/react/ssr";
import type { ReactNode } from "react";
import { Card, CardTitle } from "@/components/app/primitives";
import { StatusBadge } from "@/components/ui/status-badge";
import { DayText } from "@/components/app/usage-meters";
import type { WalletGrant, WalletView } from "@/core/billing/wallet";

const month = (iso: string) => new Intl.DateTimeFormat("en-US", { month: "long", timeZone: "UTC" }).format(new Date(iso));

function grantLabel(g: WalletGrant): string {
  switch (g.kind) {
    case "plan":
      return g.current ? `${month(g.startsAt)} usage` : `Carried over from ${month(g.startsAt)}`;
    case "trial":
      return "Trial usage";
    case "free":
      return `Free usage for ${month(g.startsAt)}`;
    case "topup":
      return "Top-up";
    case "adjustment":
      return "Added by Farbaek";
  }
}

function Rule({ icon, title, children, coming = false }: { icon: ReactNode; title: string; children: ReactNode; coming?: boolean }) {
  return (
    <li className="flex gap-3">
      {/* The icon names the rule, in the quiet ink: no tinted tile (ADR 0183). */}
      <span className="mt-0.5 inline-flex shrink-0 text-ink-3" aria-hidden>
        {icon}
      </span>
      <div>
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-medium text-ink">
          {title}
          {coming ? <StatusBadge status="unverified" label="Coming soon" /> : null}
        </p>
        <p className="mt-0.5 text-sm leading-relaxed text-ink-2">{children}</p>
      </div>
    </li>
  );
}

/**
 * The usage wallet (ADR 0020) as people see it: what they hold, in the order
 * it's spent, and the rules that make it worth more. Shares and dates only,
 * never units.
 */
export function WalletCard({ wallet, paid }: { wallet: WalletView | null; paid: boolean }) {
  return (
    <Card>
      <CardTitle icon={WalletIcon}>Usage wallet</CardTitle>
      <p className="mt-1 text-sm text-ink-2">Your AI usage, in the order it&apos;s spent: whatever expires first goes first.</p>

      {wallet === null ? (
        <p className="mt-5 flex items-start gap-2 text-sm text-ink-2">
          <WarningCircleIcon size={16} weight="fill" className="mt-0.5 shrink-0 text-failed" aria-hidden />
          <span>The wallet couldn&apos;t be read right now.</span>
        </p>
      ) : wallet.grants.length === 0 ? (
        <p className="mt-5 text-sm text-ink-3">Nothing to spend yet. This plan doesn&apos;t include AI usage of its own.</p>
      ) : (
        <ul className="mt-5 grid gap-4">
          {wallet.grants.map((g) => (
            <li key={g.id}>
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-sm font-medium text-ink">{grantLabel(g)}</p>
                <p className="shrink-0 text-sm text-ink-2 tabular">{g.percentLeft}% left</p>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-sunken" role="meter" aria-label={grantLabel(g)} aria-valuemin={0} aria-valuemax={100} aria-valuenow={g.percentLeft} aria-valuetext={`${g.percentLeft}% left`}>
                <div className={`h-full rounded-full ${g.current ? "bg-accent" : "bg-accent/50"}`} style={{ width: `${g.percentLeft}%` }} />
              </div>
              <p className="mt-1.5 text-xs text-ink-3">
                {g.kind === "plan" && g.current ? "Unused usage carries over and expires " : "Expires "}
                <DayText at={g.expiresAt} />
              </p>
            </li>
          ))}
        </ul>
      )}

      <ul className="mt-6 grid gap-4 border-t border-line pt-5">
        <Rule icon={<ArrowsClockwiseIcon size={16} weight="bold" />} title="Unused usage carries over">
          {paid ? "What you don't use this month stays for one more month, and it's spent first." : "On paid plans, what you don't use in a month stays for one more month, and it's spent first."}
        </Rule>
        <Rule icon={<ArrowCounterClockwiseIcon size={16} weight="bold" />} title="Failed AI calls are given back">
          When a model refuses, times out or returns nothing usable, its usage is returned automatically.
        </Rule>
        <Rule icon={<ClockCounterClockwiseIcon size={16} weight="bold" />} title="Free retries after failed checks">
          {paid
            ? "When the agent's fix for failed checks doesn't pass them either, its usage is given back. That's up to about 5% of your plan's AI usage a month."
            : "On paid plans and during the trial, a fix for failed checks that doesn't pass them either gets its usage back. Start one from a task whose checks failed."}
        </Rule>
        <Rule icon={<ShieldCheckIcon size={16} weight="bold" />} title="Spend cap">
          {paid
            ? "Buying more AI usage never goes past the monthly limit an owner or admin sets in Billing. Nothing is ever bought on its own."
            : "On paid plans, buying more AI usage never goes past a monthly limit an owner or admin sets. Nothing is ever bought on its own."}
        </Rule>
      </ul>
    </Card>
  );
}
