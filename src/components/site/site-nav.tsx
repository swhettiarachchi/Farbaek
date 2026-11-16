"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_LINKS } from "./nav-links";

/** The header's link row from 1024px, with the page you're on marked (ADR 0214). */
export function SiteNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="col-start-2 hidden lg:block">
      <ul className="flex items-center gap-0.5">
        {NAV_LINKS.map((link) => {
          const here = pathname === link.href || pathname.startsWith(`${link.href}/`);
          return (
            <li key={link.href}>
              <Link
                href={link.href}
                aria-current={here ? "page" : undefined}
                className={`block rounded-full px-3 py-2 text-sm transition-colors duration-200 pointer-coarse:py-3 ${here ? "font-medium text-ink" : "text-ink-2 hover:text-ink"}`}
              >
                {link.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
