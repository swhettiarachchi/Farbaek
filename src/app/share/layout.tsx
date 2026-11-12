import type { Metadata } from "next";
import Link from "next/link";
import { BrandLogo } from "@/components/brand/brand-logo";

export const metadata: Metadata = {
  title: { default: "Shared project", template: "%s | Farbaek" },
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export const dynamic = "force-dynamic";

/** A read-only link's frame (ADR 0188): nothing of the app, no account needed. */
export default function ShareLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="min-h-[100dvh] bg-canvas">
      <header className="border-b border-line bg-canvas-2">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-2 sm:px-6">
          <Link href="/" className="flex min-h-11 min-w-[44px] items-center gap-2 rounded-full" aria-label="Farbaek home">
            <BrandLogo height={28} />
            <span className="text-base font-medium tracking-[-0.02em] max-[18em]:sr-only">Farbaek</span>
          </Link>
          <p className="text-sm text-ink-3">Read-only</p>
        </div>
      </header>
      <main id="main" className="mx-auto w-full max-w-6xl px-4 pb-20 pt-8 sm:px-6 sm:pt-10">
        {children}
      </main>
    </div>
  );
}
