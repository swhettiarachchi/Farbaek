import { FlagIcon } from "@phosphor-icons/react/ssr";
import Link from "next/link";
import { reportHref } from "@/core/support/support";

/**
 * Report something the AI made, from where it's shown and without leaving the app, as Google Play's
 * AI-Generated Content policy asks (ADR 0171). Reports reach Office Space with the abuse topic.
 */
export function ReportResult({ about, className = "" }: { about: Parameters<typeof reportHref>[0]; className?: string }) {
  return (
    <Link href={reportHref(about)} className={`inline-flex min-h-11 w-fit items-center gap-1.5 text-[13px] text-ink-3 underline-offset-4 hover:text-ink hover:underline ${className}`}>
      <FlagIcon size={14} aria-hidden /> Report this result
    </Link>
  );
}
