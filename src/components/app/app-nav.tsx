"use client";

import {
  ChartPieSliceIcon,
  CheckSquareOffsetIcon,
  DesktopIcon,
  DotsThreeOutlineIcon,
  FolderSimpleIcon,
  GearSixIcon,
  HouseSimpleIcon,
  LifebuoyIcon,
  ListChecksIcon,
  LockSimpleIcon,
  PackageIcon,
  SparkleIcon,
  TerminalWindowIcon,
} from "@phosphor-icons/react";
import type { Icon } from "@phosphor-icons/react";
import Link from "next/link";
import { PAGE_NAV } from "@/components/app/page-transition";
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
  { href: "/app/build", label: "Build", short: "Build", icon: SparkleIcon },
  { href: "/app/projects", label: "Projects", short: "Projects", icon: FolderSimpleIcon },
  { href: "/app/tasks", label: "Tasks", short: "Tasks", icon: ListChecksIcon },
  { href: "/app/approvals", label: "Approvals", short: "Approvals", icon: CheckSquareOffsetIcon },
  { href: "/app/sandbox", label: "Sandbox", short: "Sandbox", icon: TerminalWindowIcon },
  { href: "/app/agents", label: "Agents", short: "Agents", icon: DesktopIcon },
  { href: "/app/mesh", label: "Mesh", short: "Mesh", icon: PackageIcon },
];

const SECONDARY: NavItem[] = [
  { href: "/app/billing", label: "Billing and usage", short: "Billing", icon: ChartPieSliceIcon },
  { href: "/app/settings", label: "Settings", short: "Settings", icon: GearSixIcon },
  { href: "/app/help", label: "Help and support", short: "Help", icon: LifebuoyIcon },
];

/** Every page in the app's navigation, for the command palette. */
export const APP_PAGES: readonly NavItem[] = [...PRIMARY, ...SECONDARY];


function isActive(pathname: string, item: NavItem): boolean {
  return item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
}

function Badge({ count, tone = "approval", label = "waiting" }: { count: number; tone?: "approval" | "accent"; label?: string }) {
  if (count <= 0) return null;
  return (
    <span className={`ml-auto min-w-5 rounded-full px-1.5 text-center text-[11px] font-semibold leading-5 text-surface tabular ${tone === "accent" ? "bg-accent" : "bg-approval"}`}>
      {count > 99 ? "99+" : count}
      <span className="sr-only"> {label}</span>
    </span>
  );
}

export function SidebarNav({ approvals, helpUnread = 0 }: { approvals: number; helpUnread?: number }) {
  const pathname = usePathname();
  const link = (item: NavItem) => {
    const active = isActive(pathname, item);
    return (
      <li key={item.href}>
        <Link
          href={item.href}
          transitionTypes={PAGE_NAV}
          aria-current={active ? "page" : undefined}
          className={`flex h-10 items-center gap-3 rounded-full px-3.5 text-[14.5px] transition-colors duration-150 ${
            active ? "bg-surface font-medium text-ink shadow-e1" : "text-ink-2 hover:bg-surface/70 hover:text-ink"
          }`}
        >
          <item.icon size={19} weight={active ? "fill" : "regular"} className={active ? "text-accent" : ""} aria-hidden />
          {item.label}
          {item.href === "/app/approvals" ? <Badge count={approvals} /> : null}
          {item.href === "/app/help" ? <Badge count={helpUnread} tone="accent" label={helpUnread === 1 ? "new reply" : "new replies"} /> : null}
        </Link>
      </li>
    );
  };

  return (
    <nav aria-label="App" className="grid gap-6">
      <ul className="grid gap-0.5">{PRIMARY.map(link)}</ul>
      <ul className="grid gap-0.5">{SECONDARY.map(link)}</ul>
      <div>
        <p className="px-3.5 text-xs font-medium text-ink-3">Coming later</p>
        <ul className="mt-2 grid gap-0.5">
          {ROADMAP.map((r) => (
            <li key={r.label} title={`${r.label} isn't built yet.`} className="flex h-9 cursor-default items-center gap-3 px-3.5 text-[14px] text-ink-3">
              <LockSimpleIcon size={16} className="shrink-0" aria-hidden />
              <span className="min-w-0 truncate">{r.label}</span>
              <span className="sr-only">, not available yet</span>
              <span className="ml-auto shrink-0 whitespace-nowrap rounded-full border border-dashed border-line-strong/50 px-2 text-xs">Planned</span>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  );
}

// Five slots on phones: Tasks, Sandbox, Agents and Mesh are reached through More there.
const ON_MORE = ["/app/tasks", "/app/sandbox", "/app/agents", "/app/mesh"];
const TABS: NavItem[] = [...PRIMARY.filter((i) => !ON_MORE.includes(i.href)), { href: "/app/more", label: "More", short: "More", icon: DotsThreeOutlineIcon }];

export function MobileTabBar({ approvals, helpUnread = 0 }: { approvals: number; helpUnread?: number }) {
  const pathname = usePathname();
  const moreActive = ["/app/more", "/app/billing", "/app/settings", "/app/workspaces", "/app/help", ...ON_MORE].some((p) => pathname.startsWith(p));
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
                transitionTypes={PAGE_NAV}
                aria-current={active ? "page" : undefined}
                className={`relative flex h-16 flex-col items-center justify-center gap-1 text-[11px] ${active ? "font-medium text-accent" : "text-ink-2"}`}
              >
                <item.icon size={22} weight={active ? "fill" : "regular"} aria-hidden />
                {item.short}
                {item.href === "/app/approvals" && approvals > 0 ? (
                  <span className="absolute right-[calc(50%-20px)] top-2 min-w-4 rounded-full bg-approval px-1 text-center text-[11px] font-semibold leading-4 text-surface tabular">
                    {approvals}
                    <span className="sr-only"> waiting</span>
                  </span>
                ) : null}
                {/* Help lives under More on phones; a dot there says Farbaek replied. */}
                {item.href === "/app/more" && helpUnread > 0 ? (
                  <span className="absolute right-[calc(50%-16px)] top-2.5 size-2.5 rounded-full bg-accent ring-2 ring-surface">
                    <span className="sr-only">, Farbaek replied to your request</span>
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
