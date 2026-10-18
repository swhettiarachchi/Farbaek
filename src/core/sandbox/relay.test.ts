/**
 * Runs the real relay script with Node, in front of a local test app, and
 * checks it forwards only requests Farbaek signed.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { promises as fs } from "node:fs";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { RELAY_HEADERS, RELAY_SCRIPT, relayKey, signRelayRequest } from "./relay";

const SECRET = "p".repeat(48);
const SANDBOX = "sbx_test";
let dir: string;
let relay: ChildProcess;
let app: http.Server;
let relayPort: number;
let appPort: number;
let key: string;
const seenByApp: { url: string; headers: http.IncomingHttpHeaders; body: string }[] = [];

const freePort = () =>
  new Promise<number>((resolve) => {
    const s = net.createServer().listen(0, "127.0.0.1", () => {
      const port = (s.address() as net.AddressInfo).port;
      s.close(() => resolve(port));
    });
  });

async function waitForPort(port: number) {
  for (let i = 0; i < 100; i += 1) {
    const ok = await new Promise<boolean>((resolve) => {
      const c = net.connect(port, "127.0.0.1", () => (c.end(), resolve(true)));
      c.on("error", () => resolve(false));
    });
    if (ok) return;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error("The relay didn't start.");
}

beforeAll(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "farbaek-relay-"));
  key = await relayKey(SECRET, SANDBOX);
  await fs.writeFile(path.join(dir, "relay.mjs"), RELAY_SCRIPT);
  await fs.writeFile(path.join(dir, "relay.key"), key);
  appPort = await freePort();
  relayPort = await freePort();
  app = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      seenByApp.push({ url: req.url ?? "", headers: req.headers, body });
      res.writeHead(200, { "content-type": "text/html", "x-app": "yes" });
      res.end(`<h1>app ${req.method} ${req.url}</h1>`);
    });
  });
  await new Promise<void>((r) => app.listen(appPort, "127.0.0.1", r));
  relay = spawn(process.execPath, [path.join(dir, "relay.mjs")], { env: { FARBAEK_RELAY_PORT: String(relayPort), FARBAEK_RELAY_KEY_FILE: path.join(dir, "relay.key"), PATH: process.env.PATH } as unknown as NodeJS.ProcessEnv, stdio: "ignore" });
  await waitForPort(relayPort);
}, 20_000);

afterAll(async () => {
  relay?.kill();
  await new Promise<void>((r) => app.close(() => r()));
  await fs.rm(dir, { recursive: true, force: true });
});

const send = (p: string, init: RequestInit = {}) => fetch(`http://127.0.0.1:${relayPort}${p}`, init);
const signed = async (p: string, opts: { method?: string; port?: number; keyOverride?: string; now?: number; nonce?: string; signPath?: string } = {}) =>
  signRelayRequest(opts.keyOverride ?? key, { method: opts.method ?? "GET", path: opts.signPath ?? p, port: opts.port ?? appPort, now: opts.now, nonce: opts.nonce });

describe("the signed preview relay", () => {
  it("forwards a signed request to the app on its local port, without the signature headers", async () => {
    const res = await send("/dashboard?tab=1", { headers: await signed("/dashboard?tab=1") });
    expect(res.status).toBe(200);
    expect(res.headers.get("x-app")).toBe("yes");
    expect(await res.text()).toBe("<h1>app GET /dashboard?tab=1</h1>");
    const seen = seenByApp.at(-1)!;
    expect(seen.headers.host).toBe(`127.0.0.1:${appPort}`);
    expect(Object.values(RELAY_HEADERS).some((h) => h in seen.headers)).toBe(false);
  });

  it("streams request bodies", async () => {
    const res = await send("/api/save", { method: "POST", body: "hello", headers: { ...(await signed("/api/save", { method: "POST" })), "content-type": "text/plain" } });
    expect(res.status).toBe(200);
    expect(seenByApp.at(-1)!.body).toBe("hello");
  });

  it("refuses unsigned, wrongly signed, stale and replayed requests", async () => {
    expect((await send("/")).status).toBe(401);
    expect((await send("/", { headers: await signed("/", { keyOverride: await relayKey(SECRET, "another_sandbox") }) })).status).toBe(401);
    expect((await send("/admin", { headers: await signed("/admin", { signPath: "/" }) })).status).toBe(401);
    expect((await send("/", { headers: await signed("/", { now: Date.now() - 120_000 }) })).status).toBe(401);
    const once = await signed("/");
    expect((await send("/", { headers: once })).status).toBe(200);
    expect((await send("/", { headers: once })).status).toBe(401);
  });

  it("forwards only to app ports, never to itself, and refuses upgrades", async () => {
    expect((await send("/", { headers: await signed("/", { port: relayPort }) })).status).toBe(400);
    expect((await send("/", { headers: await signed("/", { port: 80 }) })).status).toBe(400);
    const status = await new Promise<string>((resolve) => {
      const socket = net.connect(relayPort, "127.0.0.1", () => socket.write(`GET / HTTP/1.1\r\nHost: x\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n`));
      socket.once("data", (d) => (resolve(d.toString().split("\r\n")[0]!), socket.destroy()));
    });
    expect(status).toBe("HTTP/1.1 501 Not Implemented");
  });

  it("says plainly when nothing listens on the port", async () => {
    const closed = await freePort();
    const res = await send("/", { headers: await signed("/", { port: closed }) });
    expect(res.status).toBe(502);
    expect(await res.text()).toMatch(/Nothing answered on port/);
  });
});
