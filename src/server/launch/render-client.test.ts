import { describe, expect, it } from "vitest";
import { createRenderClient, statusFromRenderDeploy } from "./render-client";

const TOKEN = "rnd_testKeyValue1234567890";

function fake(respond: (url: URL, init: RequestInit) => Response | Promise<Response>) {
  const calls: { url: URL; init: RequestInit }[] = [];
  const fetcher: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    calls.push({ url, init: init ?? {} });
    return respond(url, init ?? {});
  };
  return { fetcher, calls };
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const body = (init: RequestInit) => JSON.parse(String(init.body)) as Record<string, unknown>;

const SERVICE = {
  id: "srv-abc123def456",
  name: "harbour-lane",
  ownerId: "tea-team000001",
  type: "web_service",
  repo: "https://github.com/someone/harbour-lane",
  branch: "main",
  dashboardUrl: "https://dashboard.render.com/web/srv-abc123def456",
  serviceDetails: { url: "https://harbour-lane.onrender.com", runtime: "node", plan: "free" },
};
const OWNERS = [
  { owner: { id: "usr-person000001", name: "Suvin W", email: "someone@example.com", type: "user" }, cursor: "a" },
  { owner: { id: "tea-team000001", name: "Studio", email: "team@example.com", type: "team" }, cursor: "b" },
];
const BUILD = { repo: "https://github.com/someone/harbour-lane", branch: "main", buildCommand: "npm ci && npm run build", startCommand: "npm start" };

