/**
 * Facts the Terms, Privacy Policy and Acceptable Use Policy state (ADR 0066).
 * One source, so a change here changes every page. Each must stay true: the
 * operator, where data lives, who processes it, and how long it's kept.
 */
import { CONTACT } from "./contact";

export const LEGAL = {
  /** Shown as "Last updated" on each document. */
  updated: "3 November 2026",
  operator: "Farbaek",
  country: "Sri Lanka",
  /** Where the app, database, sign-in and backups run. */
  hosting: "servers in the United States",
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

/**
 * Everyone who handles personal data for Farbaek, and why (keep in step with the services actually used).
 * The AI providers and Google Analytics are named, because people need to know where their work and their
 * visits go. The services that run Farbaek itself are listed by what they do and where (GDPR Art. 13 allows
 * categories): which company provides each is told to anyone who asks (stage 171).
 */
export const SUBPROCESSORS = [
  { name: "Anthropic", purpose: "AI models (Claude) that draft plans and code changes from what you write and the files you choose", data: "Prompts, chosen file contents, AI output", where: "United States" },
  { name: "Google", purpose: "AI models (Gemini): image generation, and drafting when the server uses them instead of Claude, on a paid account only", data: "Prompts, chosen file contents, image descriptions, AI output and generated images", where: "United States" },
  {
    name: "OpenAI",
    purpose: "A second AI model that checks a proposed change against its contract, when someone in your workspace asks for a second check",
    data: "The change's contract, plan, policy decision and file diffs, and the model's answer",
    where: "United States",
  },
  {
    name: "Google Analytics",
    purpose: "Counting visits to our public pages, only if you allow it there",
    data: "Pages viewed, how you arrived, your browser and device, a rough location from your IP address, which Google doesn't keep, and a random ID in a cookie",
    where: "United States",
  },
  { name: "Hosting provider", purpose: "The servers that run Farbaek: the app, its database, sign-in and nightly backups", data: "Everything Farbaek stores", where: "United States" },
  { name: "Off-site backup storage", purpose: "A second copy of each nightly backup, kept apart from our servers and deleted after the same 14 days", data: "Everything Farbaek stores", where: "United States" },
  { name: "Test space provider", purpose: "Isolated, temporary computers that run your project's checks, builds and previews", data: "Project files, commands and their output", where: "United States" },
  { name: "Email delivery provider", purpose: "Sending sign-in links and the emails you choose to get", data: "Your email address and the email's content", where: "A United States company" },
  { name: "Bot check at sign-in", purpose: "Telling people from automated sign-ins", data: "Your IP address and signals from your browser", where: "A United States company's worldwide network" },
] as const;

/** Who sells paid plans on the web. A merchant of record is the seller, and its own controller, so it's named, apart from the table above. */
export const MERCHANT_OF_RECORD = "Dodo Payments";
