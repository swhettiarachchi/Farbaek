import { InfoIcon } from "@phosphor-icons/react/ssr";
import Link from "next/link";

/**
 * Said on every page while a workspace can check out in Dodo's test mode
 * (spec §23.6): an icon, words and a hatched edge, never colour alone.
 */
export function TestModeBand() {
  return (
    <p className="relative flex flex-wrap items-center justify-center gap-x-2 gap-y-1 overflow-hidden border-b border-approval/30 bg-approval/[0.06] px-4 py-2.5 pl-6 text-center text-[0.8125rem] text-ink">
      <span aria-hidden className="absolute inset-y-0 left-0 w-1.5 bg-[repeating-linear-gradient(135deg,var(--color-approval)_0_3px,transparent_3px_6px)]" />
      <InfoIcon size={16} weight="bold" className="shrink-0 text-approval" aria-hidden />
      <span>
        <span className="font-medium">Payments test mode.</span> Checkout takes Dodo Payments&apos; test cards only, and nothing is charged.
      </span>
      <Link href="/app/billing" className="inline-flex min-h-11 min-w-11 items-center justify-center px-1 font-medium text-accent underline-offset-4 hover:underline">
        Billing
      </Link>
    </p>
  );
}
