/**
 * Sharing one project (ADR 0188): guests and read-only links. The rules
 * here mirror the database's (migration v91), which enforces them again.
 */
import { screenFile, screenPath } from "./files";
import { isImagePath } from "./images";

export const GUEST_ACCESS = ["view", "edit"] as const;
export type GuestAccess = (typeof GUEST_ACCESS)[number];

export const GUEST_ACCESS_LABELS: Record<GuestAccess, { title: string; detail: string }> = {
  view: { title: "Can view", detail: "Reads the files, tasks, plans and proof. Free, up to 10 people a project." },
  edit: { title: "Can edit", detail: "Also changes files and adds tasks. Uses a seat. AI, test spaces, approving and publishing stay with your workspace." },
};

export function isGuestAccess(value: unknown): value is GuestAccess {
  return value === "view" || value === "edit";
}

/** How long a read-only link lasts: a number of days, or until someone turns it off. */
export const LINK_LIFETIMES = ["7", "30", "open"] as const;
export type LinkLifetime = (typeof LINK_LIFETIMES)[number];

export const LINK_LIFETIME_LABELS: Record<LinkLifetime, string> = {
  "7": "7 days",
  "30": "30 days",
  open: "Until I turn it off",
};

export function isLinkLifetime(value: unknown): value is LinkLifetime {
  return typeof value === "string" && (LINK_LIFETIMES as readonly string[]).includes(value);
}

/** When a link made now stops working, or null for one that lasts until it's turned off. */
export function linkExpiry(lifetime: LinkLifetime, now: Date): Date | null {
  return lifetime === "open" ? null : new Date(now.getTime() + Number(lifetime) * 86_400_000);
}

/** The states a link can be in, as the database reports them. */
export const LINK_STATES = ["live", "none", "revoked", "expired", "paused", "archived", "suspended", "blocked"] as const;
export type LinkState = (typeof LINK_STATES)[number];

/** What someone opening a link that doesn't work reads. Never says whose project it was. */
export const LINK_CLOSED: Record<Exclude<LinkState, "live">, { title: string; detail: string }> = {
  none: { title: "This link doesn't work", detail: "Check that you copied all of it, or ask the person who sent it for a new one." },
  revoked: { title: "This link was turned off", detail: "Ask the person who sent it for a new one." },
  expired: { title: "This link has expired", detail: "Ask the person who sent it for a new one." },
  paused: { title: "Links are paused for a short while", detail: "Farbaek has paused shared links for everyone. Try again soon." },
  archived: { title: "This project isn't shared any more", detail: "Ask the person who sent the link." },
  suspended: { title: "This project isn't available right now", detail: "Ask the person who sent the link." },
  blocked: { title: "This project isn't available", detail: "Ask the person who sent the link." },
};

export type ShareVisibility = { visible: true } | { visible: false; reason: string };

/**
 * Whether a file can be shown through a link, by its path alone: never
 * credentials files or anything in a dependency or build folder.
 */
export function sharePathVisible(path: string): ShareVisibility {
  const screened = screenPath(path);
  if (screened.ok) return { visible: true };
  if (screened.reason === "secret_file") return { visible: false, reason: "It's a file that holds keys or passwords." };
  return { visible: false, reason: "It isn't part of the project's own files." };
}

/** Whether a text file's content can be shown: never content that looks like a key. */
export function shareContentVisible(path: string, content: string): ShareVisibility {
  if (isImagePath(path)) return sharePathVisible(path);
  const screened = screenFile(path, content, new TextEncoder().encode(content).length, Number.MAX_SAFE_INTEGER);
  if (screened.ok) return { visible: true };
  if (screened.reason === "secret_content") return { visible: false, reason: "It looks like it holds a key or password, so it's hidden." };
  if (screened.reason === "binary") return { visible: false, reason: "It isn't a text file." };
  return sharePathVisible(path);
}
