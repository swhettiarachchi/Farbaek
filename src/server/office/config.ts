/**
 * Office Space settings from the server environment (ADR 0032). The office
 * is off unless OFFICE_HOST names a host other than the customer app's.
 * OFFICE_OWNER_EMAIL is only used while the office has no owner, to make
 * the first one; it does nothing after that. Neither is a secret.
 */
import { normalizeHost, originOf } from "@/server/http/hosts";

export interface OfficeConfig {
  /** The office host with any port, lower case. */
  host: string;
  /** The origin pages and writes must come from. */
  origin: string;
  /** The address that may become the first owner, while there is none. */
  ownerEmail: string | null;
}

const HOST = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+(:\d{2,5})?$/;
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function appHostFromEnv(env: NodeJS.ProcessEnv = process.env): string | null {
  const site = env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!site) return null;
  try {
    return normalizeHost(new URL(site).host);
  } catch {
    return null;
  }
}

export function officeConfig(env: NodeJS.ProcessEnv = process.env): OfficeConfig | null {
  const host = normalizeHost(env.OFFICE_HOST);
  if (!host || !HOST.test(host) || host === appHostFromEnv(env)) return null;
  const owner = env.OFFICE_OWNER_EMAIL?.trim().toLowerCase() ?? "";
  return { host, origin: originOf(host), ownerEmail: EMAIL.test(owner) && owner.length <= 254 ? owner : null };
}
