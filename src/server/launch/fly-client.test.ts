import { describe, expect, it } from "vitest";
import {
  createFlyClient,
  flyMachineConfig,
  statusFromFlyMachine,
  FLY_FILES_LIMIT_BYTES,
  FLY_FILES_LIMIT_COUNT,
  FLY_NODE_IMAGE,
  FLY_TOKEN,
  type FlyMachineConfig,
} from "./fly-client";

const TOKEN = "FlyV1 fm2_test_macaroon_value,fm2_second_part_value";

function fake(respond: (url: URL, init: RequestInit) => Response | Promise<Response>) {
  const calls: { url: URL; init: RequestInit }[] = [];
  const fetcher = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    calls.push({ url, init: init ?? {} });
    return respond(url, init ?? {});
  }) as typeof fetch;
  return { fetcher, calls };
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const body = (init: RequestInit) => JSON.parse(String(init.body)) as unknown;
const MACHINE = { id: "3d8d9e1c2f7189", state: "created", region: "lhr", config: { image: "node:22-slim", metadata: { farbaek: "launch", fly_platform_version: "v2" } } };
const bytes = (text: string) => new TextEncoder().encode(text);
const CONFIG = flyMachineConfig({ files: [{ path: "src/server.js", bytes: bytes("console.log(1)") }], entry: "src/server.js" }) as FlyMachineConfig;

