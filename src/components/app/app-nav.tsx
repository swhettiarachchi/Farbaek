"use client";

import {
  ChatCircleTextIcon,
  BookOpenTextIcon,
  CalendarCheckIcon,
  CaretDownIcon,
  CaretRightIcon,
  GraphIcon,
  ClockCounterClockwiseIcon,
  CompassToolIcon,
  CheckCircleIcon,
  CreditCardIcon,
  DesktopIcon,
  DotsThreeOutlineIcon,
  VideoCameraIcon,
  FlowArrowIcon,
  GearSixIcon,
  BlocksIcon,
  HouseSimpleIcon,
  ImageSquareIcon,
  LifebuoyIcon,
  ListBulletsIcon,
  ListChecksIcon,
  PackageIcon,
  PlugsConnectedIcon,
  ScalesIcon,
  SirenIcon,
  SlidersHorizontalIcon,
  FolderSimpleIcon,
  TerminalWindowIcon,
  ToolboxIcon,
  UsersThreeIcon,
} from "@/components/icons";
import type { Icon } from "@/components/icons";
import Link from "next/link";
import { PAGE_NAV } from "@/components/app/page-transition";
import { usePathname } from "next/navigation";
import { useId, useState, useSyncExternalStore, type ReactNode } from "react";
import { BrandLogo } from "@/components/brand/brand-logo";
import { useNavCounts } from "@/components/app/nav-counts";
import { useLevel } from "@/components/experience/apply";
import { atLevel, hiddenLine, type Level } from "@/core/experience/level";

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
  /** The level whose menus first list it (stage 285, ADR 0293). Without one, every level does. It is never a lock. */
  from?: Level;
}

/** What most people need, always in view: Farbaek AI's spaces (ADR 0214, ADR 0216) and the work in them. */
const CORE: NavItem[] = [
  { href: "/app", label: "Home", short: "Home", icon: HouseSimpleIcon, exact: true, about: "What's happening, and what needs you.", also: ["Mission Control"] },
  { href: "/app/chat", label: "Chat", short: "Chat", icon: ChatCircleTextIcon, about: "Ask, write, code and research with Farbaek AI.", also: ["AI chat", "Assistant", "Ask AI", "Farbaek AI"] },
  { href: "/app/images", label: "Images", short: "Images", icon: ImageSquareIcon, about: "Make and edit pictures with studio finish.", also: ["Image studio", "Pictures", "Image generation", "Photos"] },
  { href: "/app/video", label: "Video", short: "Video", icon: VideoCameraIcon, about: "Make short videos with sound, from words or a picture.", also: ["Video studio", "Videos", "Video generation", "Film"] },
  { href: "/app/build", label: "Build", short: "Build", icon: BlocksIcon, about: "Everything the agent is building or has built." },
  { href: "/app/projects", label: "Projects", short: "Projects", icon: FolderSimpleIcon, about: "Your sites and apps." },
  { href: "/app/scheduled", label: "Scheduled", short: "Scheduled", icon: CalendarCheckIcon, about: "Work Farbaek does by itself, at the times you set.", also: ["Scheduled tasks", "Automations", "Recurring", "Reminders", "Schedule", "Agents", "Personal agents"] },
  { href: "/app/approvals", label: "Approvals", short: "Approvals", icon: CheckCircleIcon, about: "Changes waiting for your yes or no." },
];

/**
 * Useful, not needed every day: one labelled group, opened when wanted. Survey Studio leads it: a specialist's space (ADR 0216).
 * A person's level (stage 285, ADR 0293) picks how many of these the menus list: the everyday ones at Standard, the tools for
 * building from Advanced, and the rules and records at Professional. Search reaches all of them at every level.
 */
