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
  render: {
    name: "Render",
    intro:
      "Render builds and runs it as a web service on your own Render account, from one commit Farbaek writes to this project's GitHub repository on the farbaek/launch branch. It asks for Render's free instance; Render bills anything else to that account. Farbaek doesn't charge for launches and buys nothing for you.",
    tokenLabel: "Render API key",
    tokenHelp: "Create one in Render under Account settings, then API keys. Render's GitHub app must be allowed on this project's repository. Farbaek checks the key with Render, stores it encrypted, and never shows it again.",
    teamLabel: "Workspace ID",
    teamPlaceholder: "tea-…",
    teamHelp: "For a Render workspace other than your first one. Leave it empty to use your first.",
    targetLabel: "Render service name",
    targetHelp: "Lowercase letters, numbers and hyphens, at most 63. Render makes the service if your account has none by this name; if it has one, this replaces what it runs.",
    targetMax: 63,
    targetPattern: "[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?",
    buildsLabel: "Render runs",
    working: "Building on Render",
    logLink: "Service on Render",
    protectedAnswer: () => null,
    domainNote: "A free Render service sleeps after 15 minutes without visits and takes a moment to wake. Its disk is wiped on every deploy: attach a disk on Render for data that must stay.",
  },
  railway: {
    name: "Railway",
    intro:
      "Railway builds and runs it on your own Railway account, from one commit Farbaek writes to this project's GitHub repository on the farbaek/launch branch, and bills that account under your plan there. Farbaek doesn't charge for launches and buys nothing for you.",
    tokenLabel: "Railway account token",
    tokenHelp: "Create one in Railway under Account settings, then Tokens. Your Railway account must be linked to GitHub with this repository allowed. Farbaek checks the token with Railway, stores it encrypted, and never shows it again.",
    teamLabel: "Workspace ID",
    teamPlaceholder: "Workspace ID",
    teamHelp: "For a Railway workspace other than your personal one. Leave it empty to use your personal workspace.",
    targetLabel: "Railway project name",
    targetHelp: "Lowercase letters, numbers and hyphens, at most 63. Railway makes the project and service if they don't exist yet; if they do, this replaces what it runs.",
    targetMax: 63,
    targetPattern: "[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?",
    buildsLabel: "Railway runs",
    working: "Building on Railway",
    logLink: "Project on Railway",
    protectedAnswer: () => null,
    domainNote: "Railway's disk is wiped on every deploy unless you attach a volume there. Add a domain you own in the service's settings on Railway.",
  },
  flyio: {
    name: "Fly.io",
    intro:
      "Fly.io runs it on Node's own image from your own Fly.io organization, with the project's files in the machine. Only small Node apps with no install or build step go this way. Fly.io bills that organization; it has no free plan. Farbaek doesn't charge for launches and buys nothing for you.",
    tokenLabel: "Fly.io organization token",
    tokenHelp: "Create one with fly tokens create org, for the organization below. Farbaek checks it with Fly.io, stores it encrypted, and never shows it again.",
    teamLabel: "Organization slug",
    teamPlaceholder: "personal",
    teamHelp: "Required. Your personal organization's slug is personal.",
    targetLabel: "Fly.io app name",
    targetHelp: "Lowercase letters, numbers and hyphens, at most 63. It becomes name.fly.dev. Fly.io makes the app if your organization has none by this name; if it has one, this replaces what it runs.",
    targetMax: 63,
    targetPattern: "[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?",
    buildsLabel: "Fly.io runs",
    working: "Starting on Fly.io",
    logLink: "App on Fly.io",
    protectedAnswer: () => null,
    domainNote: "A machine's disk is wiped when it's replaced: attach a volume on Fly.io for data that must stay. Add a domain you own with fly certs.",
  },
};
