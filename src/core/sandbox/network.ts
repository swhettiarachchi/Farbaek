/**
 * Outbound network policy for sandboxes. Deny by default: a session either
 * has no outbound access at all, or may reach the public package registries
 * and nothing else. The rules are handed to the runtime, which enforces them
 * outside the sandbox (E2B filters by IP or CIDR, and by Host or SNI for
 * HTTP and HTTPS on ports 80 and 443). Farbaek never asks the sandbox to
 * police itself.
 *
 * Private, link-local and cloud metadata ranges are always denied, so a
 * domain that resolves to an internal address still can't be reached.
 */

export const NETWORK_PROFILES = ["none", "package_registries"] as const;
export type NetworkProfile = (typeof NETWORK_PROFILES)[number];

export const ALL_TRAFFIC = "0.0.0.0/0";

/** Package registries only. Anything else (GitHub, APIs, CDNs) needs a reviewed profile change. */
export const REGISTRY_HOSTS: readonly string[] = [
  "registry.npmjs.org",
  "registry.yarnpkg.com",
  "pypi.org",
  "files.pythonhosted.org",
];

/** Always denied, whatever the profile: loopback, private, link-local (cloud metadata), CGNAT and multicast. */
export const ALWAYS_DENIED_CIDRS: readonly string[] = [
  "10.0.0.0/8",
  "100.64.0.0/10",
  "127.0.0.0/8",
  "169.254.0.0/16",
  "172.16.0.0/12",
  "192.168.0.0/16",
  "224.0.0.0/4",
];

export interface EgressRules {
  profile: NetworkProfile;
  allowOut: string[];
  denyOut: string[];
}

export function egressRules(profile: NetworkProfile): EgressRules {
  if (profile === "package_registries") {
    // Allow rules win over deny rules in the runtime, so only public hostnames go in allowOut.
    return { profile, allowOut: [...REGISTRY_HOSTS], denyOut: [ALL_TRAFFIC, ...ALWAYS_DENIED_CIDRS] };
  }
  return { profile, allowOut: [], denyOut: [ALL_TRAFFIC] };
}

export const NETWORK_PROFILE_LABELS: Record<NetworkProfile, { title: string; detail: string }> = {
  none: { title: "No network", detail: "Nothing inside the sandbox can reach the internet. Best for running code you already have." },
  package_registries: {
    title: "Package registries only",
    detail: `Installs from ${REGISTRY_HOSTS.join(", ")}. Every other address is blocked.`,
  },
};

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let n = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const v = Number(part);
    if (v > 255) return null;
    n = n * 256 + v;
  }
  return n;
}

function inCidr(ip: number, cidr: string): boolean {
  const [base, bitsText] = cidr.split("/");
  const baseInt = ipv4ToInt(base ?? "");
  const bits = Number(bitsText);
  if (baseInt === null || !Number.isInteger(bits)) return false;
  if (bits === 0) return true;
  const size = 2 ** (32 - bits);
  return Math.floor(ip / size) === Math.floor(baseInt / size);
}

/** True when an IPv4 address is in a range no sandbox may reach. Used to check rules and gateway targets. */
export function isDeniedAddress(ip: string): boolean {
  const n = ipv4ToInt(ip);
  if (n === null) return true;
  return ALWAYS_DENIED_CIDRS.some((c) => inCidr(n, c)) || n === 0;
}

/** Whether a destination is allowed under a profile. A model of the runtime's rules, for tests and explanations. */
export function egressAllows(rules: EgressRules, destination: { host?: string; ip?: string }): boolean {
  if (destination.ip !== undefined && isDeniedAddress(destination.ip)) {
    // Allow rules take precedence in the runtime, so a private IP must never appear in allowOut.
    return rules.allowOut.includes(destination.ip);
  }
  if (destination.host !== undefined) {
    const host = destination.host.toLowerCase();
    return rules.allowOut.some((a) => a === host || (a.startsWith("*.") && host.endsWith(a.slice(1))));
  }
  if (destination.ip !== undefined) return rules.allowOut.includes(destination.ip) || !rules.denyOut.includes(ALL_TRAFFIC);
  return false;
}

/**
 * Ports a preview may forward to. Low ports and the runtime's own ports
 * (E2B's in-sandbox agent, envd, on 49983, and its code interpreter on
 * 49999) are refused, so a preview can't be pointed at the sandbox agent.
 */
export const RESERVED_SANDBOX_PORTS: readonly number[] = [49983, 49999];

export function validPreviewPort(port: unknown): port is number {
  return typeof port === "number" && Number.isInteger(port) && port >= 1024 && port <= 65535 && !RESERVED_SANDBOX_PORTS.includes(port);
}
