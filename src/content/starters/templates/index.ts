/**
 * The template gallery (Phase D): finished-looking static sites with sample
 * content the agent replaces. Plain HTML and CSS, system fonts, nothing to
 * install and nothing fetched, so each previews instantly and safely.
 */
import type { Starter } from "../types";
import { BLOG_FILES } from "./blog";
import { EVENT_PAGE_FILES } from "./event-page";
import { LANDING_PAGE_FILES } from "./landing-page";
import { LOCAL_BUSINESS_FILES } from "./local-business";
import { PORTFOLIO_FILES } from "./portfolio";
import { SAAS_SITE_FILES } from "./saas-site";

const site = (s: Omit<Starter, "run" | "staticPreview" | "kind">): Starter => ({ ...s, run: null, staticPreview: true, kind: "template" });

export const TEMPLATES: readonly Starter[] = [
  site({
    id: "landing-page",
    name: "Landing page",
    summary: "One product or offer: a clear promise, how it works, a quote and an email sign-up.",
    files: LANDING_PAGE_FILES,
    examplePrompt: "Make this the landing page for my bookkeeping service for small shops, with a sign-up for a free consultation.",
  }),
  site({
    id: "saas-site",
    name: "Software site",
    summary: "A product with plans: a drawn product screen, features and pricing.",
    files: SAAS_SITE_FILES,
    examplePrompt: "Turn this into the site for my appointment booking app for clinics, with plans at $12 and $29 a month.",
  }),
  site({
    id: "portfolio",
    name: "Portfolio",
    summary: "Your work, your way: a big name, selected projects and how to reach you.",
    files: PORTFOLIO_FILES,
    examplePrompt: "Make this my photography portfolio with five projects, a short bio and my email.",
  }),
  site({
    id: "local-business",
    name: "Local business",
    summary: "A shop, café or studio: what you offer, opening hours and where to find you.",
    files: LOCAL_BUSINESS_FILES,
    examplePrompt: "Make this the site for my bakery in Kandy, open 6am to 8pm every day, with our cakes and buns.",
  }),
  site({
    id: "event-page",
    name: "Event page",
    summary: "One date: the schedule, speakers and a way to save a seat.",
    files: EVENT_PAGE_FILES,
    examplePrompt: "Make this the page for our book club meetup on 3 May at the city library, with three talks.",
  }),
  site({
    id: "blog",
    name: "Blog",
    summary: "Writing first: a list of posts and a post page set for comfortable reading.",
    files: BLOG_FILES,
    examplePrompt: "Make this my cooking blog called Kitchen Table, with three recipe posts.",
  }),
];
