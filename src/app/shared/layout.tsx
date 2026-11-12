import { SignOutIcon } from "@phosphor-icons/react/ssr";
import type { Metadata } from "next";
import Link from "next/link";
import { signOut } from "@/app/app/actions";
import { BrandLogo } from "@/components/brand/brand-logo";

export const metadata: Metadata = {
  title: { default: "Shared with you", template: "%s | Farbaek" },
  robots: { index: false, follow: false },
};

// Per-person pages: always rendered at request time.
export const dynamic = "force-dynamic";

/**
 * The guest area (ADR 0188): projects other workspaces shared with the
 * signed-in person, one at a time. It has its own small frame, because a
 * guest has no workspace here: no switcher, no plan, no workspace nav.
 */
export default function SharedLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div data-signed-in className="min-h-[100dvh] bg-canvas">
      <header className="border-b border-line bg-canvas-2">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-2 sm:px-6">
          <Link href="/shared" className="flex min-h-11 min-w-[44px] items-center gap-2 rounded-full" aria-label="Farbaek, Shared with you">
            <BrandLogo height={28} />
            <span className="text-base font-medium tracking-[-0.02em] max-[18em]:sr-only">Farbaek</span>
          </Link>
          <nav aria-label="Account" className="flex flex-wrap items-center gap-x-5">
            <Link href="/shared" className="inline-flex min-h-11 items-center text-sm font-medium text-ink-2 hover:text-ink">
              Shared with you
            </Link>
            <Link href="/app" className="inline-flex min-h-11 items-center text-sm font-medium text-ink-2 hover:text-ink">
              Your workspace
            </Link>
            <form action={signOut}>
              <button type="submit" className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-ink-2 hover:text-ink">
                <SignOutIcon size={16} weight="bold" aria-hidden /> Sign out
              </button>
            </form>
          </nav>
        </div>
      </header>
      <main id="main" className="mx-auto w-full max-w-5xl px-4 pb-20 pt-8 sm:px-6 sm:pt-10">
        {children}
      </main>
    </div>
  );
}
