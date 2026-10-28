import { LightningIcon } from "@phosphor-icons/react/ssr";
import Link from "next/link";
import { setTopupCapAction, startTopupAction } from "@/app/app/billing/actions";
import { Card, Notice } from "@/components/app/primitives";
import { buttonClasses } from "@/components/ui/button";
import { formatUsd } from "@/core/billing/catalog";
import { TOPUP_MONTHS, TOPUP_PACKS_CENTS, topupConsentText, topupSharePercent, type TopupPack } from "@/core/billing/topups";
import type { PaidPlanId } from "@/core/billing/provider";
import type { BillingView } from "@/server/billing/view";
import { BillingSubmit } from "./billing-submit";

/**
 * Buying more AI usage (ADR 0102): the monthly limit an owner or admin sets,
 * what's been bought this month, and the packs, each saying what share of a
 * month of the plan it adds. Units are never shown.
 */
export function TopupCard({ planId, planName, topups, canManage, error }: { planId: PaidPlanId; planName: string; topups: NonNullable<BillingView["topups"]>; canManage: boolean; error: string | null }) {
  const used = topups.spentCents + topups.openCents;
  const room = topups.capCents === null ? 0 : Math.max(0, topups.capCents - used);
  return (
    <Card id="topups" className="scroll-mt-24">
      <h2 className="flex items-center gap-2 text-lg font-medium">
        <LightningIcon size={20} className="text-ink-3" aria-hidden /> Top up AI usage
      </h2>
      <p className="mt-1 text-sm leading-relaxed text-ink-2">
        More AI usage at {planName}&apos;s own rate, lasting {TOPUP_MONTHS} months and used after your plan&apos;s own usage. Top-ups never go past the monthly limit below.
      </p>
      {error ? (
        <div className="mt-4">
          <Notice tone="warning">{error}</Notice>
        </div>
      ) : null}

      <div className="mt-5 grid gap-4 rounded-sm border border-line bg-canvas-2 p-4 sm:grid-cols-[1fr_auto] sm:items-end">
        <div className="text-sm">
          <p className="font-medium text-ink">{topups.capCents === null ? "No monthly limit set, so top-ups are off." : `Monthly limit: ${formatUsd(topups.capCents)}`}</p>
          <p className="mt-1 text-ink-2 tabular">
            Bought this month: {formatUsd(topups.spentCents)}
            {topups.openCents > 0 ? `, plus ${formatUsd(topups.openCents)} in checkouts still open` : ""}.
          </p>
        </div>
        {canManage ? (
          <form action={setTopupCapAction} className="flex flex-wrap items-end gap-2">
            <label className="grid gap-1 text-xs text-ink-2">
              Limit in US dollars
              <input
                name="dollars"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={4}
                defaultValue={topups.capCents === null ? "" : String(topups.capCents / 100)}
                placeholder="50"
                className="h-11 w-28 rounded-sm border border-line bg-surface px-3 text-base text-ink tabular"
              />
            </label>
            <BillingSubmit label="Save limit" pending="Saving…" tone="secondary" />
          </form>
        ) : null}
      </div>
      {canManage ? <p className="mt-2 text-xs text-ink-3">Up to $1,000 a month. Leave it empty to turn top-ups off.</p> : null}

      <ul className="mt-5 grid gap-3 sm:grid-cols-3">
        {TOPUP_PACKS_CENTS.map((pack) => {
          const reason =
            !canManage ? "Owners and admins buy usage" : topups.capCents === null ? "Set a monthly limit first" : pack > room ? "Over this month's limit" : null;
          return (
            <li key={pack} className="flex flex-col rounded-md border border-line bg-surface p-4">
              <p className="text-xl font-medium tracking-[-0.02em] tabular">{formatUsd(pack)}</p>
              <p className="mt-1 text-sm text-ink-2">About {topupSharePercent(planId, pack)}% of a month of {planName} usage.</p>
              <div className="mt-auto pt-4">
                {reason ? (
                  <span className="block rounded-full border border-dashed border-line-strong/50 px-3 py-2 text-center text-xs text-ink-3">{reason}</span>
                ) : (
                  <Link href={`/app/billing?topup=${pack}#billing-step`} className={buttonClasses("secondary", "sm", "w-full")}>
                    Buy {formatUsd(pack)}
                  </Link>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

/** The consent step for one pack, like choosing a plan. */
export function TopupStep({ planId, pack, error }: { planId: PaidPlanId; pack: TopupPack; error: string | null }) {
  return (
    <section id="billing-step" aria-labelledby="topup-step-title" className="scroll-mt-24 rounded-lg bg-surface-raised/60 p-2 ring-1 ring-line motion-safe:animate-[usage-in_260ms_cubic-bezier(0.16,1,0.3,1)_both]">
      <div className="rounded-md border border-line bg-surface p-5 shadow-e1 sm:p-6">
        <h2 id="topup-step-title" className="text-lg font-medium tracking-[-0.02em]">
          Buy {formatUsd(pack)} of AI usage
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-ink-2">
          Paid once, plus applicable tax. Pay in US dollars or your own currency: Dodo Payments shows the exact amount before you pay, and another currency adds its conversion fee of up to 4%. See the{" "}
          <Link href="/terms#paid-plans" className="text-accent underline-offset-4 hover:underline">
            terms for paid plans
          </Link>
          .
        </p>
        {error ? (
          <div className="mt-4">
            <Notice tone="warning">{error}</Notice>
          </div>
        ) : null}
        <form action={startTopupAction} className="mt-5 grid gap-4">
          <input type="hidden" name="pack" value={pack} />
          <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-sm border border-line bg-canvas-2 p-4 text-sm leading-relaxed text-ink">
            <input type="checkbox" name="consent" value="yes" required className="mt-0.5 size-5 shrink-0 accent-[var(--color-accent)]" />
            <span>{topupConsentText(planId, pack)}</span>
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <BillingSubmit label="Continue to secure checkout" pending="Opening checkout…" leaves />
            <Link href="/app/billing#topups" className={buttonClasses("ghost", "sm")}>
              Back
            </Link>
          </div>
        </form>
      </div>
    </section>
  );
}
