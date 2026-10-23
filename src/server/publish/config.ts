/**
 * Where published sites live: `<name>.<site domain>`. It's the same separate
 * domain previews use (ADR 0023, farbaek.si in production), so people's
 * content never shares an origin with Farbaek.
 */
export function siteDomain(): string | null {
  const domain = process.env.SANDBOX_PREVIEW_DOMAIN?.trim().toLowerCase();
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
