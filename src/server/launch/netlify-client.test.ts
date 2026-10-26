import { describe, expect, it } from "vitest";
import { createNetlifyClient, uploadPath, type Fetcher } from "./netlify-client";

const TOKEN = "nfp_test_token_value";

function fake(respond: (url: URL, init: RequestInit) => Response | Promise<Response>) {
  const calls: { url: URL; init: RequestInit }[] = [];
  const fetcher: Fetcher = async (u, init) => {
    const url = new URL(u);
    calls.push({ url, init });
    return respond(url, init);
  };
  return { fetcher, calls };
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const SITE = { id: "site_1", name: "harbour-lane", ssl_url: "https://harbour-lane.netlify.app", admin_url: "https://app.netlify.com/sites/harbour-lane", published_deploy: { id: "dep_0" } };

describe("the Netlify client", () => {
  it("calls only api.netlify.com, with the token, and never follows redirects or keeps the email", async () => {
    const f = fake((url) => (url.pathname === "/api/v1/user" ? json({ id: "u1", full_name: "Suvin W", email: "someone@example.com" }) : json([{ id: "acc_1", name: "Suvin's team", slug: "suvin" }])));
    expect(await createNetlifyClient(TOKEN, { fetcher: f.fetcher }).whoami()).toEqual({ ok: true, value: { id: "u1", name: "Suvin W" } });
    expect(f.calls.map((c) => c.url.origin)).toEqual(["https://api.netlify.com", "https://api.netlify.com"]);
    expect(f.calls.map((c) => c.url.pathname)).toEqual(["/api/v1/user", "/api/v1/accounts"]);
    const headers = f.calls[0]!.init.headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Bearer ${TOKEN}`);
    expect(headers["User-Agent"]).toMatch(/^Farbaek LaunchOS/);
    expect(f.calls[0]!.init.redirect).toBe("error");
  });

  it("checks that the token reaches a team before using it", async () => {
    const f = fake((url) => (url.pathname === "/api/v1/user" ? json({ id: "u1", full_name: null }) : json([{ id: "acc_1", name: "Studio", slug: "studio" }])));
    expect(await createNetlifyClient(TOKEN, { accountSlug: "studio", fetcher: f.fetcher }).whoami()).toEqual({ ok: true, value: { id: "acc_1", name: "Studio" } });
    const other = await createNetlifyClient(TOKEN, { accountSlug: "elsewhere", fetcher: f.fetcher }).whoami();
    expect(other).toMatchObject({ ok: false, code: "INVALID" });
    expect(!other.ok && other.message).toMatch(/can't reach a Netlify team called elsewhere/);
  });

  it("finds a site by its exact name, in the team when there is one", async () => {
    const f = fake(() => json([{ ...SITE, name: "harbour-lane-old", id: "site_0" }, SITE]));
    const personal = await createNetlifyClient(TOKEN, { fetcher: f.fetcher }).findSite("harbour-lane");
    expect(personal).toEqual({ ok: true, value: { id: "site_1", name: "harbour-lane", adminUrl: "https://app.netlify.com/sites/harbour-lane", publishedDeployId: "dep_0" } });
    expect(f.calls[0]!.url.pathname).toBe("/api/v1/sites");
    expect(f.calls[0]!.url.searchParams.get("name")).toBe("harbour-lane");
    expect(f.calls[0]!.url.searchParams.get("filter")).toBe("all");
    await createNetlifyClient(TOKEN, { accountSlug: "studio", fetcher: f.fetcher }).findSite("harbour-lane");
    expect(f.calls[1]!.url.pathname).toBe("/api/v1/studio/sites");
    expect(await createNetlifyClient(TOKEN, { fetcher: fake(() => json([{ ...SITE, name: "harbour-lane-2" }])).fetcher }).findSite("harbour-lane")).toEqual({ ok: true, value: null });
  });

  it("makes a site, and says plainly when Netlify refuses the name", async () => {
    const f = fake(() => json(SITE, 201));
    expect(await createNetlifyClient(TOKEN, { fetcher: f.fetcher }).createSite("harbour-lane")).toMatchObject({ ok: true, value: { id: "site_1" } });
    expect(f.calls[0]!.init.method).toBe("POST");
    expect(JSON.parse(String(f.calls[0]!.init.body))).toEqual({ name: "harbour-lane" });
    const taken = await createNetlifyClient(TOKEN, { fetcher: fake(() => json({ code: 422, message: "subdomain must be unique" }, 422)).fetcher }).createSite("harbour-lane");
    expect(taken).toMatchObject({ ok: false, code: "INVALID" });
    expect(!taken.ok && taken.message).toMatch(/choose another name/);
  });

  it("creates a production deploy from the file digest, and reads what Netlify still needs", async () => {
    const f = fake(() => json({ id: "dep_1", state: "uploading", required: ["a".repeat(40)] }));
    const r = await createNetlifyClient(TOKEN, { fetcher: f.fetcher }).createDeploy("site_1", { "/index.html": "a".repeat(40) }, { title: "Farbaek launch 1a2b", async: false });
    expect(r).toEqual({ ok: true, value: { id: "dep_1", siteId: null, state: "uploading", required: ["a".repeat(40)], errorMessage: null } });
    expect(f.calls[0]!.url.pathname).toBe("/api/v1/sites/site_1/deploys");
    expect(f.calls[0]!.url.searchParams.get("title")).toBe("Farbaek launch 1a2b");
    expect(JSON.parse(String(f.calls[0]!.init.body))).toEqual({ files: { "/index.html": "a".repeat(40) }, async: false, draft: false });
  });

  it("uploads a file to its own escaped path, and tries again when Netlify doesn't answer", async () => {
    let n = 0;
    const f = fake(() => (++n < 3 ? new Response("busy", { status: 503 }) : json({ id: "f1" })));
    expect(await createNetlifyClient(TOKEN, { fetcher: f.fetcher }).uploadFile("dep_1", "docs/my page.html", Buffer.from("<h1>Hi</h1>"))).toEqual({ ok: true, value: null });
    expect(f.calls).toHaveLength(3);
    expect(f.calls[0]!.url.pathname).toBe("/api/v1/deploys/dep_1/files/docs/my%20page.html");
    expect(f.calls[0]!.init.method).toBe("PUT");
    expect((f.calls[0]!.init.headers as Record<string, string>)["Content-Type"]).toBe("application/octet-stream");
    // A refusal isn't tried again.
    const refused = fake(() => json({ message: "bad" }, 400));
    expect(await createNetlifyClient(TOKEN, { fetcher: refused.fetcher }).uploadFile("dep_1", "a.html", Buffer.from("x"))).toMatchObject({ ok: false, code: "INVALID" });
    expect(refused.calls).toHaveLength(1);
    expect(uploadPath("/a b/c%d.html")).toBe("a%20b/c%25d.html");
  });

  it("turns Netlify's errors into sentences without the token", async () => {
    const say = async (status: number, message = `token ${TOKEN} is bad`) => {
      const r = await createNetlifyClient(TOKEN, { fetcher: fake(() => json({ code: status, message }, status)).fetcher }).getDeploy("dep_1");
      return r.ok ? null : r;
    };
    expect(await say(401)).toMatchObject({ code: "AUTH" });
    expect(await say(402)).toMatchObject({ code: "PAYMENT" });
    expect(await say(429)).toMatchObject({ code: "RATE_LIMITED" });
    expect(await say(500)).toMatchObject({ code: "UNAVAILABLE" });
    const invalid = await say(400);
    expect(invalid?.message).toContain("[token]");
    expect(invalid?.message).not.toContain(TOKEN);
    const down = await createNetlifyClient(TOKEN, {
      fetcher: async () => {
        throw new Error(`connect failed for ${TOKEN}`);
      },
    }).getSite("site_1");
    expect(down).toEqual({ ok: false, code: "UNAVAILABLE", message: "Farbaek couldn't reach Netlify. Try again in a few minutes." });
  });
});
