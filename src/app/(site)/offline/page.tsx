import { WifiSlashIcon } from "@phosphor-icons/react/ssr";
import type { Metadata } from "next";
import { FOCUSED_TITLE } from "@/components/ui/titles";

export const metadata: Metadata = { title: "Offline" };

/**
 * What the installed app shows when there's no network (ADR 0079). The
 * service worker keeps only this page, so it holds nothing personal.
 */
export default function OfflinePage() {
  return (
    <div className="mx-auto grid min-h-[70dvh] max-w-xl content-center gap-5 px-4 py-16 text-center">
      <WifiSlashIcon size={32} className="mx-auto text-ink-3" aria-hidden />
      <h1 className={FOCUSED_TITLE}>You&apos;re offline</h1>
      <p className="text-base leading-relaxed text-ink-2">
        Farbaek needs the internet to open your workspace. Your projects, plans and proof are safe on Farbaek&apos;s server, and nothing you approved is lost. Projects you kept on this device open without it.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <a href="/app" className="inline-flex h-11 items-center rounded-full bg-primary px-5 text-sm font-medium text-on-primary shadow-e1">
          Try again
        </a>
        {/* Projects kept in this browser open without a connection (ADR 0192). */}
        <a href="/device" className="inline-flex h-11 items-center rounded-full border border-line bg-surface px-5 text-sm font-medium text-ink shadow-e1">
          Open what&apos;s on this device
        </a>
      </div>
    </div>
  );
}