const TOOLS: NavItem[] = [
  { href: "/app/work", label: "All work", short: "All work", icon: ListChecksIcon, about: "Everything Farbaek is doing for you, and one pause.", also: ["Command center", "In progress", "Running", "What Farbaek is doing"] },
  { href: "/app/tasks", label: "Tasks", short: "Tasks", icon: ListBulletsIcon, about: "Every piece of work, and where it stands." },
  { href: "/app/survey", label: "Survey Studio", short: "Survey", icon: CompassToolIcon, about: "Land survey plans from field data, drawn to scale as PDF and DXF.", also: ["Survey", "Land survey", "Cadastral", "Survey plan", "DXF"] },
  { href: "/app/sandbox", label: "Test space", short: "Test space", icon: TerminalWindowIcon, about: "Run an app and try it, safely apart from everything else.", also: ["Sandbox", "Terminal"], from: "advanced" },
  { href: "/app/skills", label: "Skills", short: "Skills", icon: BookOpenTextIcon, about: "Teach the agent how to design and build, from a library or your own.", also: ["SKILL.md", "Claude Skills", "Design skills"], from: "advanced" },
  { href: "/app/agents", label: "Desktop app", short: "Desktop app", icon: DesktopIcon, about: "Let the agent work on your own computer.", also: ["Agents", "Farbaek Agent"] },
  { href: "/app/mesh", label: "Move projects", short: "Move", icon: PackageIcon, about: "Send a project to another computer or workspace as one file.", also: ["Mesh", "Capsule"], from: "advanced" },
  { href: "/app/workflows", label: "Workflows", short: "Workflows", icon: FlowArrowIcon, about: "A bigger goal, done step by step.", from: "advanced" },
  { href: "/app/policies", label: "Rules", short: "Rules", icon: ScalesIcon, about: "What needs a person's approval before it changes.", also: ["Policies"], from: "professional" },
  { href: "/app/incidents", label: "Problems and pause", short: "Problems", icon: SirenIcon, about: "What went wrong, and a button that stops every agent.", also: ["Incidents", "Emergency"], from: "professional" },
  { href: "/app/activity", label: "History", short: "History", icon: ClockCounterClockwiseIcon, about: "Everything that has happened in this workspace.", also: ["Activity", "Audit log"], from: "advanced" },
  { href: "/app/integrations", label: "Connections", short: "Connections", icon: PlugsConnectedIcon, about: "GitHub, hosting and the other services you've linked.", also: ["Integrations"] },
  { href: "/app/trust", label: "Who can do what", short: "Access", icon: GraphIcon, about: "See who and what can change each project.", also: ["Trust graph", "Permissions"], from: "professional" },
];

/** Yours and the workspace's, at the end of the list. */
const ACCOUNT: NavItem[] = [
  { href: "/app/billing", label: "Billing and usage", short: "Billing", icon: CreditCardIcon, about: "Your plan, and how much you've used." },
  { href: "/app/settings", label: "Settings", short: "Settings", icon: GearSixIcon, about: "Your workspace, its people and your preferences." },
  { href: "/shared", label: "Shared with you", short: "Shared", icon: UsersThreeIcon, about: "Projects other workspaces invited you to.", also: ["Guest", "Shared projects"] },
  { href: "/app/help", label: "Help and support", short: "Help", icon: LifebuoyIcon, about: "Ask a question or report a problem." },
];

/**
 * The places of Farbaek, in the one order every frame lists them (stage 287, ADR 0295): the app's sidebar, Chat's, the
 * studios' and the rail beside Build's workspace all draw this list with `PlacesNav`. A new place goes here, once.
 */
export const PLACES: readonly NavItem[] = CORE;

/** Every other page, from the frames that have no room for the tools and the account: one row that leads to them all. */
const MORE_PLACE: NavItem = { href: "/app/more", label: "More", short: "More", icon: DotsThreeOutlineIcon, about: "Every other tool, and your account." };

/** Every page in the app's navigation, for the command palette. */
export const APP_PAGES: readonly NavItem[] = [...CORE, ...TOOLS, ...ACCOUNT];

// The phone's five tabs (ADR 0228): Home, Chat, Build, Approvals and More. Every product studied opens on a box to type
// in, so Chat is a tab. Projects, Tasks, Images and Video are reached through More there, with the tools and the account
// pages: five tabs is the most a phone bar holds, and a project is one press from Build and from Home.
const PHONE_EXTRAS = new Set(["/app/projects", "/app/images", "/app/video", "/app/scheduled"]);
const TAB_ITEMS = CORE.filter((i) => !PHONE_EXTRAS.has(i.href));
/** The rows on the phone's More page, in order. */
export const MORE_PAGES: readonly NavItem[] = [...CORE.filter((i) => PHONE_EXTRAS.has(i.href)), ...TOOLS, ...ACCOUNT];

/**
 * On the phone, a page that belongs to a tab lights that tab: a project, a task, a template and checking an app are all
 * part of building. The lists themselves live under More. The desktop sidebar names all of these, so it doesn't need this.
 */
const PHONE_TAB_FOR: readonly { tab: string; page: RegExp }[] = [{ tab: "/app/build", page: /^\/app\/(new(\/|$)|projects\/|tasks\/|templates(\/|$)|rescue(\/|$))/ }];

function isActive(pathname: string, item: NavItem): boolean {
  return item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
}

