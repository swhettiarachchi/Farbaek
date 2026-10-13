import Link from "next/link";
import { BrandLogo } from "@/components/brand/brand-logo";
import { Container } from "@/components/ui/container";
import { NAV_LINKS } from "./nav-links";

export function SiteFooter() {
  return (
    <footer className="border-t border-line">
      <Container className="grid gap-10 py-14 md:grid-cols-[1.4fr_1fr] md:items-start">
        <div className="flex items-start gap-4">
          <BrandLogo height={56} />
          <div>
            <p className="text-[17px] font-semibold tracking-[-0.01em]">Farbaek</p>
            <p className="mt-1 max-w-[38ch] text-sm text-ink-2">From idea to verified software, with control at every step.</p>
            <p className="mt-4 text-sm text-ink-3">Farbaek is in development. Accounts and payments are not open yet.</p>
          </div>
        </div>
        <nav aria-label="Footer" className="md:justify-self-end">
          <ul className="grid grid-cols-2 gap-x-10 gap-y-3 text-sm">
            {NAV_LINKS.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className="text-ink-2 hover:text-ink">
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </Container>
    </footer>
  );
}
