/**
 * The template gallery (Phase D): finished-looking static sites with sample
 * content the agent replaces, built to the Studio standard (ADR 0030): each
 * has a DESIGN.md, its own look and motion, and a feature that works.
 * HTML, CSS and a little JavaScript with nothing to install, so each previews
 * instantly. The premium directions (ADR 0158, ADR 0160, ADR 0163, ADR 0165)
 * are on the Studio kit with real stand-in photos and web fonts; the dashboard
 * and CRM are self-contained apps.
 */
import type { Starter } from "../types";
import { BLOG_FILES } from "./blog";
import { EVENT_PAGE_FILES } from "./event-page";
import { LANDING_PAGE_FILES } from "./landing-page";
import { LOCAL_BUSINESS_FILES } from "./local-business";
import { LUXURY_FILES } from "./luxury";
import { ONLINE_STORE_FILES } from "./online-store";
import { BOOKING_FILES } from "./booking";
import { CRM_FILES } from "./crm";
import { DASHBOARD_FILES } from "./dashboard";
import { PORTFOLIO_FILES } from "./portfolio";
import { SAAS_SITE_FILES } from "./saas-site";

const site = (s: Omit<Starter, "run" | "staticPreview" | "kind">): Starter => ({ ...s, run: null, staticPreview: true, kind: "template" });

export const TEMPLATES: readonly Starter[] = [
  site({
    id: "landing-page",
    name: "Product launch",
    summary: "One product, told like a flagship launch: a tilting hero, a dark chapter where the sound settles as you scroll, a closer look and pre-orders.",
    files: LANDING_PAGE_FILES,
    examplePrompt: "Make this the launch page for our insulated water bottle, with pre-orders at $39 shipping in June.",
  }),
  site({
    id: "saas-site",
    name: "Software site",
    summary: "A software product with plans: a working ledger floating in 3D, a dark chapter where every follow-up plays out, and pricing.",
    files: SAAS_SITE_FILES,
    examplePrompt: "Turn this into the site for my appointment booking app for clinics, with plans at $12 and $29 a month.",
  }),
  site({
    id: "portfolio",
    name: "Portfolio",
    summary: "Your work, big: your name across the page, photos that tilt, an index with a floating preview and a viewer.",
    files: PORTFOLIO_FILES,
    examplePrompt: "Make this my photography portfolio with five projects, a short bio and my email.",
  }),
  site({
    id: "local-business",
    name: "Bakery and café",
    summary: "Food, made to be craved: real bakery photos, a 3D bake-time ticket, a live open-now status and a menu you can filter.",
    files: LOCAL_BUSINESS_FILES,
    examplePrompt: "Make this the site for my bakery in Kandy, open 6am to 8pm every day, with our cakes and buns.",
  }),
  site({
    id: "luxury",
    name: "Hotel, spa and luxury",
    summary: "Quiet and exclusive: a cinematic hero, the suites floating on a 3D arc, real hotel and spa photos and an enquiry form.",
    files: LUXURY_FILES,
    examplePrompt: "Make this the site for my boutique villa in Ella with four rooms, a yoga deck and breakfast from the garden.",
  }),
  site({
    id: "event-page",
    name: "Event page",
    summary: "One date: a live countdown, a schedule by day and track, real event photos and a 3D ticket that fills in as you register.",
    files: EVENT_PAGE_FILES,
    examplePrompt: "Make this the page for our book club meetup on 3 May at the city library, with three talks.",
  }),
  site({
    id: "blog",
    name: "Blog",
    summary: "Writing first: a featured story, topics and a search, real photos, and essays with a reading line and contents that follow you.",
    files: BLOG_FILES,
    examplePrompt: "Make this my cooking blog called Kitchen Table, with three recipe posts.",
  }),
  site({
    id: "online-store",
    name: "Online store",
    summary: "A store that sells: real product photos, filters and sorting, sizes, a wishlist and a bag drawer that remembers what's in it.",
    files: ONLINE_STORE_FILES,
    examplePrompt: "Make this the store for my handmade candle shop, with six scents at $18 to $32 and free delivery over $50.",
  }),
  site({
    id: "booking",
    name: "Booking",
    summary: "Book a chair: services and people, two weeks of real open times, a summary that follows you and a 3D next-free card.",
    files: BOOKING_FILES,
    examplePrompt: "Make this the booking site for my barber shop, with a 30 minute cut at $25 and a beard trim at $15, open Tuesday to Saturday.",
  }),
  site({
    id: "dashboard",
    name: "Dashboard",
    summary: "A back office: key numbers, a revenue chart you can read by day, and an orders table with search and CSV export.",
    files: DASHBOARD_FILES,
    examplePrompt: "Turn this into a dashboard for my tutoring business: lessons, students and monthly income.",
  }),
  site({
    id: "crm",
    name: "CRM",
    summary: "A studio pipeline: deals you move between stages, a flow bar of where the value sits, and contacts you can search and sort.",
    files: CRM_FILES,
    examplePrompt: "Make this the CRM for my wedding photography business: enquiries, booked shoots and follow-ups.",
  }),
];
