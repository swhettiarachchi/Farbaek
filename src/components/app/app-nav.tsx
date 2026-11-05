"use client";

import {
  CaretDownIcon,
  CaretRightIcon,
  GraphIcon,
  ChartPieSliceIcon,
  ClockCounterClockwiseIcon,
  CheckSquareOffsetIcon,
  DesktopIcon,
  DotsThreeOutlineIcon,
  FlowArrowIcon,
  FolderSimpleIcon,
  GearSixIcon,
  HammerIcon,
  HouseSimpleIcon,
  LifebuoyIcon,
  ListChecksIcon,
  PackageIcon,
  PlugsConnectedIcon,
  ShieldCheckIcon,
  SirenIcon,
  SquaresFourIcon,
  TerminalWindowIcon,
} from "@phosphor-icons/react";
import type { Icon } from "@phosphor-icons/react";
import Link from "next/link";
import { PAGE_NAV } from "@/components/app/page-transition";
import { usePathname } from "next/navigation";
import { useId, useState, useSyncExternalStore, type ReactNode } from "react";

export interface NavItem {
  href: string;
  /** The plain name people see (ADR 0170). */
  label: string;
  short: string;
  icon: Icon;
  /** What it's for, in one line a beginner can read, on the More page. */
  about: string;
  /** The product's other names for it, so search finds them. */
  also?: readonly string[];
  exact?: boolean;
}

/** What most people need, always in view. */
const CORE: NavItem[] = [
  { href: "/app", label: "Home", short: "Home", icon: HouseSimpleIcon, exact: true, about: "What's happening, and what needs you.", also: ["Mission Control"] },
  { href: "/app/build", label: "Build", short: "Build", icon: HammerIcon, about: "Everything the agent is building or has built." },
  { href: "/app/projects", label: "Projects", short: "Projects", icon: FolderSimpleIcon, about: "Your sites and apps." },
  { href: "/app/tasks", label: "Tasks", short: "Tasks", icon: ListChecksIcon, about: "Every piece of work, and where it stands." },
  { href: "/app/approvals", label: "Approvals", short: "Approvals", icon: CheckSquareOffsetIcon, about: "Changes waiting for your yes or no." },
];

/** Useful, not needed every day: one labelled group, opened when wanted. */
const TOOLS: NavItem[] = [
  { href: "/app/sandbox", label: "Test space", short: "Test space", icon: TerminalWindowIcon, about: "Run an app and try it, safely apart from everything else.", also: ["Sandbox", "Terminal"] },
  { href: "/app/agents", label: "Desktop app", short: "Desktop app", icon: DesktopIcon, about: "Let the agent work on your own computer.", also: ["Agents", "Farbaek Agent"] },
  { href: "/app/mesh", label: "Move projects", short: "Move", icon: PackageIcon, about: "Send a project to another computer or workspace as one file.", also: ["Mesh", "Capsule"] },
  { href: "/app/workflows", label: "Workflows", short: "Workflows", icon: FlowArrowIcon, about: "A bigger goal, done step by step." },
  { href: "/app/policies", label: "Rules", short: "Rules", icon: ShieldCheckIcon, about: "What needs a person's approval before it changes.", also: ["Policies"] },
  { href: "/app/incidents", label: "Problems and pause", short: "Problems", icon: SirenIcon, about: "What went wrong, and a button that stops every agent.", also: ["Incidents", "Emergency"] },
  { href: "/app/activity", label: "History", short: "History", icon: ClockCounterClockwiseIcon, about: "Everything that has happened in this workspace.", also: ["Activity", "Audit log"] },
  { href: "/app/integrations", label: "Connections", short: "Connections", icon: PlugsConnectedIcon, about: "GitHub, hosting and the other services you've linked.", also: ["Integrations"] },
  { href: "/app/trust", label: "Who can do what", short: "Access", icon: GraphIcon, about: "See who and what can change each project.", also: ["Trust graph", "Permissions"] },
];

