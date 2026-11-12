/**
 * Starters a new project can begin from. They're ordinary project files:
 * imported through the same screening and limits as any import, and edited,
 * proposed and checked like everything else.
 */
import { isStaticSite } from "@/core/workspace/static-site";
import { NEXTJS_APP_FILES } from "./nextjs-app";
import { MEMBERS_APP_FILES, MEMBERS_APP_PREVIEW } from "./members-app";
import { REST_API_FILES } from "./rest-api";
import { STATIC_WEBSITE_FILES } from "./static-website";
import { TEMPLATES } from "./templates";
import type { Starter } from "./types";

export type { Starter, StarterFile, StarterId, TemplateId } from "./types";

export const STARTERS: readonly Starter[] = [
  { id: "blank", name: "Blank", summary: "An empty project. Import files or write them in Farbaek.", files: [], run: null, staticPreview: false, kind: "starter" },
  {
    id: "static-website",
    name: "Static website",
    summary: "HTML, CSS and JavaScript. Nothing to install, and it previews instantly.",
    files: STATIC_WEBSITE_FILES,
    run: null,
    staticPreview: true,
    kind: "starter",
  },
  {
    id: "nextjs-app",
    name: "Next.js app",
    summary: "React with the App Router, TypeScript and Tailwind CSS. Previews in a test space.",
    files: NEXTJS_APP_FILES,
    run: { install: "npm install --ignore-scripts --no-audit --no-fund", dev: "npm run dev -- --hostname 0.0.0.0 --port 3000", port: 3000 },
    staticPreview: false,
    kind: "starter",
  },
  {
    id: "rest-api",
    name: "REST API service",
    summary: "Plain Node.js with no dependencies: one resource, validation, pages, clear errors and tests. Runs in a test space.",
    files: REST_API_FILES,
    run: { install: null, dev: "npm run dev -- --hostname 0.0.0.0 --port 3000", port: 3000 },
    staticPreview: false,
    kind: "starter",
  },
  {
    id: "members-app",
    name: "App with sign-in",
    summary: "Accounts, sign-in, password reset and a private space for each person, in plain Node.js with no dependencies. Runs in a test space.",
    files: MEMBERS_APP_FILES,
    run: { install: null, dev: "npm run dev -- --hostname 0.0.0.0 --port 3000", port: 3000 },
    staticPreview: false,
    kind: "starter",
    examplePrompt: "A members area where my clients sign in and see their own project updates",
    gallery: { preview: MEMBERS_APP_PREVIEW },
  },
  ...TEMPLATES,
];

/** The templates in the gallery, in the order they are shown. */
export const TEMPLATE_STARTERS: readonly Starter[] = STARTERS.filter((s) => s.kind === "template");

/** Starters that run a server and are shown in the gallery from snapshots of their pages (stage 180). */
export const APP_TEMPLATES: readonly Starter[] = STARTERS.filter((s) => s.gallery);

/** A starter the gallery can show: a template, or an app with snapshots. */
export function galleryStarter(id: unknown): Starter | null {
  const s = getStarter(id);
  return s && (s.kind === "template" || s.gallery) ? s : null;
}

/** The files the gallery shows for a starter: its snapshots when it runs a server. */
export function galleryFiles(s: Starter): Record<string, string> {
  return Object.fromEntries((s.gallery?.preview ?? s.files).map((f) => [f.path, f.content]));
}

export function getStarter(id: unknown): Starter | null {
  return STARTERS.find((s) => s.id === id) ?? null;
}

/** How a project's files run, judged from the files themselves: a starter's settings when they match, otherwise from package.json and index.html. */
/** `packageJson` is its text when the project has one beside index.html (needsPackageJson): a bare one keeps a site static. */
export function runProfile(paths: readonly string[], packageJson?: string | null): { kind: "static" } | { kind: "node"; install: string; dev: string; port: number } | { kind: "unknown" } {
  const has = new Set(paths);
  if (has.has("package.json") && (has.has("next.config.ts") || has.has("next.config.mjs") || has.has("next.config.js"))) {
    return { kind: "node", install: "npm install --ignore-scripts --no-audit --no-fund", dev: "npm run dev -- --hostname 0.0.0.0 --port 3000", port: 3000 };
  }
  // A Node server started from src/server.js, like the REST API starter (ADR 0140): it reads --hostname and --port.
  if (has.has("package.json") && has.has("src/server.js") && !has.has("index.html")) {
    return { kind: "node", install: "npm install --ignore-scripts --no-audit --no-fund", dev: "npm run dev -- --hostname 0.0.0.0 --port 3000", port: 3000 };
  }
  if (isStaticSite(paths, packageJson)) return { kind: "static" };
  return { kind: "unknown" };
}

