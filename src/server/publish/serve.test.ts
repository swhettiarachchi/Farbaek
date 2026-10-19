import { describe, expect, it } from "vitest";
import { handleSiteRequest, siteNameFromHost, type SiteServeDeps } from "./serve";

const FILES = [
  { path: "index.html", revision: 3, sha256: "a".repeat(64), size: 20 },
  { path: "about.html", revision: 1, sha256: "b".repeat(64), size: 10 },
  { path: "styles.css", revision: 2, sha256: "c".repeat(64), size: 5 },
];
const CONTENT: Record<string, string> = { "index.html:3": "<h1>Home</h1>", "about.html:1": "<h1>About</h1>", "styles.css:2": "h1{}" };

const deps: SiteServeDeps = {
  domain: "farbaek.si",
  liveSite: async (name) => (name === "sunrise-bakery" ? { deploymentId: "d1", projectId: "p1", files: FILES } : null),
  content: async (_p, path, revision) => CONTENT[`${path}:${revision}`] ?? null,
};

const get = (host: string, path = "/", init: RequestInit = {}) => handleSiteRequest(new Request(`http://localhost:3000/site-serve${path}`, { ...init, headers: { host, ...(init.headers ?? {}) } }), deps);

describe("serving published sites", () => {
  it("only answers for a valid single name on the site domain", () => {
    expect(siteNameFromHost("sunrise-bakery.farbaek.si", "farbaek.si")).toBe("sunrise-bakery");
    expect(siteNameFromHost("SUNRISE-BAKERY.farbaek.si.", "farbaek.si")).toBe("sunrise-bakery");
    expect(siteNameFromHost("www.farbaek.com", "farbaek.si")).toBeNull();
    expect(siteNameFromHost("farbaek.si", "farbaek.si")).toBeNull();
    expect(siteNameFromHost("a.b.farbaek.si", "farbaek.si")).toBeNull();
    expect(siteNameFromHost("www.farbaek.si", "farbaek.si")).toBeNull();
    expect(siteNameFromHost(`p-${"a".repeat(26)}.farbaek.si`, "farbaek.si")).toBeNull();
    expect(siteNameFromHost("sunrise-bakery.farbaek.si", null)).toBeNull();
  });

  it("serves the live deployment's stored revisions, with pages found as previews find them", async () => {
    const home = await get("sunrise-bakery.farbaek.si");
    expect(home.status).toBe(200);
    expect(await home.text()).toBe("<h1>Home</h1>");
    expect(home.headers.get("content-type")).toContain("text/html");
    expect(home.headers.get("x-content-type-options")).toBe("nosniff");
    expect(home.headers.get("set-cookie")).toBeNull();
    expect(await (await get("sunrise-bakery.farbaek.si", "/about")).text()).toBe("<h1>About</h1>");
    expect((await get("sunrise-bakery.farbaek.si", "/styles.css")).headers.get("content-type")).toContain("text/css");
    expect((await get("sunrise-bakery.farbaek.si", "/missing")).status).toBe(404);
    expect((await get("sunrise-bakery.farbaek.si", "/../secret")).status).toBe(404);
  });

  it("answers 304 to a matching ETag, refuses writes, and has nothing for unknown names or Farbaek's own host", async () => {
    expect((await get("sunrise-bakery.farbaek.si", "/", { headers: { "if-none-match": `"${"a".repeat(64)}"` } })).status).toBe(304);
    expect((await get("sunrise-bakery.farbaek.si", "/", { method: "POST" })).status).toBe(405);
    const unknown = await get("nobody.farbaek.si");
    expect(unknown.status).toBe(404);
    expect(await unknown.text()).toContain("no site here");
    expect((await get("www.farbaek.com")).status).toBe(404);
  });
});
