"use client";

import { BuildingsIcon, ChartLineUpIcon, FingerprintIcon, IdentificationBadgeIcon, PulseIcon, ScrollIcon, UsersThreeIcon } from "@phosphor-icons/react";
import type { Icon } from "@phosphor-icons/react";
import Link from "next/link";
import { useSelectedLayoutSegment } from "next/navigation";
import { PAGE_NAV } from "@/components/app/page-transition";

/**
 * Office Space's pages. Links use the visible paths (the office host maps
 * them under /office), and the active item comes from the layout segment,
 * which is right behind the proxy's rewrite where the pathname may not be.
 */
const ITEMS: { segment: string | null; href: string; label: string; short: string; icon: Icon; phone: boolean }[] = [
  { segment: null, href: "/", label: "Overview", short: "Overview", icon: ChartLineUpIcon, phone: true },
  { segment: "workspaces", href: "/workspaces", label: "Workspaces", short: "Workspaces", icon: BuildingsIcon, phone: true },
  { segment: "people", href: "/people", label: "People", short: "People", icon: UsersThreeIcon, phone: false },
  { segment: "activity", href: "/activity", label: "Activity", short: "Activity", icon: PulseIcon, phone: false },
  { segment: "staff", href: "/staff", label: "Staff", short: "Staff", icon: IdentificationBadgeIcon, phone: true },
  { segment: "audit", href: "/audit", label: "Audit log", short: "Audit", icon: ScrollIcon, phone: true },
  { segment: "security", href: "/security", label: "My security", short: "Security", icon: FingerprintIcon, phone: true },
];

export function OfficeNav({ layout }: { layout: "column" | "bar" }) {
  const segment = useSelectedLayoutSegment();
  const items = layout === "bar" ? ITEMS.filter((i) => i.phone) : ITEMS;
  return (
    <nav aria-label="Office Space">
      <ul className={layout === "column" ? "grid gap-0.5" : "grid grid-cols-5"}>
        {items.map((item) => {
          const active = segment === item.segment;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                transitionTypes={PAGE_NAV}
                aria-current={active ? "page" : undefined}
                className={
                  layout === "column"
                    ? `flex h-11 items-center gap-3 rounded-full px-3.5 text-[14.5px] transition-colors duration-150 ${
                        active ? "bg-surface font-medium text-ink shadow-e1" : "text-ink-3 hover:bg-surface/70 hover:text-ink"
                      }`
                    : `flex min-h-14 flex-col items-center justify-center gap-1 text-[11px] ${active ? "font-medium text-ink" : "text-ink-3"}`
                }
              >
                <item.icon size={layout === "column" ? 18 : 20} weight={active ? "fill" : "regular"} className={active ? "text-accent" : ""} aria-hidden />
                {layout === "column" ? item.label : item.short}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
