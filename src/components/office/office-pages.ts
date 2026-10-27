/**
 * Office Space's pages, as plain data both the client nav and server pages
 * can import (a "use client" module's values aren't usable on the server).
 * Hrefs are the visible paths; the office host maps them under /office.
 */
export const OFFICE_PAGES = [
  { segment: null, href: "/", label: "Overview", short: "Overview", group: "people" },
  { segment: "workspaces", href: "/workspaces", label: "Workspaces", short: "Workspaces", group: "people" },
  { segment: "people", href: "/people", label: "People", short: "People", group: "people" },
  { segment: "support", href: "/support", label: "Support", short: "Support", group: "people" },
  { segment: "activity", href: "/activity", label: "Activity", short: "Activity", group: "people" },
  { segment: "sites", href: "/sites", label: "Sites", short: "Sites", group: "platform" },
  { segment: "health", href: "/health", label: "Health", short: "Health", group: "platform" },
  { segment: "controls", href: "/controls", label: "Controls", short: "Controls", group: "platform" },
  { segment: "models", href: "/models", label: "Models", short: "Models", group: "platform" },
  { segment: "payments", href: "/payments", label: "Payments", short: "Payments", group: "platform" },
  { segment: "announcements", href: "/announcements", label: "Announcements", short: "News", group: "platform" },
  { segment: "staff", href: "/staff", label: "Staff", short: "Staff", group: "you" },
  { segment: "audit", href: "/audit", label: "Audit log", short: "Audit", group: "you" },
  { segment: "security", href: "/security", label: "My security", short: "Security", group: "you" },
] as const satisfies readonly { segment: string | null; href: string; label: string; short: string; group: "people" | "platform" | "you" }[];

export type OfficeHref = (typeof OFFICE_PAGES)[number]["href"];

/** The four the phone bar shows; the rest sit under More. */
export const OFFICE_BAR: readonly OfficeHref[] = ["/", "/workspaces", "/support", "/controls"];
