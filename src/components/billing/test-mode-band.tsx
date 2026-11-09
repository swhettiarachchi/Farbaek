import { WarningCircleIcon } from "@phosphor-icons/react/ssr";
import Link from "next/link";

/**
 * Said on every page while a workspace can check out in Dodo's test mode
 * (spec §23.6): the same neutral band as the app's other page-wide notices,
 * with its icon in the caution colour and its words, never colour alone (ADR 0183).
 * The icon sits beside the first line; the words and the link wrap beside it.
 */
export function TestModeBand() {
  return (
    <p className="flex items-start justify-center gap-2 border-b border-line bg-surface-raised px-4 py-1 text-label text-ink">
      <WarningCircleIcon size={16} weight="fill" className="mt-[0.875rem] shrink-0 text-caution" aria-hidden />
      <span className="py-2.5">
        <span className="font-medium">Payments test mode.</span> Checkout takes Dodo Payments&apos; test cards only, and nothing is charged.{" "}
        <Link href="/app/billing" className="-my-3 inline-flex min-h-11 items-center px-1 font-medium text-accent underline-offset-4 hover:underline">
          Billing
        </Link>
      </span>
    </p>
  );
}
