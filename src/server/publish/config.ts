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