/** Pages that belong to a place though their address starts elsewhere: Build's workspace and a plan's own page are Build. */
const ALSO_IN: Record<string, RegExp> = { "/app/build": /^\/app\/(?:workbench|new)(?:\/|$)/ };

/** Whether a place is where the person is now. */
export function placeLit(pathname: string, item: NavItem): boolean {
  return isActive(pathname, item) || (ALSO_IN[item.href]?.test(pathname) ?? false);
}

/**
 * A row of the list of places: one look in every frame. 40px with a mouse, 44px on a touch screen, and 48px with larger
 * words on a touch phone, where it sits in a drawer. The phone's height is a two-part variant on purpose: Tailwind writes
 * one-part variants in a fixed order, and `max-md:` alone would lose to `pointer-coarse:`.
 */
export const PLACE_ROW =
  "flex min-h-10 items-center gap-3 rounded-full px-3.5 text-sm text-ink transition-[background-color,box-shadow] duration-150 hover:bg-surface/70 aria-[current=page]:bg-surface aria-[current=page]:font-medium aria-[current=page]:shadow-e1 pointer-coarse:min-h-11 max-md:pointer-coarse:min-h-12 max-md:text-base max-md:font-medium";

/**
 * The list of places (stage 287, ADR 0295), as rows where a frame has a sidebar or a drawer to hold them, and as a rail of
 * icons where the page needs its width. The same places, order, icons and count everywhere.
 *
 * `more` adds the place that leads to every other page, for frames that don't list the tools and the account themselves.
 * `rows` is for a sidebar with a long list of its own under this one (Chat's conversations): that many places are rows,
 * and the rest follow as one strip of icons, so the list underneath keeps its room.
 * `lit` lets a frame say which place is lit where it knows better than the address; it answers undefined to leave it be.
 */
export function PlacesNav({
  form = "rows",
  more = false,
  rows,
  onNavigate,
  lit,
}: {
  form?: "rows" | "rail";
  more?: boolean;
  rows?: number;
  onNavigate?: () => void;
  lit?: (item: NavItem, pathname: string) => boolean | undefined;
}) {
  const pathname = usePathname();
  const { approvals, helpUnread } = useNavCounts();
  const items = more ? [...PLACES, MORE_PLACE] : PLACES;
  const on = (item: NavItem) => lit?.(item, pathname) ?? placeLit(pathname, item);

  // A place as an icon: its name is read out and shown on hover, and the count sits on its corner.
  const icon = (item: NavItem) => (
    <li key={item.href}>
      <Link
        href={item.href}
        transitionTypes={PAGE_NAV}
        onClick={onNavigate}
        title={item.label}
        aria-current={on(item) ? "page" : undefined}
        className="tap relative inline-flex size-10 items-center justify-center rounded-full text-ink transition-[background-color,box-shadow] duration-150 hover:bg-surface/70 aria-[current=page]:bg-surface aria-[current=page]:shadow-e1"
      >
        <item.icon size={20} weight="bold" className="max-md:size-6" aria-hidden />
        <span className="sr-only">{item.label}</span>
        {item.href === "/app/approvals" && approvals > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-approval px-1 text-[0.6875rem] font-semibold leading-none text-on-accent tabular">
            {approvals > 99 ? "99+" : approvals}
            <span className="sr-only"> waiting</span>
          </span>
        ) : null}
        {/* Help is behind More in these frames. The same unread mark as on the phone's tabs says Farbaek replied. */}
        {item.href === MORE_PLACE.href && helpUnread > 0 ? (
          <span className="absolute right-1 top-1 size-[10px] rounded-full bg-accent ring-2 ring-canvas-2">
            <span className="sr-only">, Farbaek replied to your request</span>
          </span>
        ) : null}
      </Link>
    </li>
  );

  // 8px between the 40px circles, so their 48px touch areas meet and never overlap.
  if (form === "rail") return <ul className="grid justify-items-center gap-2">{items.map(icon)}</ul>;

  const asRows = rows === undefined ? items : items.slice(0, rows);
  const asIcons = rows === undefined ? [] : items.slice(rows);
  return (
    <div className="grid gap-1">
      <ul className="grid gap-0.5">
        {asRows.map((item) => (
          <li key={item.href}>
            <Link href={item.href} transitionTypes={PAGE_NAV} onClick={onNavigate} aria-current={on(item) ? "page" : undefined} className={PLACE_ROW}>
              <item.icon size={20} weight="bold" className="shrink-0 max-md:size-6" aria-hidden />
              {item.label}
              {item.href === "/app/approvals" ? <Badge count={approvals} /> : null}
              {item.href === MORE_PLACE.href ? <Badge count={helpUnread} tone="accent" label={helpUnread === 1 ? "new reply" : "new replies"} /> : null}
            </Link>
          </li>
        ))}
      </ul>
      {/* Lined up under the rows' own icons. */}
      {asIcons.length > 0 ? <ul className="flex flex-wrap items-center gap-2 pl-1">{asIcons.map(icon)}</ul> : null}
    </div>
  );
}