/** Yours and the workspace's, at the end of the list. */
const ACCOUNT: NavItem[] = [
  { href: "/app/billing", label: "Billing and usage", short: "Billing", icon: ChartPieSliceIcon, about: "Your plan, and how much you've used." },
  { href: "/app/settings", label: "Settings", short: "Settings", icon: GearSixIcon, about: "Your workspace, its people and your preferences." },
  { href: "/app/help", label: "Help and support", short: "Help", icon: LifebuoyIcon, about: "Ask a question or report a problem." },
];

/** Every page in the app's navigation, for the command palette. */
export const APP_PAGES: readonly NavItem[] = [...CORE, ...TOOLS, ...ACCOUNT];

// The phone's five tabs: Tasks is reached through More there, with the tools and the account pages.
const TAB_ITEMS = CORE.filter((i) => i.href !== "/app/tasks");
/** The rows on the phone's More page, in order. */
export const MORE_PAGES: readonly NavItem[] = [...CORE.filter((i) => i.href === "/app/tasks"), ...TOOLS, ...ACCOUNT];

function isActive(pathname: string, item: NavItem): boolean {
  return item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
}

const TOOLS_KEY = "farbaek.nav.tools";
const TOOLS_EVENT = "farbaek-nav-tools";

function readToolsOpen(): boolean {
  if (toolsThisVisit !== null) return toolsThisVisit;
  try {
    return localStorage.getItem(TOOLS_KEY) === "1";
  } catch {
    return false;
  }
}

/** Set only when the browser refused to remember, so the group keeps working without it. */
let toolsThisVisit: boolean | null = null;

function subscribeTools(onChange: () => void) {
  window.addEventListener(TOOLS_EVENT, onChange);
  return () => window.removeEventListener(TOOLS_EVENT, onChange);
}

function writeToolsOpen(open: boolean) {
  try {
    localStorage.setItem(TOOLS_KEY, open ? "1" : "0");
  } catch {
    // Private windows can refuse it; the group still opens and closes for this visit.
    toolsThisVisit = open;
  }
  window.dispatchEvent(new Event(TOOLS_EVENT));
}

function Badge({ count, tone = "approval", label = "waiting" }: { count: number; tone?: "approval" | "accent"; label?: string }) {
  if (count <= 0) return null;
  return (
    <span className={`ml-auto min-w-5 rounded-full px-1.5 text-center text-[0.6875rem] font-semibold leading-5 text-surface tabular ${tone === "accent" ? "bg-accent" : "bg-approval"}`}>
      {count > 99 ? "99+" : count}
      <span className="sr-only"> {label}</span>
    </span>
  );
}

