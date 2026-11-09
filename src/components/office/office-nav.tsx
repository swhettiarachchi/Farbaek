"use client";

import {
  BuildingsIcon,
  ChartLineUpIcon,
  ClockCounterClockwiseIcon,
  CpuIcon,
  CreditCardIcon,
  DotsThreeOutlineIcon,
  ShieldCheckIcon,
  GlobeIcon,
  HeartbeatIcon,
  IdentificationBadgeIcon,
  LifebuoyIcon,
  MegaphoneIcon,
  ScrollIcon,
  SlidersHorizontalIcon,
  UsersThreeIcon,
} from "@phosphor-icons/react";
import type { Icon } from "@phosphor-icons/react";
import Link from "next/link";
import { useSelectedLayoutSegment } from "next/navigation";
import { PAGE_NAV } from "@/components/app/page-transition";
import { OFFICE_BAR, OFFICE_PAGES, type OfficeHref } from "./office-pages";

/**
 * Office Space's navigation. The pages live in ./office-pages (plain data);
 * the active item comes from the layout segment, which is right behind the
 * proxy's rewrite where the pathname may not be.
 */
const ICONS: Record<OfficeHref | "/more", Icon> = {
  "/": ChartLineUpIcon,
  "/workspaces": BuildingsIcon,
  "/people": UsersThreeIcon,
  "/support": LifebuoyIcon,
  "/activity": ClockCounterClockwiseIcon,
  "/sites": GlobeIcon,
  "/health": HeartbeatIcon,
  "/controls": SlidersHorizontalIcon,
  "/models": CpuIcon,
  "/payments": CreditCardIcon,
  "/announcements": MegaphoneIcon,
  "/staff": IdentificationBadgeIcon,
  "/audit": ScrollIcon,
  "/security": ShieldCheckIcon,
  "/more": DotsThreeOutlineIcon,
};

const BAR: {
  segment: string | null;
  href: OfficeHref | "/more";
  short: string;
}[] = [
  ...OFFICE_PAGES.filter((p) => OFFICE_BAR.includes(p.href)),
  { segment: "more", href: "/more", short: "More" },
];

export function OfficeNav({ layout, badges = {} }: { layout: "column" | "bar"; badges?: Partial<Record<OfficeHref, number>> }) {
  const segment = useSelectedLayoutSegment();
  if (layout === "bar") {
    const inBar = new Set(BAR.map((b) => b.segment));
    return (
      <nav aria-label="Office Space">
        <ul className="grid grid-cols-5">
          {BAR.map((item) => {
            const active =
              segment === item.segment ||
              (item.segment === "more" && !inBar.has(segment));
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  transitionTypes={PAGE_NAV}
                  aria-current={active ? "page" : undefined}
                  className={`relative flex min-h-14 flex-col items-center justify-center gap-1 text-[0.6875rem] ${active ? "font-medium text-ink" : "text-ink-3"}`}
                >
                  <BarIcon
                    href={item.href}
                    size={20}
                    weight={active ? "fill" : "regular"}
                    className={active ? "text-accent" : ""}
                    aria-hidden
                  />
                  {item.short}
                  {item.href !== "/more" && (badges[item.href] ?? 0) > 0 ? (
                    <span className="absolute right-[calc(50%-18px)] top-2 min-w-4 rounded-full bg-approval px-1 text-center text-[0.6875rem] font-semibold leading-4 text-on-accent tabular">
                      {badges[item.href]}
                      <span className="sr-only"> waiting</span>
                    </span>
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    );
  }
  return (
    <nav aria-label="Office Space" className="grid gap-5">
      {(["people", "platform", "you"] as const).map((group) => (
        <ul key={group} className="grid gap-0.5">
          {OFFICE_PAGES.filter((p) => p.group === group).map((item) => {
            const active = segment === item.segment;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  transitionTypes={PAGE_NAV}
                  aria-current={active ? "page" : undefined}
                  className={`flex h-11 items-center gap-3 rounded-full px-3.5 text-sm transition-colors duration-150 ${
                    active
                      ? "bg-surface font-medium text-ink shadow-e1"
                      : "text-ink-3 hover:bg-surface/70 hover:text-ink"
                  }`}
                >
                  <NavIcon
                    href={item.href}
                    size={20}
                    weight={active ? "fill" : "regular"}
                    className={active ? "text-accent" : ""}
                    aria-hidden
                  />
                  {item.label}
                  {(badges[item.href] ?? 0) > 0 ? (
                    <span className="ml-auto min-w-5 rounded-full bg-approval px-1.5 text-center text-[0.6875rem] font-semibold leading-5 text-on-accent tabular">
                      {badges[item.href]}
                      <span className="sr-only"> waiting</span>
                    </span>
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
      ))}
    </nav>
  );
}

function BarIcon({
  href,
  ...props
}: {
  href: OfficeHref | "/more";
  size: number;
  weight: "fill" | "regular";
  className: string;
} & { "aria-hidden": boolean }) {
  const I = ICONS[href];
  return <I {...props} />;
}
const NavIcon = BarIcon;
