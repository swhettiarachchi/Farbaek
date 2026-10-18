import Link from "next/link";
import { BrandLogo } from "@/components/brand/brand-logo";
import { Container } from "@/components/ui/container";
import { CONTACT } from "@/config/contact";
import { NAV_LINKS } from "./nav-links";

export function SiteFooter() {
  return (
    <footer className="relative overflow-hidden border-t border-line bg-surface">
      <Container className="grid gap-10 pb-10 pt-16 md:grid-cols-[1.4fr_auto_1fr] md:items-start">
        <div className="flex items-start gap-4">
          <BrandLogo height={56} />
          <div>
            <p className="text-[17px] font-semibold tracking-[-0.02em]">Farbaek</p>
            <p className="mt-1 max-w-[38ch] text-sm text-ink-2">From idea to verified software, with control at every step.</p>
            <p className="mt-4 text-sm text-ink-3">Farbaek is in development. Payments are not open yet.</p>
          </div>
        </div>
        <address className="grid gap-3 text-sm not-italic">
          <p className="font-mono text-xs text-ink-3">{"// contact"}</p>
          <p>
            <span className="block text-ink-3">General</span>
            <a href={`mailto:${CONTACT.hello}`} className="text-ink-2 hover:text-ink">
              {CONTACT.hello}
            </a>
          </p>
          <p>
            <span className="block text-ink-3">Help</span>
            <a href={`mailto:${CONTACT.support}`} className="text-ink-2 hover:text-ink">
              {CONTACT.support}
            </a>
          </p>
        </address>
        <nav aria-label="Footer" className="md:justify-self-end">
          <ul className="grid grid-cols-2 gap-x-10 gap-y-3 text-sm">
            {[...NAV_LINKS, { href: "/sign-in", label: "Sign in" }].map((link) => (
              <li key={link.href}>
                <Link href={link.href} className="text-ink-2 hover:text-ink">
                  {link.label}
                </Link>
              </li>
            ))}
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
