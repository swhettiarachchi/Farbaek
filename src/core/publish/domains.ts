/**
 * Custom domains for published sites (ADR 0045). A person points their own
 * name at Farbaek and proves they control it with a TXT record; only then
 * does the name serve the site and get a certificate.
 */
export const DOMAINS_PER_SITE = 2;
/** The TXT record's name is this label under the domain. */
export const VERIFY_LABEL = "_farbaek";
export const VERIFY_PREFIX = "farbaek-verify=";

export type DomainProblem = "empty" | "invalid" | "ip" | "single_label" | "ours";

export const DOMAIN_PROBLEMS: Record<DomainProblem, string> = {
  empty: "Enter a domain, such as www.example.com.",
  invalid: "That isn't a domain name. Use letters, numbers and hyphens, such as www.example.com.",
  ip: "Use a domain name, not an IP address.",
  single_label: "Use a full domain, such as www.example.com.",
  ours: "That name belongs to Farbaek. Use a domain you own.",
};

const LABEL = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;

/**
 * A domain as people type it ("https://WWW.Example.com/shop"), as the
 * lower-case ASCII host it is ("www.example.com"), or why it can't be used.
 * `reserved` are zones that are Farbaek's own (farbaek.com, farbaek.si).
 */
export function normalizeDomain(input: string, reserved: readonly string[]): { ok: true; hostname: string } | { ok: false; problem: DomainProblem } {
  let host = input.trim().toLowerCase();
  if (!host) return { ok: false, problem: "empty" };
  host = host.replace(/^[a-z][a-z0-9+.-]*:\/\//, "").split(/[/?#]/)[0]!;
  if (host.includes("@")) return { ok: false, problem: "invalid" };
  if (/^\[.*\]/.test(host) || /^[\d.]+(:\d+)?$/.test(host)) return { ok: false, problem: "ip" };
  host = host.replace(/:\d+$/, "").replace(/\.$/, "");
  // The URL parser applies the same IDN rules as browsers, in Node and on the web alike.
  let ascii: string;
  try {
    ascii = new URL(`http://${host}`).hostname;
  } catch {
    return { ok: false, problem: "invalid" };
  }
  const labels = ascii.split(".");
  if (labels.length < 2) return { ok: false, problem: "single_label" };
  if (ascii.length > 253 || !labels.every((l) => LABEL.test(l)) || labels.at(-1)!.length < 2) return { ok: false, problem: "invalid" };
  if (reserved.some((zone) => ascii === zone || ascii.endsWith(`.${zone}`))) return { ok: false, problem: "ours" };
  return { ok: true, hostname: ascii };
}

/**
 * The registrable part is a guess without the Public Suffix List: a name
 * with exactly two labels ("example.com") is taken as an apex, which can't
 * have a CNAME, so it gets an A record instead.
 */
export const isApex = (hostname: string) => hostname.split(".").length === 2;

export interface DnsRecord {
  type: "TXT" | "CNAME" | "A";
  name: string;
  value: string;
  purpose: string;
}

export interface DomainTarget {
  /** The name subdomains point at with a CNAME ("sites.farbaek.si"). */
  cname: string;
  /** The server's public IPv4 address, for apex domains; null when it isn't configured. */
  ip: string | null;
}

/** What to set at the domain's DNS provider. Null when an apex domain needs an IP that isn't configured. */
export function dnsRecordsFor(hostname: string, token: string, target: DomainTarget): DnsRecord[] | null {
  const txt: DnsRecord = { type: "TXT", name: `${VERIFY_LABEL}.${hostname}`, value: `${VERIFY_PREFIX}${token}`, purpose: "Proves you control the domain." };
  if (isApex(hostname)) return target.ip ? [{ type: "A", name: hostname, value: target.ip, purpose: "Points the domain at Farbaek." }, txt] : null;
  return [{ type: "CNAME", name: hostname, value: target.cname, purpose: "Points the domain at Farbaek." }, txt];
}

export interface DnsAnswers {
  /** Every TXT string found at the verify name, joined per record. */
  txt: string[];
  cname: string[];
  /** IPv4 addresses the name resolves to. */
  a: string[];
}

export type DomainVerdict = { ok: true } | { ok: false; missing: ("txt" | "target")[]; message: string };

/**
 * Whether the records are in place. A subdomain passes when its CNAME is the
 * target, or when it already resolves to the server's address (some DNS
 * providers flatten CNAMEs into A records).
 */
export function checkDomainRecords(hostname: string, token: string, target: DomainTarget, answers: DnsAnswers): DomainVerdict {
  const missing: ("txt" | "target")[] = [];
  if (!answers.txt.some((t) => t.trim() === `${VERIFY_PREFIX}${token}`)) missing.push("txt");
  const cnameOk = answers.cname.some((c) => c.replace(/\.$/, "").toLowerCase() === target.cname);
  const aOk = target.ip !== null && answers.a.includes(target.ip);
  if (!(isApex(hostname) ? aOk : cnameOk || aOk)) missing.push("target");
  if (missing.length === 0) return { ok: true };
  const parts = [
    missing.includes("txt") ? `the TXT record at ${VERIFY_LABEL}.${hostname} isn't there yet` : null,
    missing.includes("target") ? `${hostname} doesn't point at Farbaek yet` : null,
  ].filter(Boolean);
  return { ok: false, missing, message: `Not verified: ${parts.join(", and ")}. DNS changes can take up to an hour to show; check again then.` };
}