export function SidebarNav({ approvals, helpUnread = 0 }: { approvals: number; helpUnread?: number }) {
  const pathname = usePathname();
  const toolsId = useId();
  const link = (item: NavItem) => {
    const active = isActive(pathname, item);
    return (
      <li key={item.href}>
        <Link
          href={item.href}
          transitionTypes={PAGE_NAV}
          aria-current={active ? "page" : undefined}
          className={`flex h-10 items-center gap-3 rounded-full px-3.5 text-[0.90625rem] transition-colors duration-150 ${
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

  const onATool = TOOLS.some((t) => isActive(pathname, t));
  const remembered = useSyncExternalStore(subscribeTools, readToolsOpen, () => false);
  // Someone on one of the tools sees it in its group, until they close the group themselves.
  const [closedHere, setClosedHere] = useState(false);
  const open = remembered || (onATool && !closedHere);

  return (
    <nav aria-label="App" className="grid gap-5">
      <ul className="grid gap-0.5">{CORE.map(link)}</ul>
      <div>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={toolsId}
          onClick={() => {
            setClosedHere(open);
            writeToolsOpen(!open);
          }}
          className="flex h-10 w-full items-center gap-3 rounded-full px-3.5 text-[0.90625rem] text-ink-2 transition-colors duration-150 hover:bg-surface/70 hover:text-ink"
        >
          <SquaresFourIcon size={19} aria-hidden />
          More tools
          <CaretDownIcon size={14} weight="bold" aria-hidden className={`ml-auto text-ink-3 motion-safe:transition-transform motion-safe:duration-200 ${open ? "rotate-180" : ""}`} />
        </button>
        {/* It folds by its height; while it's closed nothing inside can be reached, by Tab or a screen reader. */}
        <div id={toolsId} inert={!open} className={`grid motion-safe:transition-[grid-template-rows] motion-safe:duration-200 ${open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
          <ul className={`grid min-h-0 gap-0.5 overflow-hidden ${open ? "pt-0.5" : "invisible"}`}>{TOOLS.map(link)}</ul>
        </div>
      </div>
      <ul className="grid gap-0.5">{ACCOUNT.map(link)}</ul>
    </nav>
  );
}

const TABS: NavItem[] = [...TAB_ITEMS, { href: "/app/more", label: "More", short: "More", icon: DotsThreeOutlineIcon, about: "Every other tool, and your account." }];

/** The phone's More page: every other page, each with one plain line saying what it's for. */
export function MoreList({ helpUnread = 0, children }: { helpUnread?: number; children?: ReactNode }) {
  return (
    <ul className="divide-y divide-line overflow-hidden rounded-md border border-line bg-surface shadow-e1">
      {MORE_PAGES.map((item) => (
        <li key={item.href}>
          <Link href={item.href} transitionTypes={PAGE_NAV} className="flex min-h-16 items-center gap-3 px-4 py-3 hover:bg-canvas-2">
            <item.icon size={20} className="shrink-0 text-ink-2" aria-hidden />
            <span className="grid min-w-0 gap-0.5">
              <span className="text-[0.9375rem]">{item.label}</span>
              <span className="text-[0.8125rem] leading-snug text-ink-3">{item.about}</span>
            </span>
            {item.href === "/app/help" && helpUnread > 0 ? (
              <span className="ml-auto shrink-0 rounded-full bg-accent px-2 text-xs font-semibold leading-5 text-surface tabular">
                {helpUnread} new {helpUnread === 1 ? "reply" : "replies"}
              </span>
            ) : null}
            <CaretRightIcon size={16} className={`shrink-0 text-ink-3 ${item.href === "/app/help" && helpUnread > 0 ? "" : "ml-auto"}`} aria-hidden />
          </Link>
        </li>
      ))}
      {children}
    </ul>
  );
}

export function MobileTabBar({ approvals, helpUnread = 0 }: { approvals: number; helpUnread?: number }) {
  const pathname = usePathname();
  const moreActive = ["/app/more", "/app/workspaces", ...MORE_PAGES.map((p) => p.href)].some((p) => pathname.startsWith(p));
  return (
    <nav
      aria-label="App"
      data-hide-for-keyboard
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
                className={`relative flex h-[64px] flex-col items-center justify-center gap-1 text-[min(0.6875rem,14px)] leading-tight ${active ? "font-medium text-accent" : "text-ink-2"}`}
              >
                <item.icon size={22} weight={active ? "fill" : "regular"} aria-hidden />
                {item.short}
                {item.href === "/app/approvals" && approvals > 0 ? (
                  <span className="absolute right-[calc(50%-20px)] top-[8px] flex h-[16px] min-w-[16px] items-center justify-center rounded-full bg-approval px-[4px] text-[min(0.6875rem,12px)] font-semibold text-surface tabular">
                    {approvals}
                    <span className="sr-only"> waiting</span>
                  </span>
                ) : null}
                {/* Help lives under More on phones; a dot there says Farbaek replied. */}
                {item.href === "/app/more" && helpUnread > 0 ? (
                  <span className="absolute right-[calc(50%-16px)] top-[10px] size-[10px] rounded-full bg-accent ring-2 ring-surface">
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
