import Link from "next/link";
import { BrandLogo } from "@/components/brand/brand-logo";
import { ButtonLink } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { MobileMenu } from "./mobile-menu";
import { NAV_LINKS } from "./nav-links";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-line/70 bg-canvas/80 backdrop-blur-xl supports-[not(backdrop-filter:blur(0))]:bg-canvas">
      <Container className="flex h-16 items-center justify-between gap-6">
        <Link href="/" className="flex items-center gap-2 rounded-full" aria-label="Farbaek home">
          <BrandLogo height={36} preload />
          <span className="text-[17px] font-semibold tracking-[-0.02em]">Farbaek</span>
        </Link>

        <nav aria-label="Main" className="hidden md:block">
          <ul className="flex items-center gap-1">
            {NAV_LINKS.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="block rounded-full px-4 py-2 text-sm text-ink-2 transition-colors duration-[160ms] hover:bg-surface-raised hover:text-ink"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="flex items-center gap-2">
          {/* Wrapper controls visibility: the button's own display class would override "hidden". */}
          <span className="hidden sm:inline-flex">
            <ButtonLink href="/sign-in" variant="ghost" size="sm">
              Sign in
            </ButtonLink>
          </span>
          <ButtonLink href="/sign-in?next=/app/new" size="sm">
            Start building
          </ButtonLink>
          <MobileMenu />
        </div>
      </Container>
    </header>
  );
}