describe("the Render client", () => {
  it("calls only api.render.com, with the key as a Bearer token, never following redirects or keeping the email", async () => {
    const f = fake(() => json(OWNERS));
    const r = await createRenderClient(TOKEN, { fetcher: f.fetcher }).owners();
    expect(r).toEqual({ ok: true, value: [{ id: "usr-person000001", name: "Suvin W" }, { id: "tea-team000001", name: "Studio" }] });
    expect(f.calls).toHaveLength(1);
    expect(f.calls[0]!.url.origin).toBe("https://api.render.com");
    expect(f.calls[0]!.url.pathname).toBe("/v1/owners");
    expect(f.calls[0]!.url.searchParams.get("limit")).toBe("20");
    const headers = f.calls[0]!.init.headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Bearer ${TOKEN}`);
    expect(headers["User-Agent"]).toMatch(/^Farbaek \(/);
    expect(f.calls[0]!.init.redirect).toBe("error");
    expect(f.calls[0]!.init.signal).toBeInstanceOf(AbortSignal);
    expect(JSON.stringify(r)).not.toContain("example.com");
  });

  it("connects to the chosen workspace, or the first, and says when the key can't reach it", async () => {
    const f = fake(() => json(OWNERS));
    const client = createRenderClient(TOKEN, { fetcher: f.fetcher });
    expect(await client.whoami(null)).toEqual({ ok: true, value: { id: "usr-person000001", name: "Suvin W" } });
    expect(await client.whoami("tea-team000001")).toEqual({ ok: true, value: { id: "tea-team000001", name: "Studio" } });
    const missing = await client.whoami("tea-elsewhere01");
    expect(missing.ok).toBe(false);
    expect(!missing.ok && missing.message).toMatch(/can't reach that Render workspace/);
    const none = await createRenderClient(TOKEN, { fetcher: fake(() => json([])).fetcher }).whoami(null);
    expect(!none.ok && none.message).toMatch(/doesn't reach any Render workspace/);
  });

  it("finds a service by its exact name in the workspace", async () => {
    const f = fake(() => json([{ service: { ...SERVICE, id: "srv-old000000001", name: "harbour-lane-old" } }, { service: SERVICE }]));
    const r = await createRenderClient(TOKEN, { fetcher: f.fetcher }).findService("tea-team000001", "harbour-lane");
    expect(r).toEqual({ ok: true, value: { id: "srv-abc123def456", name: "harbour-lane", url: "https://harbour-lane.onrender.com", dashboardUrl: "https://dashboard.render.com/web/srv-abc123def456", repo: "https://github.com/someone/harbour-lane", branch: "main" } });
    expect(f.calls[0]!.url.pathname).toBe("/v1/services");
    expect(f.calls[0]!.url.searchParams.get("name")).toBe("harbour-lane");
    expect(f.calls[0]!.url.searchParams.get("ownerId")).toBe("tea-team000001");
    const none = await createRenderClient(TOKEN, { fetcher: fake(() => json([{ service: { ...SERVICE, name: "harbour-lane-2" } }])).fetcher }).findService("tea-team000001", "harbour-lane");
    expect(none).toEqual({ ok: true, value: null });
  });

  it("keeps only Render's own addresses", async () => {
    const odd = { ...SERVICE, dashboardUrl: "https://evil.example/web/srv-abc123def456", serviceDetails: { url: "http://harbour-lane.onrender.com" } };
    const r = await createRenderClient(TOKEN, { fetcher: fake(() => json([{ service: odd }])).fetcher }).findService("tea-team000001", "harbour-lane");
    expect(r).toMatchObject({ ok: true, value: { url: null, dashboardUrl: null } });
    const bare = { id: "srv-abc123def456", name: "harbour-lane" };
    const unknown = await createRenderClient(TOKEN, { fetcher: fake(() => json([{ service: bare }])).fetcher }).findService("tea-team000001", "harbour-lane");
    expect(unknown).toMatchObject({ ok: true, value: { repo: null, branch: null, url: null } });
  });

  it("creates a free Node web service with automatic deploys and install scripts off, and keeps its first deploy", async () => {
    const f = fake(() => json({ service: SERVICE, deployId: "dep-first0000001" }, 201));
    const r = await createRenderClient(TOKEN, { fetcher: f.fetcher }).createService({ ownerId: "tea-team000001", name: "harbour-lane", ...BUILD });
    expect(r).toMatchObject({ ok: true, value: { id: "srv-abc123def456", url: "https://harbour-lane.onrender.com", repo: BUILD.repo, branch: "main", deployId: "dep-first0000001" } });
    expect(f.calls[0]!.url.pathname).toBe("/v1/services");
    expect(f.calls[0]!.init.method).toBe("POST");
    expect(body(f.calls[0]!.init)).toEqual({
      type: "web_service",
      name: "harbour-lane",
      ownerId: "tea-team000001",
      repo: BUILD.repo,
      branch: "main",
      autoDeployTrigger: "off",
      envVars: [
        { key: "NPM_CONFIG_IGNORE_SCRIPTS", value: "true" },
        { key: "PORT", value: "8080" },
      ],
      serviceDetails: { runtime: "node", plan: "free", envSpecificDetails: { buildCommand: BUILD.buildCommand, startCommand: "npm start" } },
    });
    const noDeploy = await createRenderClient(TOKEN, { fetcher: fake(() => json({ service: SERVICE }, 201)).fetcher }).createService({ ownerId: "tea-team000001", name: "harbour-lane", ...BUILD });
    expect(noDeploy).toMatchObject({ ok: true, value: { deployId: null } });
    const oddDeploy = await createRenderClient(TOKEN, { fetcher: fake(() => json({ service: SERVICE, deployId: "../owners" }, 201)).fetcher }).createService({ ownerId: "tea-team000001", name: "harbour-lane", ...BUILD });
    expect(oddDeploy).toMatchObject({ ok: true, value: { deployId: null } });
  });

  it("updates a service's repository, branch and commands, keeping automatic deploys off", async () => {
    const f = fake(() => json(SERVICE));
    const r = await createRenderClient(TOKEN, { fetcher: f.fetcher }).updateService("srv-abc123def456", BUILD);
    expect(r).toMatchObject({ ok: true, value: { id: "srv-abc123def456" } });
    expect(f.calls[0]!.url.pathname).toBe("/v1/services/srv-abc123def456");
    expect(f.calls[0]!.init.method).toBe("PATCH");
    expect(body(f.calls[0]!.init)).toEqual({
      repo: BUILD.repo,
      branch: "main",
      autoDeployTrigger: "off",
      serviceDetails: { envSpecificDetails: { buildCommand: BUILD.buildCommand, startCommand: "npm start" } },
    });
  });

  it("deploys one commit and reads the deploy back", async () => {
    const sha = "0123456789abcdef0123456789abcdef01234567";
    const f = fake(() => json({ id: "dep-run000000001", status: "build_in_progress", commit: { id: sha } }, 201));
    const client = createRenderClient(TOKEN, { fetcher: f.fetcher });
    expect(await client.deployCommit("srv-abc123def456", sha)).toEqual({ ok: true, value: { id: "dep-run000000001", status: "build_in_progress" } });
    expect(f.calls[0]!.url.pathname).toBe("/v1/services/srv-abc123def456/deploys");
    expect(f.calls[0]!.init.method).toBe("POST");
    expect(body(f.calls[0]!.init)).toEqual({ commitId: sha });
    expect(await client.getDeploy("srv-abc123def456", "dep-run000000001")).toEqual({ ok: true, value: { id: "dep-run000000001", status: "build_in_progress", commitId: sha } });
    expect(f.calls[1]!.url.pathname).toBe("/v1/services/srv-abc123def456/deploys/dep-run000000001");
    const odd = await createRenderClient(TOKEN, { fetcher: fake(() => json({ id: "dep-run000000001", status: "something_new" })).fetcher }).getDeploy("srv-abc123def456", "dep-run000000001");
    expect(odd).toMatchObject({ ok: true, value: { status: "unknown", commitId: null } });
    const queued = await createRenderClient(TOKEN, { fetcher: fake(() => new Response(null, { status: 202 })).fetcher }).deployCommit("srv-abc123def456", sha);
    expect(!queued.ok && queued.message).toMatch(/queued this deploy/);
  });

  it("lists recent deploys, and finds the one a queued deploy became by its commit", async () => {
    const sha = "0123456789abcdef0123456789abcdef01234567";
    const LIST = [
      { deploy: { id: "dep-new000000001", status: "queued", commit: { id: sha } }, cursor: "a" },
      { deploy: { id: "dep-mid000000001", status: "build_in_progress", commit: { id: "f".repeat(40) } }, cursor: "b" },
      { deploy: { id: "dep-old000000001", status: "live", commit: { id: sha } }, cursor: "c" },
      { deploy: { id: "not-an-id/../x", status: "live" }, cursor: "d" },
    ];
    const f = fake((url, init) => (init.method === "POST" ? new Response(null, { status: 202 }) : json(LIST)));
    const client = createRenderClient(TOKEN, { fetcher: f.fetcher });
    expect(await client.listDeploys("srv-abc123def456")).toEqual({
      ok: true,
      value: [
        { id: "dep-new000000001", status: "queued", commitId: sha },
        { id: "dep-mid000000001", status: "build_in_progress", commitId: "f".repeat(40) },
        { id: "dep-old000000001", status: "live", commitId: sha },
      ],
    });
    expect(f.calls[0]!.url.pathname).toBe("/v1/services/srv-abc123def456/deploys");
    expect(f.calls[0]!.url.searchParams.get("limit")).toBe("20");
    expect(f.calls[0]!.init.method).toBe("GET");
    expect(await client.deployCommit("srv-abc123def456", sha.slice(0, 12))).toEqual({ ok: true, value: { id: "dep-new000000001", status: "queued" } });
    expect(f.calls.slice(1).map((c) => c.init.method)).toEqual(["POST", "GET"]);
    expect(await client.listDeploys("srv-../x")).toMatchObject({ ok: false });
    expect(f.calls).toHaveLength(3);
  });

  it("refuses an id that isn't Render's shape without calling Render", async () => {
    const f = fake(() => json({}));
    const client = createRenderClient(TOKEN, { fetcher: f.fetcher });
    const results = await Promise.all([
      client.getDeploy("srv-abc123def456/../../owners", "dep-run000000001"),
      client.getDeploy("srv-abc123def456", "dep-1?x=1"),
      client.updateService("../services", BUILD),
      client.deployCommit("srv abc", "0123456"),
      client.deployCommit("srv-abc123def456", "not-a-commit"),
      client.findService("owner", "harbour-lane"),
      client.createService({ ownerId: "tea-team000001/x", name: "harbour-lane", ...BUILD }),
      client.whoami("usr-%2e%2e"),
      client.listDeploys("srv-abc123def456/deploys/dep-x"),
    ]);
    for (const r of results) expect(r.ok).toBe(false);
    expect(f.calls).toHaveLength(0);
  });

  it("turns Render's errors into sentences without the key, even when Render echoes it", async () => {
    const say = async (status: number, message = `key ${TOKEN} is bad`) => {
      const r = await createRenderClient(TOKEN, { fetcher: fake(() => json({ id: "err", message }, status)).fetcher }).createService({ ownerId: "tea-team000001", name: "harbour-lane", ...BUILD });
      return r.ok ? null : r.message;
    };
    const messages = await Promise.all([say(401), say(402), say(403), say(404), say(429), say(400), say(500), say(400, "a different key rnd_anotherKey99999999 was sent")]);
    expect(messages[0]).toMatch(/didn't accept this API key/);
    expect(messages[1]).toBe("Render wants payment details on this account before it creates the service. They're added in your Render account's billing settings.");
    expect(messages[4]).toMatch(/limiting requests/);
    expect(messages[5]).toContain("[token]");
    expect(messages[6]).toMatch(/didn't answer properly/);
    expect(messages[7]).not.toContain("rnd_anotherKey");
    for (const m of messages) {
      expect(m).toBeTruthy();
      expect(m).not.toContain(TOKEN);
      expect(m).not.toContain("—");
    }
    const long = await say(400, "x".repeat(500));
    expect(long!.length).toBeLessThan(260);
    const down = await createRenderClient(TOKEN, {
      fetcher: async () => {
        throw new Error(`connect failed for ${TOKEN}`);
      },
    }).owners();
    expect(down).toEqual({ ok: false, message: "Farbaek couldn't reach Render. Try again in a few minutes." });
  });

  it("maps Render's deploy statuses to a launch order status", () => {
    expect(statusFromRenderDeploy("live")).toBe("ready");
    for (const s of ["created", "queued", "build_in_progress", "update_in_progress", "pre_deploy_in_progress"]) expect(statusFromRenderDeploy(s)).toBe("building");
    for (const s of ["build_failed", "update_failed", "pre_deploy_failed", "canceled", "deactivated"]) expect(statusFromRenderDeploy(s)).toBe("failed");
    expect(statusFromRenderDeploy("something_new")).toBe("building");
    expect(statusFromRenderDeploy("post_deploy_failed")).toBe("failed");
  });
});
