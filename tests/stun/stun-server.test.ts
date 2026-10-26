/**
 * Farbaek's own STUN server (ADR 0095): Binding requests answered with the
 * asker's public address, checked against RFC 5769's sample vectors, and
 * nothing else answered.
 */
import dgram from "node:dgram";
import { crc32 } from "node:zlib";
import { afterEach, describe, expect, it } from "vitest";
import { MAGIC_COOKIE, buildResponse, createLimiter, createStunServer, ipv6Bytes, parseRequest, xorMappedAddress } from "../../deploy/vps/stun/stun-server.mjs";

// RFC 5769, sections 2.2 and 2.3.
const TXID = Buffer.from("b7e7a701bc34d686fa87dfae", "hex");

function request(txid = TXID, extra = Buffer.alloc(0)): Buffer {
  const header = Buffer.alloc(20);
  header.writeUInt16BE(0x0001, 0);
  header.writeUInt16BE(extra.length, 2);
  header.writeUInt32BE(MAGIC_COOKIE, 4);
  txid.copy(header, 8);
  return Buffer.concat([header, extra]);
}

const sockets: dgram.Socket[] = [];
afterEach(() => {
  for (const s of sockets.splice(0)) s.close();
});

describe("Farbaek's STUN server", () => {
  it("encodes the mapped address exactly as RFC 5769's samples, for IPv4 and IPv6", () => {
    expect(xorMappedAddress("192.0.2.1", 32853, TXID).toString("hex")).toBe("0001a147e112a643");
    expect(xorMappedAddress("2001:db8:1234:5678:11:2233:4455:6677", 32853, TXID).toString("hex")).toBe("0002a1470113a9faa5d3f179bc25f4b5bed2b9d9");
    expect(ipv6Bytes("::ffff:192.0.2.1").toString("hex")).toBe("00000000000000000000ffffc0000201");
    expect(ipv6Bytes("fe80::1%eth0").toString("hex")).toBe("fe800000000000000000000000000001");
  });

  it("answers a Binding request with the asker's address and a valid fingerprint", () => {
    const txid = parseRequest(request());
    expect(txid?.equals(TXID)).toBe(true);
    const res = buildResponse(TXID, "::ffff:192.0.2.1", 32853);
    expect(res.readUInt16BE(0)).toBe(0x0101);
    expect(res.readUInt16BE(2)).toBe(res.length - 20);
    expect(res.readUInt32BE(4)).toBe(MAGIC_COOKIE);
    expect(res.subarray(8, 20).equals(TXID)).toBe(true);
    // XOR-MAPPED-ADDRESS, answered as plain IPv4.
    expect(res.subarray(20, 32).toString("hex")).toBe("00200008" + "0001a147e112a643");
    // FINGERPRINT: CRC-32 of everything before it, XOR 0x5354554e.
    expect(res.readUInt16BE(32)).toBe(0x8028);
    expect(res.readUInt32BE(36)).toBe((crc32(res.subarray(0, 32)) ^ 0x5354554e) >>> 0);
    // Never much larger than what was asked: no amplification.
    expect(res.length).toBeLessThanOrEqual(52);
  });

  it("ignores anything that isn't a well-formed Binding request", () => {
    const response = request();
    response.writeUInt16BE(0x0101, 0);
    const noCookie = request();
    noCookie.writeUInt32BE(0, 4);
    const badLength = request(TXID, Buffer.alloc(4));
    badLength.writeUInt16BE(8, 2);
    for (const junk of [Buffer.from("hello"), response, noCookie, badLength, request(TXID, Buffer.alloc(600)), Buffer.alloc(19)]) {
      expect(parseRequest(junk)).toBeNull();
    }
  });

  it("answers each address at most 30 times in 10 seconds", () => {
    let t = 0;
    const limiter = createLimiter({ requests: 30, windowMs: 10_000 }, () => t);
    const answered = Array.from({ length: 40 }, () => limiter.allow("198.51.100.7")).filter(Boolean).length;
    expect(answered).toBe(30);
    expect(limiter.allow("203.0.113.9")).toBe(true);
    t = 10_000;
    expect(limiter.allow("198.51.100.7")).toBe(true);
    limiter.sweep();
    expect(limiter.size).toBe(1);
  });

  it("answers over a real UDP socket, and says nothing to junk", async () => {
    const server = await createStunServer({ port: 0, host: "127.0.0.1" });
    sockets.push(server);
    const port = server.address().port;
    const client = dgram.createSocket("udp4");
    sockets.push(client);
    const replies: Buffer[] = [];
    client.on("message", (m) => replies.push(m));
    await new Promise<void>((r) => client.bind(0, "127.0.0.1", () => r()));
    client.send(Buffer.from("not stun"), port, "127.0.0.1");
    client.send(request(), port, "127.0.0.1");
    await new Promise((r) => setTimeout(r, 200));
    expect(replies).toHaveLength(1);
    const mapped = replies[0]!.subarray(24, 32);
    expect(mapped.readUInt16BE(2) ^ (MAGIC_COOKIE >>> 16)).toBe(client.address().port);
  });
});
