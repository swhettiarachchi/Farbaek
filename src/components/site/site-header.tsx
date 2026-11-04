import { ArrowUpRightIcon } from "@phosphor-icons/react/ssr";
import Link from "next/link";
import { BrandLogo } from "@/components/brand/brand-logo";
import { MobileMenu } from "./mobile-menu";
import { NAV_LINKS } from "./nav-links";

/**
 * The public site's header: a frosted island floating just below the top
 * edge, 64px tall in all (8px of air plus the 56px bar), so the hero's
 * full-screen sizing stays the same. The link row shows from 1024px; below
 * that, the menu opens as a full-screen sheet under the island.
 */
export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 px-3 pt-2 sm:px-4">
      <div className="mx-auto flex h-14 w-full max-w-[1200px] items-center justify-between gap-4 rounded-full border border-line/80 bg-surface/80 pl-2 pr-1.5 shadow-e2 backdrop-blur-xl supports-[not(backdrop-filter:blur(0))]:bg-surface">
        {/* The name wraps onto a hidden second line when the row runs out of room (narrow phones, larger system text), so the logo and the buttons always fit. */}
        <Link href="/" className="flex h-11 min-w-0 flex-wrap content-start gap-x-2 overflow-hidden rounded-full pl-1 pr-3" aria-label="Farbaek home">
          <span className="flex h-11 shrink-0 items-center">
            <BrandLogo height={34} preload />
          </span>
          <span className="flex h-11 items-center whitespace-nowrap text-[17px] font-semibold tracking-[-0.02em]">Farbaek</span>
        </Link>

        <nav aria-label="Main" className="hidden lg:block">
          <ul className="flex items-center gap-0.5">
            {NAV_LINKS.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="block rounded-full px-3.5 py-2 text-sm text-ink-2 transition-colors duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-surface-raised hover:text-ink"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="flex shrink-0 items-center gap-1.5">
          {/* Wrapper controls visibility: the link's own display class would override "hidden". */}
          <span className="hidden sm:inline-flex">
            <Link href="/sign-in" className="inline-flex h-11 items-center rounded-full px-4 text-sm font-medium text-ink-2 transition-colors duration-200 hover:bg-surface-raised hover:text-ink">
              Sign in
            </Link>
          </span>
          <Link
            href="/sign-in?next=/app/new"
            className="group inline-flex h-11 items-center gap-2 whitespace-nowrap rounded-full bg-primary pl-4 pr-4 text-sm font-medium text-on-primary shadow-e1 transition-[transform,background-color] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-primary/90 active:scale-[0.98] min-[400px]:pr-1.5"
          >
            Start building
            {/* On narrow phones, and with Android's larger text, the arrow gives its room to the words. */}
            <span className="hidden size-8 items-center justify-center rounded-full bg-on-primary/15 transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:-translate-y-px group-hover:translate-x-0.5 min-[400px]:flex">
              <ArrowUpRightIcon size={15} weight="bold" aria-hidden />
            </span>
          </Link>
          <MobileMenu />
        </div>
      </div>
    </header>
  );
}
