import type { LaunchProvider } from "@/core/launch/providers";
import type { VercelSettings } from "@/core/launch/vercel";

/** How Vercel will build it, from the Launch Planner's settings. */
export const vercelBuilds = (s: VercelSettings) => (s.framework ? `${s.framework}${s.buildCommand ? `, ${s.buildCommand}` : ""}` : (s.buildCommand ?? "Vercel detects it"));

export const NETLIFY_BUILDS = "Files as they are, no build";

/** Every word on the Launch page that differs between hosting providers (ADR 0078, ADR 0093). */
export interface ProviderCopy {
  name: string;
  intro: string;
  tokenLabel: string;
  tokenHelp: string;
  teamLabel: string;
  teamPlaceholder: string;
  teamHelp: string;
  targetLabel: string;
  targetHelp: string;
  targetMax: number;
  targetPattern: string;
  /** What the provider does with the files, for the summary of what goes. */
  buildsLabel: string;
  /** The order's word while the provider works on it. */
  working: string;
  logLink: string;
  /** What a protected address's answer means, or null when it means a problem. */
  protectedAnswer: (code: number) => string | null;
  domainNote: string;
}

export const PROVIDER_COPY: Record<LaunchProvider, ProviderCopy> = {
  vercel: {
    name: "Vercel",
    intro: "Vercel builds and hosts it on your own Vercel account, and bills that account under your plan there. Farbaek doesn't charge for launches and buys nothing for you.",
    tokenLabel: "Vercel token",
    tokenHelp: "Create one in Vercel under Account settings, then Tokens. Give it an end date and only the scope this needs. Farbaek checks it with Vercel, stores it encrypted, and never shows it again.",
    teamLabel: "Team ID",
    teamPlaceholder: "team_…",
    teamHelp: "For a Vercel team. Leave it empty to use your personal account.",
    targetLabel: "Vercel project name",
    targetHelp: "Lowercase letters, numbers and hyphens. Vercel makes the project if it doesn't exist yet.",
    targetMax: 100,
    targetPattern: "[a-z0-9]([a-z0-9-]{0,98}[a-z0-9])?",
    buildsLabel: "Vercel builds it with",
    working: "Building on Vercel",
    logLink: "Build log on Vercel",
    protectedAnswer: (code) => (code === 401 || code === 403 ? `Answers with Vercel's sign-in (${code}): Deployment Protection is on for this address in Vercel.` : null),
    domainNote: "Buying a domain isn't part of Farbaek yet. Add one you own in the project's settings on Vercel.",
  },
  netlify: {
    name: "Netlify",
    intro: "Netlify serves the files exactly as they are from your own Netlify account, and bills that account under your plan there. Farbaek doesn't charge for launches and buys nothing for you.",
    tokenLabel: "Netlify personal access token",
    tokenHelp: "Create one in Netlify under User settings, then Applications, then Personal access tokens. Give it an expiry date. Farbaek checks it with Netlify, stores it encrypted, and never shows it again.",
    teamLabel: "Team slug",
    teamPlaceholder: "my-team",
    teamHelp: "For a Netlify team other than your default one. Leave it empty to use your default team.",
    targetLabel: "Netlify site name",
    targetHelp: "Lowercase letters, numbers and hyphens, at most 63. It becomes name.netlify.app. Netlify makes the site if your account has none by this name; if it has one, this replaces what it serves.",
    targetMax: 63,
    targetPattern: "[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?",
    buildsLabel: "How it goes",
    working: "Publishing on Netlify",
    logLink: "Deploy on Netlify",
    protectedAnswer: (code) => (code === 401 ? "Answers with a password prompt (401): password protection is on for this site in Netlify." : null),
    domainNote: "Buying a domain isn't part of Farbaek yet. Add one you own in the site's domain settings on Netlify.",
  },
};
