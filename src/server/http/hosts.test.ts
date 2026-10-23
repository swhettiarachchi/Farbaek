import { describe, expect, it } from "vitest";
import { appZone, decideRoute, normalizeHost, officeWriteAllowed, originOf, type RouteEnv, type RouteInput } from "./hosts";

const PROD: RouteEnv = { previewDomain: "farbaek.si", officeHost: "officespace.farbaek.com", appHost: "www.farbaek.com" };
const req = (host: string | null, pathname = "/", extra: Partial<RouteInput> = {}): RouteInput => ({ host, pathname, method: "GET", origin: null, secFetchSite: null, ...extra });
const route = (host: string | null, pathname = "/", extra: Partial<RouteInput> = {}, env: RouteEnv = PROD) => decideRoute(req(host, pathname, extra), env);

describe("decideRoute", () => {
  it("leaves the customer app alone on www, the Railway address and localhost", () => {
    expect(route("www.farbaek.com", "/app/projects")).toEqual({ kind: "app" });
    expect(route("WWW.Farbaek.com.", "/")).toEqual({ kind: "app" });
    expect(route("farbaek-production.up.railway.app", "/api/health")).toEqual({ kind: "app" });
    expect(route("localhost:3000", "/app", {}, { officeHost: "officespace.localhost:3000", appHost: "localhost:3000" })).toEqual({ kind: "app" });
    expect(route(null, "/")).toEqual({ kind: "app" });
  });

  it("serves the office only on its own host, with every path under /office", () => {
    expect(route("officespace.farbaek.com", "/")).toEqual({ kind: "office", rewrite: "/office" });
    expect(route("officespace.farbaek.com", "/staff")).toEqual({ kind: "office", rewrite: "/office/staff" });
    expect(route("OfficeSpace.farbaek.com", "/audit")).toEqual({ kind: "office", rewrite: "/office/audit" });
    // Customer routes don't exist there: they land inside /office and find nothing.
    expect(route("officespace.farbaek.com", "/api/health")).toEqual({ kind: "office", rewrite: "/office/api/health" });
    expect(route("officespace.farbaek.com", "/app")).toEqual({ kind: "office", rewrite: "/office/app" });
    expect(route("officespace.farbaek.com", "/office/staff")).toEqual({ kind: "office", rewrite: "/office/office/staff" });
    expect(route("officespace.farbaek.com", "/brand/farbaek-logo.webp")).toEqual({ kind: "office-public" });
  });

  it("hides /office everywhere else", () => {
    expect(route("www.farbaek.com", "/office")).toEqual({ kind: "not-found" });
    expect(route("www.farbaek.com", "/office/staff")).toEqual({ kind: "not-found" });
    expect(route("farbaek-production.up.railway.app", "/office")).toEqual({ kind: "not-found" });
    expect(route("www.farbaek.com", "/officers")).toEqual({ kind: "app" });
  });

  it("answers not found for every other name under the app's domain, the office's included while it's off", () => {
    expect(route("random.farbaek.com", "/")).toEqual({ kind: "not-found" });
    expect(route("deep.name.farbaek.com", "/app")).toEqual({ kind: "not-found" });
    expect(route("farbaek.com", "/")).toEqual({ kind: "not-found" });
    expect(route("officespace.farbaek.com", "/", {}, { ...PROD, officeHost: null })).toEqual({ kind: "not-found" });
    // An office host set to the app's own host is ignored, so the app keeps working.
    expect(route("www.farbaek.com", "/", {}, { ...PROD, officeHost: "www.farbaek.com" })).toEqual({ kind: "app" });
  });

  it("keeps the preview gateway and published sites exactly as before", () => {
    expect(route("p-abcdefghijklmnopqrstuvwxyz.farbaek.si", "/office")).toEqual({ kind: "preview" });
    expect(route("bakery.farbaek.si", "/")).toEqual({ kind: "site" });
    expect(route("farbaek.si", "/")).toEqual({ kind: "site-domain-apex" });
    expect(route("bad_name.farbaek.si", "/")).toEqual({ kind: "not-found" });
  });

  it("refuses writes to the office from anywhere but the office", () => {
    const post = (origin: string | null, secFetchSite: string | null = null) => route("officespace.farbaek.com", "/staff", { method: "POST", origin, secFetchSite });
    expect(post("https://officespace.farbaek.com")).toEqual({ kind: "office", rewrite: "/office/staff" });
    expect(post("https://www.farbaek.com")).toEqual({ kind: "office-refused" });
    expect(post("http://officespace.farbaek.com")).toEqual({ kind: "office-refused" });
    expect(post("null")).toEqual({ kind: "office-refused" });
    expect(post(null)).toEqual({ kind: "office-refused" });
    expect(post(null, "same-origin")).toEqual({ kind: "office", rewrite: "/office/staff" });
    expect(post(null, "same-site")).toEqual({ kind: "office-refused" });
    expect(route("officespace.farbaek.com", "/", { method: "HEAD" })).toEqual({ kind: "office", rewrite: "/office" });
  });
});

describe("host helpers", () => {
  it("normalise hosts and find the app's zone", () => {
    expect(normalizeHost(" WWW.Farbaek.COM. ")).toBe("www.farbaek.com");
    expect(normalizeHost("officespace.localhost.:3000")).toBe("officespace.localhost:3000");
    expect(appZone("www.farbaek.com")).toBe("farbaek.com");
    expect(appZone("farbaek.com")).toBe("farbaek.com");
    expect(appZone("localhost:3000")).toBeNull();
    expect(appZone("127.0.0.1:3000")).toBeNull();
    expect(originOf("officespace.farbaek.com")).toBe("https://officespace.farbaek.com");
    expect(originOf("officespace.localhost:3000")).toBe("http://officespace.localhost:3000");
    expect(officeWriteAllowed({ method: "get", origin: "https://evil.example", secFetchSite: "cross-site" }, "https://officespace.farbaek.com")).toBe(true);
  });
});

describe("custom domains (ADR 0045)", () => {
  const ON: RouteEnv = { ...PROD, customDomains: true };

  it("sends any other real name to the site route once sites are connected", () => {
    expect(route("www.example.com", "/", {}, ON)).toEqual({ kind: "custom-site" });
    expect(route("Shop.Example.co.uk.", "/about", {}, ON)).toEqual({ kind: "custom-site" });
  });

  it("never takes the app, the office, Farbaek's own names, local names or addresses", () => {
    expect(route("www.farbaek.com", "/", {}, ON)).toEqual({ kind: "app" });
    expect(route("officespace.farbaek.com", "/", {}, ON)).toEqual({ kind: "office", rewrite: "/office" });
    expect(route("api.farbaek.com", "/", {}, ON)).toEqual({ kind: "not-found" });
    expect(route("bakery.farbaek.si", "/", {}, ON)).toEqual({ kind: "site" });
    for (const host of ["localhost:3000", "shop.localhost:3000", "203.0.113.7", "[::1]:3000", "intranet"]) {
      expect(route(host, "/", {}, ON)).toEqual({ kind: "app" });
    }
  });

  it("stays off until sites are connected", () => {
    expect(route("www.example.com", "/")).toEqual({ kind: "app" });
  });
});
