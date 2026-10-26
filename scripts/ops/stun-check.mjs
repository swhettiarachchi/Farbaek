// Asks a STUN server for this computer's public address (ADR 0095):
//   node scripts/ops/stun-check.mjs [host] [port]
// Defaults to Farbaek's own, www.farbaek.com:3478. Prints the address and
// port it saw, or says it got no answer in 3 seconds.
import { randomBytes } from "node:crypto";
import dgram from "node:dgram";
import { lookup } from "node:dns/promises";

const host = process.argv[2] ?? "www.farbaek.com";
const port = Number(process.argv[3] ?? 3478);
const COOKIE = 0x2112a442;

const { address } = await lookup(host, { family: 4 });
const txid = randomBytes(12);
const request = Buffer.alloc(20);
request.writeUInt16BE(0x0001, 0);
request.writeUInt32BE(COOKIE, 4);
txid.copy(request, 8);

const socket = dgram.createSocket("udp4");
const timer = setTimeout(() => {
  console.log(`No answer from ${host}:${port} (${address}) in 3 seconds. Check the stun container and that UDP ${port} is open.`);
  socket.close();
  process.exitCode = 1;
}, 3_000);
socket.on("message", (msg) => {
  if (msg.length < 20 || msg.readUInt16BE(0) !== 0x0101 || !msg.subarray(8, 20).equals(txid)) return;
  for (let i = 20; i + 4 <= msg.length; ) {
    const type = msg.readUInt16BE(i);
    const length = msg.readUInt16BE(i + 2);
    if (type === 0x0020 && msg[i + 5] === 0x01) {
      const mappedPort = msg.readUInt16BE(i + 6) ^ (COOKIE >>> 16);
      const ip = [0, 1, 2, 3].map((k) => msg[i + 8 + k] ^ ((COOKIE >>> (24 - 8 * k)) & 0xff)).join(".");
      console.log(`${host}:${port} says this computer is ${ip}:${mappedPort}.`);
      clearTimeout(timer);
      socket.close();
      return;
    }
    i += 4 + length + ((4 - (length % 4)) % 4);
  }
});
socket.send(request, port, address);
