/**
 * LaunchOS with Vercel (ADR 0078): the parts that need no network. The
 * project's name on Vercel, the build settings from the Launch Planner, the
 * digest of exactly the files being deployed, and what Vercel's deployment
 * states mean for a launch order. Endpoints and fields are from Vercel's
 * REST reference (POST /v2/files, POST /v13/deployments, GET
 * /v13/deployments/{id}, GET /v2/user), read on 2026-10-25.
 */
import { canonicalHash } from "@/core/trust/canonical-json";
import type { LaunchPlan } from "./planner";

export type OrderStatus = "authorized" | "uploading" | "building" | "ready" | "failed";

/** Vercel project names: lowercase letters, digits and hyphens, at most 100 characters. */
export const VERCEL_NAME = /^[a-z0-9](?:[a-z0-9-]{0,98}[a-z0-9])?$/;

/** A Vercel project name from a Farbaek project's name. */
export function vercelProjectName(name: string): string {
  const slug = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100)
    .replace(/-+$/g, "");
  return slug || "farbaek-site";
}

export interface VercelSettings {
  framework: "nextjs" | "vite" | "astro" | null;
  buildCommand: string | null;
  outputDirectory: string | null;
}

/** Build settings for Vercel from the Launch Planner; null means Vercel detects it. */
export function vercelSettings(plan: Pick<LaunchPlan, "kind" | "build" | "output">): VercelSettings {
  const framework = plan.kind === "nextjs" || plan.kind === "vite" || plan.kind === "astro" ? plan.kind : null;
  // Only commands found in the project are passed on; Vercel's own defaults cover the rest.
  const found = (c: LaunchPlan["build"]) => (c && c.source === "found" ? c.command : null);
  return { framework, buildCommand: found(plan.build), outputDirectory: plan.kind === "static" ? null : found(plan.output) };
}

/** Which kinds of project Vercel can run, and why not when it can't. */
export function vercelFit(plan: Pick<LaunchPlan, "kind">): string | null {
  if (plan.kind === "python") return "Vercel runs Python only as functions, and this project looks like a Python server. A host for long-running servers suits it better.";
  if (plan.kind === "node_server") return "Vercel runs functions, not a long-running Node.js server. A host for servers suits this project better.";
  if (plan.kind === "unknown") return "Farbaek couldn't tell what kind of project this is, so it can't say how Vercel would build it.";
  return null;
}

/** The digest of exactly the files a launch sends: their paths and SHA-256s, in canonical JSON. */
export function deployDigest(files: readonly { path: string; sha256: string }[]): Promise<string> {
  const entries = [...files].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0)).map((f) => ({ path: f.path, sha256: f.sha256 }));
  return canonicalHash({ schema: "farbaek.deploy-files/v1", files: entries });
}

/** What a Vercel deployment's readyState means for a launch order. */
export function statusFromReadyState(state: string): OrderStatus {
  if (state === "READY") return "ready";
  if (state === "ERROR" || state === "CANCELED" || state === "BLOCKED") return "failed";
  return "building";
}

/**
 * The address people use: the production alias (<project>.vercel.app) when
 * Vercel has assigned one, since the deployment's own unique address may ask
 * visitors to sign in to Vercel; otherwise that unique address.
 */
export function publicAddress(deployment: { url: string | null; aliases: readonly string[] }): string | null {
  for (const alias of deployment.aliases) {
    const url = vercelAppUrl(alias);
    if (url) return url;
  }
  return vercelAppUrl(deployment.url);
}

/** A deployment address Farbaek will link to and check: https on vercel.app, and nothing else. */
export function vercelAppUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw.startsWith("https://") ? raw : `https://${raw}`);
    if (url.protocol !== "https:" || url.port || url.username || url.password) return null;
    if (!/^[a-z0-9-]+(\.[a-z0-9-]+)*\.vercel\.app$/.test(url.hostname)) return null;
    return `https://${url.hostname}`;
  } catch {
    return null;
  }
}
