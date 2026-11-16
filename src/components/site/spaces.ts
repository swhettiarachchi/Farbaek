import { ChatCircleTextIcon, CompassToolIcon, FilmSlateIcon, HammerIcon, ImageSquareIcon, SealCheckIcon } from "@phosphor-icons/react/ssr";
import type { Icon } from "@phosphor-icons/react";

/**
 * Farbaek AI's spaces (ADR 0214, ADR 0216): each has its own public page and its own place in the app, and every place that
 * names them reads this list (the header, the phone menu, the footer, the homepage and the app's Home), so a space is called
 * the same thing, with the same icon and promise, everywhere. Chat leads; Images, Video and Build stand beside it; Survey
 * Studio and Proof are there for the people who need them, without taking the front of the stage.
 */
export interface Space {
  id: "chat" | "images" | "video" | "build" | "survey" | "proof";
  /** Its name. */
  name: string;
  /** A shorter name where room is tight. */
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
  /** A specialist's space: reachable everywhere, never in the front row. */
  secondary?: true;
}

export const SPACES: readonly Space[] = [
  {
    id: "chat",
    name: "Chat",
    short: "Chat",
    icon: ChatCircleTextIcon,
    page: "/chat",
    app: "/app/chat",
    open: "Open Chat",
    promise: "Ask, write, code and think things through with Farbaek AI, with your own files.",
  },
  {
    id: "images",
    name: "Images",
    short: "Images",
    icon: ImageSquareIcon,
    page: "/images",
    app: "/app/images",
    open: "Open the image studio",
    promise: "Make and edit pictures with studio light and finish, from words or your own photos.",
  },
  {
    id: "video",
    name: "Video",
    short: "Video",
    icon: FilmSlateIcon,
    page: "/video",
    app: "/app/video",
    open: "Open the video studio",
    promise: "Make short films with sound, wide or vertical, from a sentence or a picture.",
  },
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
    id: "survey",
    name: "Survey Studio",
    short: "Survey",
    icon: CompassToolIcon,
    page: "/survey",
    app: "/app/survey",
    open: "Open Survey Studio",
    promise: "Land survey plans from field data, checked and drawn to scale as PDF and DXF.",
    secondary: true,
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
    secondary: true,
  },
];

/** The spaces in the front row. */
export const MAIN_SPACES = SPACES.filter((s) => !s.secondary);

/** A space's app address for someone who may not be signed in yet: sign-in first, then straight there. */
export function spaceStart(space: Space): string {
  return `/sign-in?next=${space.app}`;
}

export function space(id: Space["id"]): Space {
  return SPACES.find((s) => s.id === id)!;
}

/** The public site's other pages, after the spaces. */
export const MORE_LINKS = [
  { href: "/pricing", label: "Pricing" },
  { href: "/security", label: "Security tests" },
  { href: "/verify", label: "Check a ProofPack" },
] as const;
