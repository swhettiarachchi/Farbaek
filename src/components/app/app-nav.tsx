"use client";

import {
  ChartPieSliceIcon,
  CheckSquareOffsetIcon,
  DotsThreeOutlineIcon,
  FolderSimpleIcon,
  GearSixIcon,
  HouseSimpleIcon,
  ListChecksIcon,
  LockSimpleIcon,
  TerminalWindowIcon,
} from "@phosphor-icons/react";
import type { Icon } from "@phosphor-icons/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ROADMAP } from "./roadmap";

interface NavItem {
  href: string;
  label: string;
  short: string;
  icon: Icon;
  exact?: boolean;
}

const PRIMARY: NavItem[] = [
  { href: "/app", label: "Mission Control", short: "Home", icon: HouseSimpleIcon, exact: true },
  { href: "/app/projects", label: "Projects", short: "Projects", icon: FolderSimpleIcon },
  { href: "/app/tasks", label: "Tasks", short: "Tasks", icon: ListChecksIcon },
  { href: "/app/approvals", label: "Approvals", short: "Approvals", icon: CheckSquareOffsetIcon },
  { href: "/app/sandbox", label: "Sandbox", short: "Sandbox", icon: TerminalWindowIcon },
];

const SECONDARY: NavItem[] = [
  { href: "/app/billing", label: "Billing and usage", short: "Billing", icon: ChartPieSliceIcon },
  { href: "/app/settings", label: "Settings", short: "Settings", icon: GearSixIcon },
];


function isActive(pathname: string, item: NavItem): boolean {
  return item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
}

function Badge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="ml-auto min-w-5 rounded-full bg-approval px-1.5 text-center text-[11px] font-semibold leading-5 text-surface tabular">
      {count > 99 ? "99+" : count}
      <span className="sr-only"> waiting</span>
    </span>
  );
}

export function SidebarNav({ approvals }: { approvals: number }) {
  const pathname = usePathname();
  const link = (item: NavItem) => {
    const active = isActive(pathname, item);
    return (
      <li key={item.href}>
        <Link
          href={item.href}
          aria-current={active ? "page" : undefined}
          className={`flex h-10 items-center gap-3 rounded-full px-3.5 text-[14.5px] transition-colors duration-150 ${
            active ? "bg-surface font-medium text-ink shadow-e1" : "text-ink-2 hover:bg-surface/70 hover:text-ink"
          }`}
        >
          <item.icon size={19} weight={active ? "fill" : "regular"} className={active ? "text-accent" : ""} aria-hidden />
          {item.label}
          {item.href === "/app/approvals" ? <Badge count={approvals} /> : null}
        </Link>
      </li>
    );
  };

  return (
    <nav aria-label="App" className="grid gap-6">
      <ul className="grid gap-0.5">{PRIMARY.map(link)}</ul>
      <ul className="grid gap-0.5">{SECONDARY.map(link)}</ul>
      <div>
        <p className="px-3.5 text-xs font-medium text-ink-3">Coming in later stages</p>
        <ul className="mt-2 grid gap-0.5">
          {ROADMAP.map((r) => (
            <li
              key={r.label}
              title={`${r.label} arrives in Stage ${r.stage}. It isn't built yet.`}
              className="flex h-9 cursor-default items-center gap-3 px-3.5 text-[14px] text-ink-3"
            >
              <LockSimpleIcon size={16} className="shrink-0" aria-hidden />
              <span className="min-w-0 truncate">{r.label}</span>
              <span className="sr-only">, not available yet</span>
              <span className="ml-auto shrink-0 whitespace-nowrap text-[11px] tabular">Stage {r.stage}</span>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  );
}

// Five slots on phones: Sandbox is reached through More there.
const TABS: NavItem[] = [...PRIMARY.filter((i) => i.href !== "/app/sandbox"), { href: "/app/more", label: "More", short: "More", icon: DotsThreeOutlineIcon }];

export function MobileTabBar({ approvals }: { approvals: number }) {
  const pathname = usePathname();
  const moreActive = ["/app/more", "/app/billing", "/app/settings", "/app/workspaces", "/app/sandbox"].some((p) => pathname.startsWith(p));
  return (
    <nav
      aria-label="App"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden"
    >
      <ul className="mx-auto grid max-w-lg grid-cols-5">
        {TABS.map((item) => {
          const active = item.href === "/app/more" ? moreActive : isActive(pathname, item);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`relative flex h-16 flex-col items-center justify-center gap-1 text-[11px] ${active ? "font-medium text-accent" : "text-ink-2"}`}
              >
                <item.icon size={22} weight={active ? "fill" : "regular"} aria-hidden />
                {item.short}
                {item.href === "/app/approvals" && approvals > 0 ? (
                  <span className="absolute right-[calc(50%-20px)] top-2 min-w-4 rounded-full bg-approval px-1 text-center text-[10px] font-semibold leading-4 text-surface tabular">
                    {approvals}
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
