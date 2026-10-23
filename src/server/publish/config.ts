/**
 * Where published sites live: `<name>.<site domain>`, a domain separate
 * from Farbaek's own (farbaek.si in production), so people's content never
 * shares an origin with Farbaek. SITES_DOMAIN sets it; without it, sites
 * share the preview domain (ADR 0023). Sites can go live on their own:
 * their certificates come on demand (ADR 0045), while previews still need
 * a wildcard certificate.
 */
export function siteDomain(): string | null {
  const domain = (process.env.SITES_DOMAIN || process.env.SANDBOX_PREVIEW_DOMAIN)?.trim().toLowerCase();
  return domain ? domain : null;
}

export function siteAddress(name: string, domain = siteDomain()): string | null {
  if (!domain) return null;
  return `${domain.includes("localhost") ? "http" : "https"}://${name}.${domain}`;
}

/**
 * Where custom domains point (ADR 0045): subdomains take a CNAME to
 * `sites.<site domain>`, and apex domains an A record to SITES_TARGET_IP,
 * the server's public IPv4 address. Null while sites aren't connected.
 */
export function siteTarget(domain = siteDomain(), ip = process.env.SITES_TARGET_IP?.trim() ?? ""): { cname: string; ip: string | null } | null {
  if (!domain) return null;
  const valid = /^\d{1,3}(\.\d{1,3}){3}$/.test(ip) && ip.split(".").every((n) => Number(n) <= 255);
  return { cname: `sites.${domain}`, ip: valid ? ip : null };
}
