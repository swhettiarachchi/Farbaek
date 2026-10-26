/**
 * The hosting providers LaunchOS launches to with a workspace's own account
 * (ADR 0078, ADR 0093), and the only addresses Farbaek will link to or check
 * for each: https on that provider's own domain, and nothing else. The
 * database holds launch orders to the same rule (migration v59).
 */
import { vercelAppUrl } from "./vercel";

export const LAUNCH_PROVIDERS = ["vercel", "netlify"] as const;
export type LaunchProvider = (typeof LAUNCH_PROVIDERS)[number];

export const PROVIDER_NAMES: Record<LaunchProvider, string> = { vercel: "Vercel", netlify: "Netlify" };

/** A Netlify address: https on a single netlify.app label (a site, or a deploy's own `id--site` address). */
export function netlifyAppUrl(raw: string | null | undefined): string | null {
  const url = parseHttps(raw);
  return url && /^[a-z0-9-]+\.netlify\.app$/.test(url.hostname) ? `https://${url.hostname}` : null;
}

/** The public address of a launch, only on its own provider's domain. */
export function launchAddress(provider: LaunchProvider, raw: string | null | undefined): string | null {
  return provider === "vercel" ? vercelAppUrl(raw) : netlifyAppUrl(raw);
}

const INSPECTOR_HOSTS: Record<LaunchProvider, string> = { vercel: "vercel.com", netlify: "app.netlify.com" };

/** A link to the launch on the provider's own dashboard, only on that dashboard's host. */
export function inspectorAddress(provider: LaunchProvider, raw: string | null | undefined): string | null {
  const url = parseHttps(raw);
  return url && url.hostname === INSPECTOR_HOSTS[provider] ? url.toString() : null;
}

function parseHttps(raw: string | null | undefined): URL | null {
  if (!raw) return null;
  try {
    const url = new URL(raw.startsWith("https://") ? raw : `https://${raw}`);
    if (url.protocol !== "https:" || url.port || url.username || url.password) return null;
    return url;
  } catch {
    return null;
  }
}
