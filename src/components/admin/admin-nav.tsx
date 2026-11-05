"use client";

import { BuildingsIcon, ChartLineUpIcon, PulseIcon, UsersThreeIcon } from "@phosphor-icons/react";
import type { Icon } from "@phosphor-icons/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { PAGE_NAV } from "@/components/app/page-transition";

const ITEMS: { href: string; label: string; icon: Icon; exact?: boolean }[] = [
  { href: "/admin", label: "Overview", icon: ChartLineUpIcon, exact: true },
  { href: "/admin/workspaces", label: "Workspaces", icon: BuildingsIcon },
  { href: "/admin/people", label: "People", icon: UsersThreeIcon },
  { href: "/admin/activity", label: "Activity", icon: PulseIcon },
];

/** The console's pages: a column on wide screens, a row of pills on phones. */
export function AdminNav({ layout }: { layout: "column" | "row" }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Admin console">
      <ul className={layout === "column" ? "grid gap-1" : "flex gap-1.5 overflow-x-auto pb-1"}>
        {ITEMS.map((item) => {
          const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
          return (
            <li key={item.href} className="shrink-0">
              <Link
                href={item.href}
                transitionTypes={PAGE_NAV}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-2.5 rounded-full text-[0.90625rem] transition-colors duration-150 ${layout === "column" ? "h-10 px-3.5" : "h-11 px-4"} ${
                  active ? "bg-surface font-medium text-ink shadow-e1" : "text-ink-2 hover:bg-surface/70 hover:text-ink"
                }`}
              >
                <item.icon size={18} weight={active ? "fill" : "regular"} className={active ? "text-accent" : ""} aria-hidden />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