/**
 * The list of places as a slim column at the left of a page that needs its width: the studios and Build's workspace. Wide
 * screens only; on a phone those pages keep their own header and drawer.
 */
export function PlacesRail() {
  return (
    <aside className="hidden h-full w-16 shrink-0 flex-col items-center gap-2 overflow-y-auto border-r border-line bg-canvas-2 py-3 [scrollbar-width:none] lg:flex [&::-webkit-scrollbar]:hidden">
      <Link href="/app" aria-label="Farbaek, Home" className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full">
        <BrandLogo height={30} />
      </Link>
      <nav aria-label="App" className="shrink-0">
        <PlacesNav form="rail" more />
      </nav>
    </aside>
  );
}

/** Where a person chooses their level: the row that says more tools exist leads here. */
export const LEVEL_SETTING = "/app/settings#experience";

/**
 * The tools a level lists (stage 285, ADR 0293), and the ones it leaves for a higher level. The tool a person is on is
 * always listed, so nobody stands on a page their own menu doesn't show.
 */
export function toolsAt(level: Level, pathname: string): { rows: NavItem[]; hidden: NavItem[] } {
  return atLevel(TOOLS, level, (item) => isActive(pathname, item));
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
    <span className={`ml-auto min-w-5 rounded-full px-1.5 text-center text-[0.6875rem] font-semibold leading-5 text-on-accent tabular ${tone === "accent" ? "bg-accent" : "bg-approval"}`}>
      {count > 99 ? "99+" : count}
      <span className="sr-only"> {label}</span>
    </span>
  );
}

