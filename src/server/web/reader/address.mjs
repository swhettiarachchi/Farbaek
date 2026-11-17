// Which internet addresses Farbaek's page reader may connect to (stage 205, ADR 0222). Plain JavaScript so the reader runs
// with node alone; the app's TypeScript reuses it through address.d.mts.
//
// Only public, globally routed addresses are allowed. Refused: private, shared, loopback, link-local (including cloud metadata
// at 169.254.169.254), documentation, benchmarking, multicast and reserved ranges, and every IPv6 form that can carry an IPv4
// address (mapped, compatible, NAT64, 6to4, Teredo). The check runs three times on every request: on an address written in the
// URL, on every address a name resolves to, and on the address the socket actually connected to, so a name that changes its
// answer between the check and the connection (DNS rebinding) still can't reach the server's own network.
import { BlockList, isIP } from "node:net";
import { lookup as dnsLookup } from "node:dns";

// Two lists: a BlockList also checks IPv4 addresses against IPv6 rules (as mapped addresses), so one shared list with
// "deny ::ffff:0:0/96" would refuse every IPv4 address.
const deniedV4 = new BlockList();
const deniedV6 = new BlockList();
for (const [network, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
]) {
  deniedV4.addSubnet(network, prefix, "ipv4");
}
for (const [network, prefix] of [
  ["::", 96], // unspecified, loopback and IPv4-compatible
  ["::ffff:0:0", 96], // IPv4-mapped
  ["64:ff9b::", 96], // NAT64
  ["64:ff9b:1::", 48], // local NAT64
  ["100::", 64], // discard
  ["2001::", 23], // IETF protocol assignments, including Teredo
  ["2001:db8::", 32], // documentation
  ["2002::", 16], // 6to4
  ["3fff::", 20], // documentation
  ["5f00::", 16], // segment routing
  ["fc00::", 7], // unique local
  ["fe80::", 10], // link-local
  ["fec0::", 10], // site-local
  ["ff00::", 8], // multicast
]) {
  deniedV6.addSubnet(network, prefix, "ipv6");
}

/** Addresses that are public but must still never be reached: Farbaek's own server, which trusts requests from itself. */
const own = new Set();

/** Adds the server's own public addresses (the reader reads them from FARBAEK_SERVER_ADDRESSES at start). */
export function denyAddresses(list) {
  for (const raw of String(list ?? "").split(/[\s,]+/)) {
    const a = raw.trim().toLowerCase();
    if (isIP(a)) own.add(a);
  }
}

/** True for a public, globally routed address; false for anything else, including text that isn't an address. */
export function isPublicIp(address) {
  const raw = String(address).replace(/^\[|\]$/g, "").split("%")[0];
  const version = isIP(raw);
  if (own.has(raw.toLowerCase())) return false;
  if (version === 4) return !deniedV4.check(raw, "ipv4");
  if (version === 6) return !deniedV6.check(raw, "ipv6");
  return false;
}

/** Host names that are never on the public internet, whatever they resolve to. */
export function isLocalName(host) {
  const h = String(host).toLowerCase().replace(/\.$/, "");
  return h === "localhost" || !h.includes(".") || /\.(?:localhost|local|internal|intranet|lan|home|corp|private|test|invalid|example|arpa)$/.test(h);
}

/**
 * Wraps a resolver (shaped like `dns.lookup`) so a name is refused if any address it resolves to isn't allowed. Node calls
 * lookup in two ways (one address, or `all: true` when trying families in turn); both are answered.
 */
export function guardLookup(resolver = dnsLookup, isAllowed = isPublicIp, allowLocalNames = false) {
  return function lookup(hostname, options, callback) {
    const cb = typeof options === "function" ? options : callback;
    const opts = typeof options === "function" || typeof options === "number" ? {} : (options ?? {});
    if (!allowLocalNames && isLocalName(hostname)) return cb(Object.assign(new Error("refused: not a public host name"), { code: "EREFUSED_HOST" }));
    resolver(hostname, { ...opts, all: true, verbatim: true }, (error, addresses) => {
      if (error) return cb(error);
      const list = Array.isArray(addresses) ? addresses : [];
      if (list.length === 0) return cb(Object.assign(new Error("no address"), { code: "ENOTFOUND" }));
      if (!list.every((a) => isAllowed(a.address))) return cb(Object.assign(new Error("refused: resolves to a non-public address"), { code: "EREFUSED_ADDRESS" }));
      if (opts.all) return cb(null, list);
      return cb(null, list[0].address, list[0].family);
    });
  };
}

/** `dns.lookup` that only ever answers with public addresses. */
export const publicLookup = guardLookup();
