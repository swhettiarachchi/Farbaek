import Link from "next/link";
import { CookieChoicesButton } from "@/components/analytics/analytics-consent";
import { BrandLogo } from "@/components/brand/brand-logo";
import { Container } from "@/components/ui/container";
import { CONTACT } from "@/config/contact";
import { LEGAL_DOCS } from "@/config/legal";
import { NAV_LINKS } from "./nav-links";

export function SiteFooter() {
  return (
    <footer className="relative overflow-hidden border-t border-line bg-surface">
      <Container className="grid gap-10 pb-10 pt-16 md:grid-cols-[1.4fr_auto_1fr] md:items-start">
        <div className="flex items-start gap-4">
          <BrandLogo height={56} />
          <div>
            <p className="text-title-4 font-semibold tracking-[-0.02em]">Farbaek</p>
            <p className="mt-1 max-w-[38ch] text-sm text-ink-2">From idea to verified software, with control at every step.</p>
            <p className="mt-4 text-sm text-ink-3">Start free, no card.</p>
          </div>
        </div>
        <address className="grid gap-3 text-sm not-italic">
          <p className="font-medium text-ink">Contact</p>
          <p>
            <span className="block text-ink-3">General</span>
            <a href={`mailto:${CONTACT.hello}`} className="inline-flex min-h-11 items-center text-ink-2 hover:text-ink">
              {CONTACT.hello}
            </a>
          </p>
          <p>
            <span className="block text-ink-3">Help</span>
            <a href={`mailto:${CONTACT.support}`} className="inline-flex min-h-11 items-center text-ink-2 hover:text-ink">
              {CONTACT.support}
            </a>
          </p>
        </address>
        <nav aria-label="Footer" className="md:justify-self-end">
          <ul className="grid grid-cols-2 gap-x-10 text-sm">
            {[...NAV_LINKS, { href: "/verify", label: "Check a ProofPack" }, { href: "/security", label: "Security tests" }, { href: "/sign-in", label: "Sign in" }].map((link) => (
              <li key={link.href}>
                <Link href={link.href} className="inline-flex min-h-11 min-w-11 items-center text-ink-2 hover:text-ink">
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </Container>
      <Container>
        <nav aria-label="Legal" className="border-t border-line py-3">
          <ul className="flex flex-wrap gap-x-6 text-sm">
            {LEGAL_DOCS.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className="inline-flex min-h-11 min-w-11 items-center text-ink-3 hover:text-ink">
                  {link.label}
                </Link>
              </li>
            ))}
            <CookieChoicesButton />
          </ul>
        </nav>
      </Container>

      {/* Oversized wordmark, cropped by the footer edge. Decorative: the name is already above. */}
      <p
        aria-hidden
        className="pointer-events-none select-none px-4 text-center text-[22vw] font-semibold leading-[0.78] tracking-[-0.06em] text-surface-raised sm:text-[19vw]"
      >
        Farbaek
      </p>
    </footer>
  );
}
