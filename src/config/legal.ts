/**
 * Facts the Terms, Privacy Policy and Acceptable Use Policy state (ADR 0066).
 * One source, so a change here changes every page. Each must stay true: the
 * operator, where data lives, who processes it, and how long it's kept.
 */
import { CONTACT } from "./contact";

export const LEGAL = {
  /** Shown as "Last updated" on each document. */
  updated: "29 October 2026",
  operator: "Suvin Hettiarachchi, trading as Farbaek",
  country: "Sri Lanka",
  /** Where the app, database, sign-in and backups run. */
  hosting: "a server rented from Hostinger in Boston, United States",
  contact: CONTACT.hello,
  support: CONTACT.support,
  /** Nightly database backups are overwritten after this many days (scripts/vps/db-backup.sh). */
  backupDays: 14,
  /** Docker keeps three 10 MB log files per service (scripts/vps/bootstrap.sh); Caddy keeps no access log. */
  logLimit: "30 MB",
  /** app_rate_limit deletes every window that started longer ago than this (migration v39). */
  rateLimitHours: 24,
  /** The youngest age that can use Farbaek; under 18 needs a parent or guardian, and paid plans need an adult. The App Store rating (13+) matches it. */
  minimumAge: 13,
} as const;

/** The three documents, for the footer and each document's own links. */
export const LEGAL_DOCS = [
  { href: "/terms", label: "Terms of Service" },
  { href: "/privacy", label: "Privacy Policy" },
  { href: "/acceptable-use", label: "Acceptable Use Policy" },
] as const;

/** The version of the Terms' Paid plans section people agree to at checkout (ADR 0104). Change it with the section. */
export const PAID_TERMS_VERSION = "2026-10-29";

/** Everyone who handles personal data for Farbaek, and why (keep in step with the services actually used). */
export const SUBPROCESSORS = [
  { name: "Anthropic", purpose: "AI models (Claude) that draft plans and code changes from what you write and the files you choose", data: "Prompts, chosen file contents, AI output", where: "United States" },
  { name: "Google", purpose: "AI models (Gemini): image generation, and drafting when the server uses them instead of Claude, on a paid account only", data: "Prompts, chosen file contents, image descriptions, AI output and generated images", where: "United States" },
  { name: "Vercel", purpose: "Isolated sandboxes that run your project's checks and builds", data: "Project files, commands and their output", where: "United States" },
  { name: "Hostinger", purpose: "The server for the app, database, sign-in and backups, and DNS for farbaek.si", data: "Everything Farbaek stores", where: "United States" },
  {
    name: "Cloudflare",
    purpose: "Turnstile, the check at sign-in that tells people from bots, and R2, which keeps a copy of each nightly backup away from our server, each once it's switched on",
    data: "For sign-in, your IP address and signals from your browser; for backups, everything Farbaek stores, deleted after the same 14 days",
    where: "Its worldwide network; a United States company",
  },
  { name: "Spaceship (Spacemail)", purpose: "Sending sign-in links and the emails you choose to get, and DNS for farbaek.com", data: "Your email address and the email's content", where: "A United States company; we're confirming where its mail servers are" },
  {
    name: "Dodo Payments",
    purpose: "Merchant of record for paid plans: checkout, tax, receipts and invoices, and the portal for your payment method",
    data: "Your email address, the plan you choose, your billing country and payment details, which you enter on Dodo Payments' own page and never reach Farbaek",
    where: "We're confirming where it processes data",
  },
] as const;
