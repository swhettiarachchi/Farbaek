/**
 * Custom domains for published sites (ADR 0045): adding one, checking its
 * DNS records, removing it, and deciding which names may have a
 * certificate. The database re-checks the person and the limits; DNS is
 * read here, on the server, and only the server marks a domain verified.
 */
import { checkDomainRecords, dnsRecordsFor, DOMAIN_PROBLEMS, normalizeDomain, VERIFY_LABEL, type DnsAnswers, type DnsRecord, type DomainTarget } from "@/core/publish/domains";
import { siteNameFromHost } from "@/core/publish/site";
import type { RpcResult } from "@/server/workspace/use-cases";
import type { SiteForServing } from "./store";

export interface SiteDomainView {
  id: string;
  siteId: string;
  hostname: string;
  status: "pending" | "verified";
  verifyToken: string;
  verifiedAt: string | null;
  checkedAt: string | null;
}

/** DNS answers for one name; an empty list when there are none. */
export interface DnsLookup {
  txt(name: string): Promise<string[]>;
  cname(name: string): Promise<string[]>;
  a(name: string): Promise<string[]>;
}

export interface DomainDeps {
  canChange(orgId: string): Promise<boolean>;
  target: DomainTarget | null;
  /** Zones that are Farbaek's own (the app's and the site domain). */
  reserved: string[];
  add(input: { siteId: string; actor: string; hostname: string; token: string }): Promise<RpcResult<string>>;
  mark(input: { domainId: string; actor: string; verified: boolean }): Promise<RpcResult<string>>;
  remove(input: { domainId: string; actor: string }): Promise<RpcResult<null>>;
  load(orgId: string, domainId: string): Promise<SiteDomainView | null>;
  dns: DnsLookup;
  token(): string;
  now(): Date;
}

export type DomainResult<T> = { ok: true; value: T } | { ok: false; message: string };

const DATABASE_MESSAGES: Record<string, string> = {
  DOMAIN_TAKEN: "That domain is already connected to a site on Farbaek.",
  DOMAIN_LIMIT: "A site can have two domains. Remove one first.",
  INVALID_DOMAIN: DOMAIN_PROBLEMS.invalid,
  SITE_BLOCKED: "Farbaek has taken this site offline, so domains can't be added to it.",
  WORKSPACE_SUSPENDED: "This workspace is suspended, so domains can't be changed.",
  FORBIDDEN: "Your role can view this site but not change its domains.",
  NOT_FOUND: "That site or domain doesn't exist in this workspace.",
};

const fromDatabase = (error: string) => DATABASE_MESSAGES[Object.keys(DATABASE_MESSAGES).find((k) => error.includes(k)) ?? ""] ?? "Something went wrong and nothing was changed. Try again in a moment.";

/** A DNS check runs at most this often per domain. */
const CHECK_EVERY_MS = 15_000;

export async function addSiteDomain(deps: DomainDeps, input: { orgId: string; userId: string; siteId: string; domain: string }): Promise<DomainResult<{ id: string; hostname: string }>> {
  if (!(await deps.canChange(input.orgId))) return { ok: false, message: DATABASE_MESSAGES.FORBIDDEN! };
  if (!deps.target) return { ok: false, message: "Published sites aren't connected on this server yet, so domains can't be added." };
  const n = normalizeDomain(input.domain, deps.reserved);
  if (!n.ok) return { ok: false, message: DOMAIN_PROBLEMS[n.problem] };
  if (dnsRecordsFor(n.hostname, "x", deps.target) === null) return { ok: false, message: "Use a subdomain such as www.example.com. Root domains need the server's address, which isn't set on this server yet." };
  const r = await deps.add({ siteId: input.siteId, actor: input.userId, hostname: n.hostname, token: deps.token() });
  return r.ok ? { ok: true, value: { id: r.value, hostname: n.hostname } } : { ok: false, message: fromDatabase(r.error) };
}

/** Reads the domain's DNS and records whether its records are in place. */
export async function checkSiteDomain(deps: DomainDeps, input: { orgId: string; userId: string; domainId: string }): Promise<DomainResult<{ verified: boolean; message: string }>> {
  if (!(await deps.canChange(input.orgId))) return { ok: false, message: DATABASE_MESSAGES.FORBIDDEN! };
  if (!deps.target) return { ok: false, message: "Published sites aren't connected on this server yet." };
  const domain = await deps.load(input.orgId, input.domainId);
  if (!domain) return { ok: false, message: DATABASE_MESSAGES.NOT_FOUND! };
  if (domain.checkedAt && deps.now().getTime() - Date.parse(domain.checkedAt) < CHECK_EVERY_MS) return { ok: false, message: "Checked a moment ago. Try again in a few seconds." };

  let answers: DnsAnswers;
  try {
    const [txt, cname, a] = await Promise.all([deps.dns.txt(`${VERIFY_LABEL}.${domain.hostname}`), deps.dns.cname(domain.hostname), deps.dns.a(domain.hostname)]);
    answers = { txt, cname, a };
  } catch {
    return { ok: false, message: "DNS didn't answer in time, so nothing changed. Try again in a minute." };
  }
  const verdict = checkDomainRecords(domain.hostname, domain.verifyToken, deps.target, answers);
  const marked = await deps.mark({ domainId: domain.id, actor: input.userId, verified: verdict.ok });
  if (!marked.ok) return { ok: false, message: fromDatabase(marked.error) };
  return { ok: true, value: verdict.ok ? { verified: true, message: `Verified. ${domain.hostname} now serves this site; its first visit can take a few seconds while the certificate is made.` } : { verified: false, message: verdict.message } };
}

export async function removeSiteDomain(deps: DomainDeps, input: { orgId: string; userId: string; domainId: string }): Promise<DomainResult<null>> {
  if (!(await deps.canChange(input.orgId))) return { ok: false, message: DATABASE_MESSAGES.FORBIDDEN! };
  const r = await deps.remove({ domainId: input.domainId, actor: input.userId });
  return r.ok ? { ok: true, value: null } : { ok: false, message: fromDatabase(r.error) };
}

/** The records a domain needs, for the panel. */
export const recordsFor = (domain: Pick<SiteDomainView, "hostname" | "verifyToken">, target: DomainTarget | null): DnsRecord[] | null => (target ? dnsRecordsFor(domain.hostname, domain.verifyToken, target) : null);

/**
 * Whether Caddy may get a certificate for a name (its on-demand TLS
 * question): a live site's name on the site domain, or a verified custom
 * domain whose site is live. Preview names and everything else: no.
 */
export async function tlsAllowed(host: string, deps: { domain: string | null; liveSite(name: string): Promise<SiteForServing>; nameForDomain(hostname: string): Promise<string | null> }): Promise<boolean> {
  const hostname = host.trim().toLowerCase().replace(/\.$/, "");
  if (!hostname || hostname.length > 253 || !/^[a-z0-9.-]+$/.test(hostname)) return false;
  const onSiteDomain = deps.domain !== null && hostname.endsWith(`.${deps.domain}`);
  const name = onSiteDomain ? siteNameFromHost(hostname, deps.domain) : await deps.nameForDomain(hostname);
  if (!name) return false;
  return (await deps.liveSite(name)).state === "live";
}