describe("the Fly.io client", () => {
  it("calls only api.machines.dev with the bearer token, never follows redirects, and confirms the organization", async () => {
    const f = fake(() => json({ apps: [], total_apps: 0 }));
    expect(await createFlyClient(TOKEN, { fetcher: f.fetcher }).whoami("harbour-studio")).toEqual({ ok: true, value: { id: "harbour-studio", name: "harbour-studio" } });
    const call = f.calls[0]!;
    expect(call.url.origin).toBe("https://api.machines.dev");
    expect(call.url.pathname).toBe("/v1/apps");
    expect(call.url.searchParams.get("org_slug")).toBe("harbour-studio");
    expect(call.init.method).toBe("GET");
    const headers = call.init.headers as Record<string, string>;
    expect(headers["User-Agent"]).toMatch(/^Farbaek \(/);
    expect(call.init.redirect).toBe("error");
    expect(call.init.signal).toBeInstanceOf(AbortSignal);
  });

  it("sends a FlyV1 organization token as the whole header, and any other token after Bearer", async () => {
    const authorization = async (token: string) => {
      const f = fake(() => json({ apps: [] }));
      await createFlyClient(token, { fetcher: f.fetcher }).whoami("personal");
      return (f.calls[0]!.init.headers as Record<string, string>).Authorization;
    };
    expect(await authorization(TOKEN)).toBe(TOKEN);
    const long = `FlyV1 fm2_${"a".repeat(1500)},fm2_${"b".repeat(1500)}`;
    expect(await authorization(long)).toBe(long);
    expect(await authorization("plain_token_value_123456")).toBe("Bearer plain_token_value_123456");
  });

  it("checks a token's shape before it's used", () => {
    expect(FLY_TOKEN.test(TOKEN)).toBe(true);
    expect(FLY_TOKEN.test("FlyV1 fm2_a,fm2_b,fm2_ccccccccccccc")).toBe(true);
    expect(FLY_TOKEN.test(`FlyV1 fm2_${"x".repeat(3000)},fm2_${"y".repeat(900)}`)).toBe(true);
    expect(FLY_TOKEN.test("plain_token_value_123456")).toBe(true);
    expect(FLY_TOKEN.test(`${TOKEN}\n`)).toBe(false);
    expect(FLY_TOKEN.test("FlyV1 fm2_aaaaaaaaaa\nfm2_bbbbbbbbbbbb")).toBe(false);
    expect(FLY_TOKEN.test("FlyV1 fm2_aaaa bbbbbbbbbbbbbbbbbbbbb")).toBe(false);
    expect(FLY_TOKEN.test("short")).toBe(false);
    expect(FLY_TOKEN.test(`fm2_${"z".repeat(4000)}`)).toBe(false);
  });

  it("says plainly when the token doesn't reach the organization", async () => {
    const denied = await createFlyClient(TOKEN, { fetcher: fake(() => json({ error: "unauthorized" }, 401)).fetcher }).whoami("personal");
    expect(denied).toEqual({ ok: false, message: "Fly.io didn't accept this token. Create an organization token with fly tokens create org, and connect again." });
    const missing = await createFlyClient(TOKEN, { fetcher: fake(() => json({ error: "not found" }, 404)).fetcher }).whoami("elsewhere");
    expect(!missing.ok && missing.message).toMatch(/can't reach a Fly.io organization called elsewhere/);
  });

  it("finds an app, and reads a 404 as no app", async () => {
    const f = fake(() => json({ id: "a1", name: "harbour-lane", organization: { slug: "harbour-studio", name: "Harbour" }, status: "deployed" }));
    expect(await createFlyClient(TOKEN, { fetcher: f.fetcher }).getApp("harbour-lane")).toEqual({ ok: true, value: { name: "harbour-lane", orgSlug: "harbour-studio" } });
    expect(f.calls[0]!.url.pathname).toBe("/v1/apps/harbour-lane");
    const none = await createFlyClient(TOKEN, { fetcher: fake(() => json({ error: "app not found" }, 404)).fetcher }).getApp("harbour-lane");
    expect(none).toEqual({ ok: true, value: null });
  });

  it("makes an app with CreateAppRequest's name and org_slug, and says when the name is taken", async () => {
    const f = fake(() => json({ id: "harbour-lane", created_at: 1762900000000 }, 201));
    expect(await createFlyClient(TOKEN, { fetcher: f.fetcher }).createApp("harbour-lane", "harbour-studio")).toEqual({ ok: true, value: { name: "harbour-lane" } });
    expect(f.calls[0]!.init.method).toBe("POST");
    expect(f.calls[0]!.url.pathname).toBe("/v1/apps");
    expect(body(f.calls[0]!.init)).toEqual({ name: "harbour-lane", org_slug: "harbour-studio" });
    expect((f.calls[0]!.init.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
    const taken = await createFlyClient(TOKEN, { fetcher: fake(() => json({ error: "app name is already in use", status: "name_taken" }, 422)).fetcher }).createApp("harbour-lane", "personal");
    expect(taken).toEqual({ ok: false, message: "Another Fly.io account already uses the app name harbour-lane. Choose another name." });
  });

  it("assigns a shared IPv4 and a public IPv6 address only when the app has none", async () => {
    const f = fake((_url, init) => (init.method === "POST" ? json({ ip: "1.2.3.4", shared: true }) : json({ ips: [] })));
    expect(await createFlyClient(TOKEN, { fetcher: f.fetcher }).ensurePublicIps("harbour-lane")).toEqual({ ok: true, value: null });
    expect(f.calls.map((c) => [c.init.method, c.url.pathname])).toEqual([
      ["GET", "/v1/apps/harbour-lane/ip_assignments"],
      ["POST", "/v1/apps/harbour-lane/ip_assignments"],
      ["POST", "/v1/apps/harbour-lane/ip_assignments"],
    ]);
    expect(f.calls.slice(1).map((c) => body(c.init))).toEqual([{ type: "shared_v4" }, { type: "v6" }]);

    const present = fake(() =>
      json({ ips: [{ ip: "66.241.124.10", shared: true, region: "" }, { ip: "2a09:8280:1::4f:abcd", shared: false, region: "global" }, { ip: "fdaa:0:1::3", network: { name: "" } }] }),
    );
    expect(await createFlyClient(TOKEN, { fetcher: present.fetcher }).ensurePublicIps("harbour-lane")).toEqual({ ok: true, value: null });
    expect(present.calls).toHaveLength(1);

    const onlyPrivate = fake((_url, init) => (init.method === "POST" ? json({}) : json({ ips: [{ ip: "66.241.124.10", shared: true }, { ip: "fdaa:0:1::3", network: { name: "" } }] })));
    await createFlyClient(TOKEN, { fetcher: onlyPrivate.fetcher }).ensurePublicIps("harbour-lane");
    expect(onlyPrivate.calls.slice(1).map((c) => body(c.init))).toEqual([{ type: "v6" }]);

    const refused = fake((_url, init) => (init.method === "POST" ? json({ error: "billing required" }, 422) : json({ ips: [] })));
    expect(await createFlyClient(TOKEN, { fetcher: refused.fetcher }).ensurePublicIps("harbour-lane")).toEqual({
      ok: false,
      message: "Fly.io wouldn't give this app a public address. Check the organization's billing on Fly.io, then launch again.",
    });
  });

  it("lists, creates, updates, reads and waits for Machines", async () => {
    const f = fake((url, init) =>
      url.pathname.endsWith("/wait") ? json({ ok: true, state: "started" }) : url.pathname.endsWith("/machines") && init.method === "GET" ? json([MACHINE]) : json({ ...MACHINE, state: "started" }),
    );
    const client = createFlyClient(TOKEN, { fetcher: f.fetcher });
    const metadata = { farbaek: "launch", fly_platform_version: "v2" };
    expect(await client.listMachines("harbour-lane")).toEqual({ ok: true, value: [{ id: MACHINE.id, state: "created", region: "lhr", metadata }] });
    expect(await client.createMachine("harbour-lane", CONFIG)).toEqual({ ok: true, value: { id: MACHINE.id, state: "started", region: "lhr", metadata } });
    expect(await client.updateMachine("harbour-lane", MACHINE.id, CONFIG)).toMatchObject({ ok: true });
    expect(await client.getMachine("harbour-lane", MACHINE.id)).toMatchObject({ ok: true, value: { state: "started" } });
    expect(await client.waitStarted("harbour-lane", MACHINE.id)).toEqual({ ok: true, value: true });
    expect(f.calls.map((c) => [c.init.method, c.url.pathname])).toEqual([
      ["GET", "/v1/apps/harbour-lane/machines"],
      ["POST", "/v1/apps/harbour-lane/machines"],
      ["POST", `/v1/apps/harbour-lane/machines/${MACHINE.id}`],
      ["GET", `/v1/apps/harbour-lane/machines/${MACHINE.id}`],
      ["GET", `/v1/apps/harbour-lane/machines/${MACHINE.id}/wait`],
    ]);
    expect(body(f.calls[1]!.init)).toEqual({ config: CONFIG });
    expect(body(f.calls[2]!.init)).toEqual({ config: CONFIG });
    const wait = f.calls[4]!.url;
    expect(wait.searchParams.get("state")).toBe("started");
    expect(wait.searchParams.get("timeout")).toBe("60");
    // Fly.io answers 408 when the Machine isn't started within the wait.
    expect(await createFlyClient(TOKEN, { fetcher: fake(() => json({ error: "deadline exceeded" }, 408)).fetcher }).waitStarted("harbour-lane", MACHINE.id)).toEqual({ ok: true, value: false });
  });

  it("reads a Machine's metadata from its config, or the last known config, and keeps only text values", async () => {
    const read = async (machine: unknown) => {
      const r = await createFlyClient(TOKEN, { fetcher: fake(() => json(machine)).fetcher }).getMachine("harbour-lane", MACHINE.id);
      return r.ok ? r.value.metadata : null;
    };
    expect(await read({ id: MACHINE.id, state: "started" })).toEqual({});
    expect(await read({ id: MACHINE.id, state: "started", config: null })).toEqual({});
    expect(await read({ id: MACHINE.id, state: "started", config: { metadata: null } })).toEqual({});
    expect(await read({ id: MACHINE.id, state: "started", incomplete_config: { metadata: { farbaek: "launch" } } })).toEqual({ farbaek: "launch" });
    expect(await read({ id: MACHINE.id, state: "started", config: { metadata: { farbaek: "launch", count: 3 } } })).toEqual({ farbaek: "launch" });
  });

  it("turns Fly.io's errors into sentences without the token", async () => {
    const say = async (status: number, error = `bad token ${TOKEN} and fm2_test_macaroon_value`) => {
      const r = await createFlyClient(TOKEN, { fetcher: fake(() => json({ error }, status)).fetcher }).getMachine("harbour-lane", MACHINE.id);
      return r.ok ? null : r.message;
    };
    expect(await say(401)).toMatch(/didn't accept this token/);
    expect(await say(404)).toMatch(/couldn't find that app or Machine/);
    expect(await say(429)).toMatch(/limiting requests/);
    expect(await say(500)).toMatch(/didn't answer properly/);
    const refused = await say(422);
    expect(refused).toMatch(/^Fly\.io refused it: /);
    expect(refused).toContain("[token]");
    for (const message of [refused, await say(400), await say(401)]) {
      expect(message).not.toContain("fm2_");
      expect(message).not.toContain("FlyV1");
      expect(message).not.toContain(String.fromCharCode(0x2014));
    }
    expect((await say(422, "x".repeat(500)))!.length).toBeLessThanOrEqual(220);
    const down = await createFlyClient(TOKEN, {
      fetcher: (async () => {
        throw new Error(`connect failed for ${TOKEN}`);
      }) as typeof fetch,
    }).listMachines("harbour-lane");
    expect(down).toEqual({ ok: false, message: "Farbaek couldn't reach Fly.io. Try again in a few minutes." });
  });

  it("refuses names, slugs and Machine ids Fly.io wouldn't accept, without calling it", async () => {
    const f = fake(() => json({}));
    const client = createFlyClient(TOKEN, { fetcher: f.fetcher });
    const results = await Promise.all([
      client.whoami("Harbour Studio"),
      client.whoami(""),
      client.getApp("Harbour_Lane"),
      client.getApp("a"),
      client.getApp("-harbour"),
      client.getApp("harbour-"),
      client.getApp(`a${"b".repeat(63)}`),
      client.createApp("harbour-lane", "../orgs"),
      client.createApp("../x", "personal"),
      client.ensurePublicIps("harbour/lane"),
      client.listMachines("harbour lane"),
      client.createMachine("UPPER", CONFIG),
      client.updateMachine("harbour-lane", "../../apps", CONFIG),
      client.waitStarted("harbour-lane", "short"),
      client.getMachine("harbour-lane", "ABCDEF123456"),
    ]);
    for (const r of results) expect(r.ok).toBe(false);
    expect(f.calls).toHaveLength(0);
  });
});

describe("the Machine config", () => {
  it("runs the files on Node 22 behind Fly.io's TLS", () => {
    const config = flyMachineConfig({
      files: [
        { path: "package.json", bytes: bytes('{"type":"module"}') },
        { path: "src/server.js", bytes: bytes("import http from 'node:http';") },
      ],
      entry: "src/server.js",
    });
    expect(config).toEqual({
      image: FLY_NODE_IMAGE,
      files: [
        { guest_path: "/app/package.json", raw_value: Buffer.from('{"type":"module"}').toString("base64") },
        { guest_path: "/app/src/server.js", raw_value: Buffer.from("import http from 'node:http';").toString("base64") },
      ],
      init: { cmd: ["node", "/app/src/server.js"] },
      env: { PORT: "8080", NODE_ENV: "production" },
      services: [
        {
          protocol: "tcp",
          internal_port: 8080,
          ports: [
            { port: 443, handlers: ["tls", "http"] },
            { port: 80, handlers: ["http"], force_https: true },
          ],
        },
      ],
      guest: { cpu_kind: "shared", cpus: 1, memory_mb: 256 },
      restart: { policy: "always" },
      metadata: { farbaek: "launch" },
    });
    expect(FLY_NODE_IMAGE).toBe("registry-1.docker.io/library/node:22-slim");
    // A view into a larger buffer is encoded from its own bytes only.
    const backing = bytes("xxhixx");
    expect(flyMachineConfig({ files: [{ path: "a.js", bytes: backing.subarray(2, 4) }], entry: "a.js" })?.files[0]?.raw_value).toBe(Buffer.from("hi").toString("base64"));
  });

  it("refuses unsafe paths, a missing entry, too many files and too many bytes", () => {
    const one = (path: string, entry = path) => flyMachineConfig({ files: [{ path, bytes: bytes("x") }], entry });
    for (const path of ["/etc/passwd", "../server.js", "src/../../x.js", "src\\server.js", "C:/server.js", "src//server.js", "./server.js", "", "a\u0000.js"]) expect(one(path)).toBeNull();
    expect(one("server.js", "main.js")).toBeNull();
    expect(one("server.js", "/server.js")).toBeNull();
    expect(flyMachineConfig({ files: [], entry: "server.js" })).toBeNull();
    expect(flyMachineConfig({ files: [{ path: "a.js", bytes: bytes("1") }, { path: "a.js", bytes: bytes("2") }], entry: "a.js" })).toBeNull();

    const many = Array.from({ length: FLY_FILES_LIMIT_COUNT + 1 }, (_, i) => ({ path: `f${i}.js`, bytes: bytes("x") }));
    expect(FLY_FILES_LIMIT_COUNT).toBe(200);
    expect(flyMachineConfig({ files: many, entry: "f0.js" })).toBeNull();
    expect(flyMachineConfig({ files: many.slice(0, FLY_FILES_LIMIT_COUNT), entry: "f0.js" })).not.toBeNull();

    expect(FLY_FILES_LIMIT_BYTES).toBe(512 * 1024);
    const half = new Uint8Array(FLY_FILES_LIMIT_BYTES / 2);
    expect(flyMachineConfig({ files: [{ path: "a.js", bytes: half }, { path: "b.js", bytes: half }], entry: "a.js" })).not.toBeNull();
    expect(flyMachineConfig({ files: [{ path: "a.js", bytes: half }, { path: "b.js", bytes: new Uint8Array(FLY_FILES_LIMIT_BYTES / 2 + 1) }], entry: "a.js" })).toBeNull();
  });
});

describe("a Machine's state as a launch status", () => {
  it("is ready once started, failed when failed or destroyed, and building otherwise", () => {
    expect(statusFromFlyMachine("started")).toBe("ready");
    expect(statusFromFlyMachine("failed")).toBe("failed");
    expect(statusFromFlyMachine("destroyed")).toBe("failed");
    for (const state of ["created", "starting", "stopped", "replacing", "pending"]) expect(statusFromFlyMachine(state)).toBe("building");
  });
});
