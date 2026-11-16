import Link from "next/link";
import { BrandLogo } from "@/components/brand/brand-logo";
import { MobileMenu } from "./mobile-menu";
import { SiteNav } from "./site-nav";

/**
 * The public site's header (stage 201): a flat 64px bar across the top, frosted so the page shows through, with a hairline
 * under it. The logo on the left, the four spaces and pricing in the middle from 1024px, Sign in and one dark pill on the
 * right. Below 1024px the links move into the menu sheet. Measured against ChatGPT's and Antigravity's headers: small type,
 * no shadows, one button that matters.
 */
export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-line/70 bg-canvas/80 backdrop-blur-xl supports-[not(backdrop-filter:blur(0))]:bg-canvas">
      <div className="mx-auto grid h-16 w-full max-w-[1280px] grid-cols-[1fr_auto_1fr] items-center gap-4 px-4 sm:px-6">
        {/* The name wraps onto a hidden second line when the row runs out of room (narrow phones, larger system text). */}
        <Link href="/" className="flex h-11 min-w-0 flex-wrap content-start gap-x-2 justify-self-start overflow-hidden rounded-full pr-2" aria-label="Farbaek home">
          <span className="flex h-11 shrink-0 items-center">
            <BrandLogo height={30} preload />
          </span>
          <span className="flex h-11 items-center whitespace-nowrap text-body font-semibold tracking-[-0.02em]">Farbaek</span>
        </Link>

        <SiteNav />

        <div className="col-start-3 flex shrink-0 items-center gap-1 justify-self-end">
          {/* Wrapper controls visibility: the link's own display class would override "hidden". */}
          <span className="hidden sm:inline-flex">
            <Link href="/sign-in" className="tap inline-flex h-10 items-center rounded-full px-3.5 text-sm text-ink-2 transition-colors duration-200 hover:text-ink">
              Sign in
            </Link>
          </span>
          {/* With Android's largest text there's room for the logo and the menu, which has this too. */}
          <span className="contents max-[19.9em]:hidden">
            <Link
              href="/sign-in?next=/app/chat"
              className="tap inline-flex h-10 items-center whitespace-nowrap rounded-full bg-primary px-4 text-sm font-medium text-on-primary transition-[transform,background-color] duration-200 hover:bg-primary-hover active:scale-[0.98]"
            >
              Try Farbaek AI
            </Link>
          </span>
          <MobileMenu />
        </div>
      </div>
    </header>
  );
}
