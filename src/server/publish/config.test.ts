import { afterEach, describe, expect, it, vi } from "vitest";
import { siteDomain, siteTarget } from "./config";

afterEach(() => vi.unstubAllEnvs());

describe("siteDomain", () => {
  it("uses SITES_DOMAIN, so sites can go live while previews stay off", () => {
    vi.stubEnv("SITES_DOMAIN", " Farbaek.si ");
    vi.stubEnv("SANDBOX_PREVIEW_DOMAIN", "");
    expect(siteDomain()).toBe("farbaek.si");
  });

  it("falls back to the preview domain, and is off when neither is set", () => {
    vi.stubEnv("SITES_DOMAIN", "");
    vi.stubEnv("SANDBOX_PREVIEW_DOMAIN", "preview.localhost:3000");
    expect(siteDomain()).toBe("preview.localhost:3000");
    vi.stubEnv("SANDBOX_PREVIEW_DOMAIN", "");
    expect(siteDomain()).toBeNull();
  });
});

describe("siteTarget", () => {
  it("points subdomains at sites.<domain> and root domains at a valid IPv4 address only", () => {
    expect(siteTarget("farbaek.si", "2.25.88.188")).toEqual({ cname: "sites.farbaek.si", ip: "2.25.88.188" });
    expect(siteTarget("farbaek.si", "999.1.1.1")).toEqual({ cname: "sites.farbaek.si", ip: null });
    expect(siteTarget(null, "2.25.88.188")).toBeNull();
  });
});
