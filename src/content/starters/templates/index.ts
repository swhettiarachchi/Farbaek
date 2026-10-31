/**
 * The template gallery (Phase D): finished-looking static sites with sample
 * content the agent replaces, built to the Studio standard (ADR 0030): each
 * has a DESIGN.md, its own look and motion, and a feature that works.
 * HTML, CSS and a little JavaScript, system fonts, nothing to
 * install and nothing fetched, so each previews instantly and safely.
 */
import type { Starter } from "../types";
import { BLOG_FILES } from "./blog";
import { EVENT_PAGE_FILES } from "./event-page";
import { LANDING_PAGE_FILES } from "./landing-page";
import { LOCAL_BUSINESS_FILES } from "./local-business";
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
    name: "Landing page",
    summary: "One product: a floating 3D week, a planner that works in the browser and an email sign-up.",
    files: LANDING_PAGE_FILES,
    examplePrompt: "Make this the landing page for my bookkeeping service for small shops, with a sign-up for a free consultation.",
  }),
  site({
    id: "saas-site",
    name: "Software site",
    summary: "A product with plans: a working, tilted product screen, a timeline you can scrub and pricing.",
    files: SAAS_SITE_FILES,
    examplePrompt: "Turn this into the site for my appointment booking app for clinics, with plans at $12 and $29 a month.",
  }),
  site({
    id: "portfolio",
    name: "Portfolio",
    summary: "Your work, big: a name that builds itself, drawn case-study covers that tilt and a contact band.",
    files: PORTFOLIO_FILES,
    examplePrompt: "Make this my photography portfolio with five projects, a short bio and my email.",
  }),
  site({
    id: "local-business",
    name: "Local business",
    summary: "A café or shop: an illustrated hero, a live open-now status, a menu you can filter and a map.",
    files: LOCAL_BUSINESS_FILES,
    examplePrompt: "Make this the site for my bakery in Kandy, open 6am to 8pm every day, with our cakes and buns.",
  }),
  site({
    id: "event-page",
    name: "Event page",
    summary: "One date: a countdown, a 3D ticket that fills in as you register and a schedule by track.",
    files: EVENT_PAGE_FILES,
    examplePrompt: "Make this the page for our book club meetup on 3 May at the city library, with three talks.",
  }),
  site({
    id: "blog",
    name: "Blog",
    summary: "Writing first: drawings that draw themselves, a reading-progress line and light and dark themes.",
    files: BLOG_FILES,
    examplePrompt: "Make this my cooking blog called Kitchen Table, with three recipe posts.",
  }),
  site({
    id: "online-store",
    name: "Online store",
    summary: "A small shop: drawn products in their own glaze, filters and sorting, and a cart that remembers what's in it.",
    files: ONLINE_STORE_FILES,
    examplePrompt: "Make this the store for my handmade candle shop, with six scents at $18 to $32 and free delivery over $50.",
  }),
  site({
    id: "booking",
    name: "Booking",
    summary: "Appointments: pick a treatment, a day and an open time on a day ribbon, then add it to a calendar.",
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
