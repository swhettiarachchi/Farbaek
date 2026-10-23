import { ArrowCounterClockwiseIcon, ArrowsClockwiseIcon, ClockCounterClockwiseIcon, ShieldCheckIcon } from "@phosphor-icons/react/ssr";
import type { ReactNode } from "react";
import { Card } from "@/components/app/primitives";
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
      <span className="mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-accent/[0.08] text-accent" aria-hidden>
        {icon}
      </span>
      <div>
        <p className="text-sm font-medium text-ink">
          {title}
          {coming ? <span className="ml-2 whitespace-nowrap rounded-full border border-line px-2 py-px text-xs font-normal text-ink-3">Coming soon</span> : null}
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
      <h2 className="text-lg font-medium">Usage wallet</h2>
      <p className="mt-1 text-sm text-ink-2">Your AI usage, in the order it&apos;s spent: whatever expires first goes first.</p>

      {wallet === null ? (
        <p className="mt-5 text-sm text-ink-3">The wallet couldn&apos;t be read right now.</p>
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
        <Rule icon={<ArrowsClockwiseIcon size={15} weight="bold" />} title="Unused usage carries over">
          {paid ? "What you don't use this month stays for one more month, and it's spent first." : "On paid plans, what you don't use in a month stays for one more month, and it's spent first."}
        </Rule>
        <Rule icon={<ArrowCounterClockwiseIcon size={15} weight="bold" />} title="Failed AI calls are given back">
          When a model refuses, times out or returns nothing usable, its usage is returned automatically.
        </Rule>
        <Rule icon={<ClockCounterClockwiseIcon size={15} weight="bold" />} title="Free retries after failed checks" coming>
          Paid plans include a reserve for asking the agent to fix what failed checks found, so retries don&apos;t use your usage.
        </Rule>
        <Rule icon={<ShieldCheckIcon size={15} weight="bold" />} title="Spend cap">
          Not available until payments are connected. Until then nothing can be billed. Once top-ups exist, they only apply up to a cap you set.
        </Rule>
      </ul>
    </Card>
  );
}
