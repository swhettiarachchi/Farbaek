// Farbaek's own STUN server (ADR 0095): tells a Farbaek Agent the public
// address and port its network shows the internet, so two paired agents can
// open a direct WebRTC link to each other. It answers only RFC 5389 Binding
// requests, with XOR-MAPPED-ADDRESS and FINGERPRINT, and ignores everything
// else. It relays nothing and keeps no record of who asked.
//
// Each address gets 30 requests in 10 seconds. An answer is 40 or 52 bytes
// and a request at least 20, so it can't be used to amplify traffic at
// someone else.
//
// Runs in its own container on the VPS (deploy/vps/compose.yaml), with only
// Node's dgram and zlib.
import dgram from "node:dgram";
import net from "node:net";
import { fileURLToPath } from "node:url";
import { crc32 } from "node:zlib";

export const MAGIC_COOKIE = 0x2112a442;
const BINDING_REQUEST = 0x0001;
const BINDING_SUCCESS = 0x0101;
const XOR_MAPPED_ADDRESS = 0x0020;
const FINGERPRINT = 0x8028;
const FINGERPRINT_XOR = 0x5354554e;
/** The largest request answered: the minimum datagram size every IPv4 host accepts. */
export const MAX_REQUEST = 548;
export const LIMIT = { requests: 30, windowMs: 10_000 };

/** The transaction ID of a well-formed Binding request, or null for anything else. */
export function parseRequest(msg) {
  if (!Buffer.isBuffer(msg) || msg.length < 20 || msg.length > MAX_REQUEST) return null;
  const type = msg.readUInt16BE(0);
  const length = msg.readUInt16BE(2);
  if ((type & 0xc000) !== 0 || type !== BINDING_REQUEST) return null;
  if (msg.readUInt32BE(4) !== MAGIC_COOKIE) return null;
  if (length % 4 !== 0 || length + 20 !== msg.length) return null;
  return Buffer.from(msg.subarray(8, 20));
}

/** The XOR-MAPPED-ADDRESS attribute's value for this address and port. */
export function xorMappedAddress(address, port, transactionId) {
  const xport = (port ^ (MAGIC_COOKIE >>> 16)) & 0xffff;
  if (net.isIPv4(address)) {
    const value = Buffer.alloc(8);
    value.writeUInt8(0, 0);
    value.writeUInt8(0x01, 1);
    value.writeUInt16BE(xport, 2);
    const ip = Buffer.from(address.split(".").map(Number));
    const cookie = Buffer.alloc(4);
    cookie.writeUInt32BE(MAGIC_COOKIE, 0);
    for (let i = 0; i < 4; i++) value[4 + i] = ip[i] ^ cookie[i];
    return value;
  }
  if (net.isIPv6(address.split("%")[0])) {
    const value = Buffer.alloc(20);
    value.writeUInt8(0, 0);
    value.writeUInt8(0x02, 1);
    value.writeUInt16BE(xport, 2);
    const ip = ipv6Bytes(address);
    const key = Buffer.alloc(16);
    key.writeUInt32BE(MAGIC_COOKIE, 0);
    transactionId.copy(key, 4);
    for (let i = 0; i < 16; i++) value[4 + i] = ip[i] ^ key[i];
    return value;
  }
  throw new Error("Not an IP address.");
}

/** The 16 bytes of an IPv6 address, including "::" shorthand and an IPv4 tail ("::ffff:192.0.2.1"). */
export function ipv6Bytes(address) {
  let text = address.split("%")[0];
  const v4 = text.match(/(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (v4) {
    const [a, b, c, d] = v4.slice(1).map(Number);
    text = `${text.slice(0, -v4[0].length)}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  const [head, tail] = text.split("::");
  const left = head ? head.split(":") : [];
  const right = tail ? tail.split(":") : [];
  const groups = tail === undefined ? left : [...left, ...Array(8 - left.length - right.length).fill("0"), ...right];
  if (groups.length !== 8) throw new Error("Not an IPv6 address.");
  const out = Buffer.alloc(16);
  groups.forEach((g, i) => out.writeUInt16BE(parseInt(g, 16), i * 2));
  return out;
}

function attribute(type, value) {
  const header = Buffer.alloc(4);
  header.writeUInt16BE(type, 0);
  header.writeUInt16BE(value.length, 2);
  const pad = Buffer.alloc((4 - (value.length % 4)) % 4);
  return Buffer.concat([header, value, pad]);
}

/** A Binding success response telling the asker the address and port it came from. */
export function buildResponse(transactionId, address, port) {
  // A client behind an IPv4-mapped IPv6 socket is answered with its IPv4 address.
  const plain = address.startsWith("::ffff:") && net.isIPv4(address.slice(7)) ? address.slice(7) : address;
  const mapped = attribute(XOR_MAPPED_ADDRESS, xorMappedAddress(plain, port, transactionId));
  const header = Buffer.alloc(20);
  header.writeUInt16BE(BINDING_SUCCESS, 0);
  header.writeUInt16BE(mapped.length + 8, 2);
  header.writeUInt32BE(MAGIC_COOKIE, 4);
  transactionId.copy(header, 8);
  const body = Buffer.concat([header, mapped]);
  const fingerprint = Buffer.alloc(4);
  fingerprint.writeUInt32BE((crc32(body) ^ FINGERPRINT_XOR) >>> 0, 0);
  return Buffer.concat([body, attribute(FINGERPRINT, fingerprint)]);
}

/** Counts requests per address in fixed windows. */
export function createLimiter(limit = LIMIT, now = Date.now) {
  const seen = new Map();
  return {
    allow(address) {
      const t = now();
      const entry = seen.get(address);
      if (!entry || t - entry.start >= limit.windowMs) {
        seen.set(address, { start: t, count: 1 });
        return true;
      }
      entry.count += 1;
      return entry.count <= limit.requests;
    },
    sweep() {
      const t = now();
      for (const [address, entry] of seen) if (t - entry.start >= limit.windowMs) seen.delete(address);
    },
    get size() {
      return seen.size;
    },
  };
}

/** A STUN server on a UDP socket. Resolves once it's listening. */
export function createStunServer({ port = 3478, host = "::", limit = LIMIT } = {}) {
  const socket = dgram.createSocket({ type: host.includes(":") ? "udp6" : "udp4", ipv6Only: false });
  const limiter = createLimiter(limit);
  const sweeper = setInterval(() => limiter.sweep(), limit.windowMs).unref();
  socket.on("message", (msg, from) => {
    const transactionId = parseRequest(msg);
    if (!transactionId || !limiter.allow(from.address)) return;
    try {
      socket.send(buildResponse(transactionId, from.address, from.port), from.port, from.address);
    } catch {
      // A malformed source address: nothing to answer.
    }
  });
  socket.on("close", () => clearInterval(sweeper));
  return new Promise((resolve, reject) => {
    socket.once("error", reject);
    socket.bind(port, host, () => {
      socket.off("error", reject);
      socket.on("error", () => undefined);
      resolve(socket);
    });
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const port = Number(process.env.STUN_PORT ?? 3478);
  const socket = await createStunServer({ port });
  const where = socket.address();
  console.log(`Farbaek STUN listening on udp ${where.address} port ${where.port}`);
  const stop = () => socket.close(() => process.exit(0));
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);
}
