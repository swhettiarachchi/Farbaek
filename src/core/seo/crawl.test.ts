import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PRIVATE_PATHS, PUBLIC_PAGES, robotsRules, sitemapUrls } from "./crawl";

const SITE = "https://www.farbaek.com";

describe("robots rules", () => {
  it("lets crawlers read the public site on the app's host, with its sitemap", () => {
    const r = robotsRules("www.farbaek.com", "www.farbaek.com", SITE);
    expect(r.allow).toEqual(["/"]);
    expect(r.disallow).toContain("/app");
    expect(r.disallow).toContain("/office");
    expect(r.disallow).toContain("/sign-in/password");
    expect(r.sitemap).toBe("https://www.farbaek.com/sitemap.xml");
  });

  it("asks crawlers to stay away from every other host, and when the host is unknown", () => {
    for (const [host, app] of [
      ["officespace.farbaek.com", "www.farbaek.com"],
      ["farbaek.com", "www.farbaek.com"],
      [null, "www.farbaek.com"],
      ["www.farbaek.com", null],
    ] as const) {
      expect(robotsRules(host, app, SITE)).toEqual({ allow: [], disallow: ["/"], sitemap: null });
    }
  });

  it("never lists a private path as public", () => {
    const privatePaths: readonly string[] = PRIVATE_PATHS;
    for (const page of PUBLIC_PAGES) {
      expect(privatePaths.some((p) => page === p || page.startsWith(`${p}/`))).toBe(false);
    }
  });
});

describe("sitemap", () => {
  it("lists every public page once, absolute, without a doubled slash", () => {
    const urls = sitemapUrls(`${SITE}/`);
    expect(urls[0]).toBe("https://www.farbaek.com/");
    expect(urls).toContain("https://www.farbaek.com/pricing");
    expect(new Set(urls).size).toBe(urls.length);
    expect(urls.every((u) => !u.slice("https://".length).includes("//"))).toBe(true);
  });

  it("lists only pages that exist", () => {
    for (const page of PUBLIC_PAGES) {
      const file = page === "/" ? "src/app/(site)/page.tsx" : `src/app/(site)${page}/page.tsx`;
      expect(existsSync(join(process.cwd(), file)), file).toBe(true);
    }
  });
});
