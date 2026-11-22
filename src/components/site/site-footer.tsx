import Link from "next/link";
import { CookieChoicesButton } from "@/components/analytics/analytics-consent";
import { BrandLogo } from "@/components/brand/brand-logo";
import { ThemeChoice } from "@/components/theme/theme-choice";
import { Container } from "@/components/ui/container";
import { CONTACT } from "@/config/contact";
import { LEGAL_DOCS } from "@/config/legal";
import { DEFAULT_THEME } from "@/core/theme/theme";
import { MORE_LINKS, SPACES } from "./spaces";

const COLUMNS = [
  { title: "Spaces", links: SPACES.map((s) => ({ href: s.page, label: s.name })) },
  { title: "More", links: [...MORE_LINKS, { href: "/proofpack/v1", label: "ProofPack format" }, { href: "/sign-in", label: "Sign in" }] },
];

export function SiteFooter() {
  return (
    <footer className="relative overflow-hidden border-t border-line bg-surface">
      <Container className="grid gap-8 pb-8 pt-12 sm:gap-10 sm:pb-10 sm:pt-16 sm:grid-cols-2 lg:grid-cols-[1.4fr_auto_auto_auto] lg:gap-14 lg:items-start">
        <div className="flex items-start gap-4">
          <BrandLogo height={56} className="h-10 w-auto sm:h-14" />
          <div>
            <p className="text-title-4 font-semibold tracking-[-0.02em]">Farbaek</p>
            <p className="mt-1 max-w-[38ch] text-sm text-ink-2">From idea to verified software, with control at every step.</p>
            <p className="mt-4 text-sm text-ink-3">Start free, no card.</p>
          </div>
        </div>
        {COLUMNS.map((col) => (
          <nav key={col.title} aria-label={col.title} className="grid content-start gap-1 text-sm">
            <p className="font-medium text-ink">{col.title}</p>
            <ul>
              {col.links.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="inline-flex min-h-11 min-w-11 items-center text-ink-2 hover:text-ink">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
        <address className="grid content-start gap-1 text-sm not-italic">
          <p className="font-medium text-ink">Contact</p>
          <p>
            <span className="block pt-2 text-ink-3">General</span>
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
      </Container>
      {/* The footer ends with the legal links (the oversized wordmark under them went at the owner's request, 2026-11-14). */}
      <Container className="pb-6">
        {/* Light, Dark or Auto, for the whole of Farbaek (ADR 0232). The page is built ahead of time, so it starts from Light and the control reads the page's mark. */}
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-t border-line py-4">
          <p id="site-look" className="text-sm text-ink-3">
            Appearance
          </p>
          <ThemeChoice saved={DEFAULT_THEME} labelledBy="site-look" />
        </div>
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
    </footer>
  );
}
