/**
 * LaunchOS with Netlify (ADR 0093): the parts that need no network. The
 * site's name on Netlify, which projects its direct upload can serve, and
 * what Netlify's deploy states mean for a launch order. Netlify's API deploy
 * runs no build: it serves the uploaded files exactly as they are, so only
 * static projects fit. Endpoints and fields are from Netlify's API docs
 * ("Get started with the Netlify API", updated 2026-10-03) and its OpenAPI
 * reference, read on 2026-10-26.
 */
import type { LaunchPlan } from "./planner";
import { vercelProjectName, type OrderStatus } from "./vercel";

/** Netlify site names become a subdomain: lowercase letters, digits and hyphens, at most 63 characters. */
export const NETLIFY_NAME = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

/** A Netlify site name from a Farbaek project's name. */
export function netlifySiteName(name: string): string {
  return vercelProjectName(name).slice(0, 63).replace(/-+$/g, "") || "farbaek-site";
}

/** Which kinds of project Netlify's direct upload can serve, and why not when it can't. */
export function netlifyFit(plan: Pick<LaunchPlan, "kind">): string | null {
  switch (plan.kind) {
    case "static":
      return null;
    case "vite":
    case "astro":
      return "Netlify's direct upload serves files as they are, and this project needs a build first. Vercel builds it for you.";
    case "nextjs":
      return "This is a Next.js app, which needs a build and a server for some pages. Netlify's direct upload serves finished files only, so Vercel suits it better.";
    case "node_server":
    case "python":
      return "This project runs a server, and Netlify's direct upload serves finished files only. A host for long-running servers suits it better.";
    default:
      return "Farbaek couldn't tell what kind of project this is, so it can't say whether Netlify can serve it.";
  }
}

/** Netlify can't serve a path with # or ?; the first such file, named, or null. */
export function netlifyPathProblem(paths: readonly string[]): string | null {
  const bad = paths.find((p) => /[#?]/.test(p));
  return bad ? `Netlify can't serve a file whose path has # or ?, and ${bad} does. Rename it, then launch.` : null;
}

/** What a Netlify deploy's state means for a launch order. */
export function statusFromNetlifyState(state: string): OrderStatus {
  if (state === "ready") return "ready";
  if (state === "error" || state === "rejected") return "failed";
  return "building";
}

/** Whether Netlify has compared the files yet, so its list of the ones it still needs is final. */
export function diffReady(state: string): boolean {
  return ["prepared", "uploading", "uploaded", "processing", "processed", "ready"].includes(state);
}
