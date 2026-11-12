/**
 * The hosting providers LaunchOS launches to with a workspace's own account
 * (ADR 0078, ADR 0093, ADR 0191), and the only addresses Farbaek will link to
 * or check for each: https on that provider's own domain, and nothing else.
 * The database holds launch orders to the same rule (migrations v59, v92).
 */
import { vercelAppUrl } from "./vercel";

export const LAUNCH_PROVIDERS = ["vercel", "netlify", "render", "railway", "flyio"] as const;
export type LaunchProvider = (typeof LAUNCH_PROVIDERS)[number];

export const PROVIDER_NAMES: Record<LaunchProvider, string> = { vercel: "Vercel", netlify: "Netlify", render: "Render", railway: "Railway", flyio: "Fly.io" };

/** The providers that run a server, from a repository or an image (ADR 0191). */
export const SERVER_PROVIDERS = ["render", "railway", "flyio"] as const satisfies readonly LaunchProvider[];
export type ServerProvider = (typeof SERVER_PROVIDERS)[number];

export function isServerProvider(p: LaunchProvider): p is ServerProvider {
  return (SERVER_PROVIDERS as readonly string[]).includes(p);
}

/** An address on one label of a provider's domain, as https with no path. */
function onDomain(raw: string | null | undefined, domain: RegExp): string | null {
  const url = parseHttps(raw);
  return url && domain.test(url.hostname) ? `https://${url.hostname}` : null;
}

/** A Netlify address: https on a single netlify.app label (a site, or a deploy's own `id--site` address). */
export function netlifyAppUrl(raw: string | null | undefined): string | null {
  return onDomain(raw, /^[a-z0-9-]+\.netlify\.app$/);
}

/** A Render web service's address: one label of onrender.com. */
export const renderAppUrl = (raw: string | null | undefined) => onDomain(raw, /^[a-z0-9-]+\.onrender\.com$/);
/** A Railway service's generated address: one label of up.railway.app. */
export const railwayAppUrl = (raw: string | null | undefined) => onDomain(raw, /^[a-z0-9-]+\.up\.railway\.app$/);
/** A Fly.io app's address: one label of fly.dev. */
export const flyAppUrl = (raw: string | null | undefined) => onDomain(raw, /^[a-z0-9-]+\.fly\.dev$/);

/** The public address of a launch, only on its own provider's domain. */
export function launchAddress(provider: LaunchProvider, raw: string | null | undefined): string | null {
  switch (provider) {
    case "vercel":
      return vercelAppUrl(raw);
    case "netlify":
      return netlifyAppUrl(raw);
    case "render":
      return renderAppUrl(raw);
    case "railway":
      return railwayAppUrl(raw);
    case "flyio":
      return flyAppUrl(raw);
  }
}

const INSPECTOR_HOSTS: Record<LaunchProvider, string> = {
  vercel: "vercel.com",
  netlify: "app.netlify.com",
  render: "dashboard.render.com",
  railway: "railway.com",
  flyio: "fly.io",
};

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