export function SidebarNav({ helpUnread = 0, level: saved }: { helpUnread?: number; level: Level }) {
  const pathname = usePathname();
  const tools = toolsAt(useLevel(saved), pathname);
  const toolsId = useId();
  const link = (item: NavItem) => {
    const active = isActive(pathname, item);
    return (
      <li key={item.href}>
        <Link
          href={item.href}
          transitionTypes={PAGE_NAV}
          aria-current={active ? "page" : undefined}
          className={PLACE_ROW}
        >
          <item.icon size={20} weight="bold" className="shrink-0" aria-hidden />
          {item.label}
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
      {/* The places, as every frame lists them. */}
      <PlacesNav />
      <div>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={toolsId}
          onClick={() => {
            setClosedHere(open);
            writeToolsOpen(!open);
          }}
          className="flex h-10 w-full items-center gap-3 rounded-full px-3.5 text-sm text-ink pointer-coarse:h-11 transition-colors duration-150 hover:bg-surface/70"
        >
          <ToolboxIcon size={20} weight="bold" aria-hidden />
          More tools
          <CaretDownIcon size={14} weight="bold" aria-hidden className={`ml-auto text-ink-3 motion-safe:transition-transform motion-safe:duration-200 ${open ? "rotate-180" : ""}`} />
        </button>
        {/* It folds by its height; while it's closed nothing inside can be reached, by Tab or a screen reader. */}
        <div id={toolsId} inert={!open} className={`grid motion-safe:transition-[grid-template-rows] motion-safe:duration-200 ${open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
          <ul className={`grid min-h-0 gap-0.5 overflow-hidden ${open ? "pt-0.5" : "invisible"}`}>
            {tools.rows.map(link)}
            {/* What this level leaves out is one press away, and search reaches it too. */}
            {tools.hidden.length > 0 ? (
              <li>
                <Link
                  href={LEVEL_SETTING}
                  transitionTypes={PAGE_NAV}
                  className="flex h-10 items-center gap-3 rounded-full px-3.5 text-sm text-ink-2 transition-colors duration-150 hover:bg-surface/70 hover:text-ink pointer-coarse:h-11"
                >
                  <SlidersHorizontalIcon size={20} weight="bold" className="shrink-0" aria-hidden />
                  Show more tools
                  <span className="sr-only">. {hiddenLine(tools.hidden)}</span>
                </Link>
              </li>
            ) : null}
          </ul>
        </div>
      </div>
      <ul className="grid gap-0.5">{ACCOUNT.map(link)}</ul>
    </nav>
  );
}

const TABS: NavItem[] = [...TAB_ITEMS, MORE_PLACE];

/** The phone's More page: every other page, each with one plain line saying what it's for. */
/**
 * The More page's rows at a level (stage 285, ADR 0293): the same rows as ever, less the tools the level leaves out. Where
 * it leaves any out, a row after the last tool and before the account pages says how many, and leads to the choice.
 */
export function moreRowsAt(level: Level): NavItem[] {
  const tools = atLevel(TOOLS, level);
  const left = new Set(tools.hidden.map((t) => t.href));
  const rows: NavItem[] = MORE_PAGES.filter((p) => !left.has(p.href));
  if (tools.hidden.length > 0) {
    const more: NavItem = { href: LEVEL_SETTING, label: "Show more tools", short: "More tools", icon: SlidersHorizontalIcon, about: hiddenLine(tools.hidden) };
    rows.splice(rows.length - ACCOUNT.length, 0, more);
  }
  return rows;
}

export function MoreList({ helpUnread = 0, level: saved, children }: { helpUnread?: number; level: Level; children?: ReactNode }) {
  const rows = moreRowsAt(useLevel(saved));
  return (
    <ul className="divide-y divide-line overflow-hidden rounded-md border border-line bg-surface shadow-e1">
      {rows.map((item) => (
        <li key={item.href}>
          <Link href={item.href} transitionTypes={PAGE_NAV} className="flex min-h-16 items-center gap-3 px-4 py-3 hover:bg-canvas-2">
            <item.icon size={24} weight="bold" className="shrink-0 text-ink" aria-hidden />
            <span className="grid min-w-0 gap-0.5">
              <span className="text-body">{item.label}</span>
              <span className="text-label leading-snug text-ink-3">{item.about}</span>
            </span>
            {item.href === "/app/help" && helpUnread > 0 ? (
              <span className="ml-auto shrink-0 rounded-full bg-accent px-2 text-xs font-semibold leading-5 text-on-accent tabular">
                {helpUnread} new {helpUnread === 1 ? "reply" : "replies"}
              </span>
            ) : null}
            <CaretRightIcon size={16} weight="bold" className={`shrink-0 text-ink-3 ${item.href === "/app/help" && helpUnread > 0 ? "" : "ml-auto"}`} aria-hidden />
          </Link>
        </li>
      ))}
      {children}
    </ul>
  );
}

export function MobileTabBar({ approvals, helpUnread = 0 }: { approvals: number; helpUnread?: number }) {
  const pathname = usePathname();
  const claimed = PHONE_TAB_FOR.find((c) => c.page.test(pathname))?.tab ?? null;
  const moreActive = !claimed && ["/app/more", "/app/workspaces", ...MORE_PAGES.map((p) => p.href)].some((p) => pathname.startsWith(p));
  return (
    // On a tablet the five tabs spread out, each icon beside its name (ADR 0211), instead of bunching in the middle.
    <nav
      aria-label="App"
      data-hide-for-keyboard
      data-tab-bar
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden"
    >
      <ul className="mx-auto grid max-w-lg grid-cols-5 md:max-w-3xl md:px-4">
        {TABS.map((item) => {
          const active = item.href === "/app/more" ? moreActive : item.href === claimed || (!claimed && isActive(pathname, item));
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                transitionTypes={PAGE_NAV}
                aria-current={active ? "page" : undefined}
                className={`relative flex h-[64px] flex-col items-center justify-center gap-1 text-[min(0.6875rem,14px)] leading-tight md:flex-row md:gap-2 md:text-[min(0.8125rem,15px)] ${active ? "font-medium text-accent" : "text-ink-2"}`}
              >
                <item.icon size={24} weight={active ? "fill" : "bold"} aria-hidden className="md:size-5" />
                {item.short}
                {item.href === "/app/approvals" && approvals > 0 ? (
                  <span className="absolute right-[calc(50%-20px)] top-[8px] flex h-[16px] min-w-[16px] items-center justify-center rounded-full bg-approval md:static px-[4px] text-[min(0.6875rem,12px)] font-semibold text-on-accent tabular">
                    {approvals}
                    <span className="sr-only"> waiting</span>
                  </span>
                ) : null}
                {/* Help lives under More on phones; a dot there says Farbaek replied. */}
                {item.href === "/app/more" && helpUnread > 0 ? (
                  <span className="absolute right-[calc(50%-16px)] top-[10px] size-[10px] rounded-full bg-accent ring-2 ring-surface md:static">
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
