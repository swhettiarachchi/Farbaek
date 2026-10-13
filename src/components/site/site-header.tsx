import Link from "next/link";
import { BrandLogo } from "@/components/brand/brand-logo";
import { ButtonLink } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { MobileMenu } from "./mobile-menu";
import { NAV_LINKS } from "./nav-links";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-canvas/90 backdrop-blur-md supports-[not(backdrop-filter:blur(0))]:bg-canvas">
      <Container className="flex h-16 items-center justify-between gap-6">
        <Link href="/" className="flex items-center gap-2.5 rounded-sm" aria-label="Farbaek home">
          <BrandLogo height={36} preload />
          <span className="text-[17px] font-semibold tracking-[-0.01em]">Farbaek</span>
        </Link>

        <nav aria-label="Main" className="hidden md:block">
          <ul className="flex items-center gap-1">
            {NAV_LINKS.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="rounded-sm px-3 py-2 text-sm text-ink-2 transition-colors duration-[140ms] hover:text-ink"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="flex items-center gap-2">
          <ButtonLink href="/#demo" size="sm" className="hidden sm:inline-flex">
            Try the demo
          </ButtonLink>
          <MobileMenu />
        </div>
      </Container>
    </header>
  );
}
