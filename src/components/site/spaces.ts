import { ChatCircleTextIcon, CompassToolIcon, HammerIcon, SealCheckIcon } from "@phosphor-icons/react/ssr";
import type { Icon } from "@phosphor-icons/react";

/**
 * Farbaek's four spaces (ADR 0214): each has its own public page and its own place in the app, and every place that names
 * them reads this list (the header, the phone menu, the footer, the homepage's window and the app's Home), so a space is
 * called the same thing, with the same icon and promise, everywhere.
 */
export interface Space {
  id: "build" | "chat" | "survey" | "proof";
  /** Its name. */
  name: string;
  /** A shorter name where room is tight: the homepage window's tabs. */
  short: string;
  icon: Icon;
  /** The public page that explains it. */
  page: string;
  /** Where it opens in the app, through sign-in for a visitor. */
  app: string;
  /** What opening it is called on a button. */
  open: string;
  /** One line a first-time visitor can read. */
  promise: string;
}

export const SPACES: readonly Space[] = [
  {
    id: "build",
    name: "Build",
    short: "Build",
    icon: HammerIcon,
    page: "/build",
    app: "/app/new",
    open: "Start building",
    promise: "Describe a site or app. The agent plans, builds and checks it, and waits for your approval.",
  },
  {
    id: "chat",
    name: "Chat",
    short: "Chat",
    icon: ChatCircleTextIcon,
    page: "/chat",
    app: "/app/chat",
    open: "Open Chat",
    promise: "Ask, write and code with AI, with your own files, in a chat only you can see.",
  },
  {
    id: "survey",
    name: "Survey Studio",
    short: "Survey",
    icon: CompassToolIcon,
    page: "/survey",
    app: "/app/survey",
    open: "Open Survey Studio",
    promise: "Land survey plans from field data, checked and drawn to scale as PDF and DXF.",
  },
  {
    id: "proof",
    name: "Proof",
    short: "Proof",
    icon: SealCheckIcon,
    page: "/proof",
    app: "/app/approvals",
    open: "Open approvals",
    promise: "Approvals bound to exactly what you saw, checks that really ran, and ProofPacks anyone can verify.",
  },
];

/** A space's app address for someone who may not be signed in yet: sign-in first, then straight there. */
export function spaceStart(space: Space): string {
  return `/sign-in?next=${space.app}`;
}

/** The public site's other pages, after the spaces. */
export const MORE_LINKS = [
  { href: "/pricing", label: "Pricing" },
  { href: "/security", label: "Security tests" },
  { href: "/verify", label: "Check a ProofPack" },
] as const;
