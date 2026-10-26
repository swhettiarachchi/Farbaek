import { describe, expect, it } from "vitest";
import { NETLIFY_NAME, diffReady, netlifyFit, netlifyPathProblem, netlifySiteName, statusFromNetlifyState } from "./netlify";
import { LAUNCH_KINDS } from "./planner";
import { inspectorAddress, launchAddress, netlifyAppUrl } from "./providers";

describe("LaunchOS with Netlify", () => {
  it("names the site from the Farbaek project, as one subdomain label", () => {
    expect(netlifySiteName("Harbour Lane Studio")).toBe("harbour-lane-studio");
    expect(netlifySiteName("!!!")).toBe("farbaek-site");
    expect(netlifySiteName(`${"a".repeat(62)} b`)).toBe("a".repeat(62));
    expect(netlifySiteName("a".repeat(150))).toHaveLength(63);
    for (const n of ["harbour-lane-studio", "farbaek-site", "a".repeat(63)]) expect(n).toMatch(NETLIFY_NAME);
    for (const bad of ["-x", "x-", "Upper", "a_b", "a.b", "", "a".repeat(64)]) expect(bad).not.toMatch(NETLIFY_NAME);
  });

  it("serves only static projects, and says why for every other kind", () => {
    expect(netlifyFit({ kind: "static" })).toBeNull();
    expect(netlifyFit({ kind: "vite" })).toMatch(/needs a build first\. Vercel builds it/);
    expect(netlifyFit({ kind: "nextjs" })).toMatch(/Next\.js/);
    expect(netlifyFit({ kind: "node_server" })).toMatch(/runs a server/);
    for (const kind of LAUNCH_KINDS.filter((k) => k !== "static")) expect(netlifyFit({ kind })).toMatch(/\.$/);
  });

  it("names a file Netlify can't serve", () => {
    expect(netlifyPathProblem(["index.html", "css/site.css"])).toBeNull();
    expect(netlifyPathProblem(["index.html", "notes#1.html", "a?b.txt"])).toMatch(/notes#1\.html does\./);
  });

  it("reads Netlify's deploy states", () => {
    for (const s of ["new", "enqueued", "uploading", "uploaded", "processing", "prepared"]) expect(statusFromNetlifyState(s)).toBe("building");
    expect(statusFromNetlifyState("ready")).toBe("ready");
    expect(statusFromNetlifyState("error")).toBe("failed");
    expect(statusFromNetlifyState("rejected")).toBe("failed");
    expect(diffReady("preparing")).toBe(false);
    expect(diffReady("new")).toBe(false);
    expect(diffReady("prepared")).toBe(true);
    expect(diffReady("ready")).toBe(true);
  });
});

describe("launch addresses", () => {
  it("are https on the provider's own domain, and nothing else", () => {
    expect(netlifyAppUrl("storefront.netlify.app")).toBe("https://storefront.netlify.app");
    expect(netlifyAppUrl("https://6720aa--storefront.netlify.app/about")).toBe("https://6720aa--storefront.netlify.app");
    for (const bad of ["http://storefront.netlify.app", "https://storefront.netlify.app.evil.example", "https://a.b.netlify.app", "https://netlify.app", "https://x.netlify.app:8443", "https://u:p@x.netlify.app", "https://storefront.vercel.app", "not a url", null]) {
      expect(netlifyAppUrl(bad)).toBeNull();
    }
    expect(launchAddress("netlify", "https://storefront.vercel.app")).toBeNull();
    expect(launchAddress("vercel", "https://storefront.netlify.app")).toBeNull();
    expect(launchAddress("vercel", "https://storefront.vercel.app")).toBe("https://storefront.vercel.app");
  });

  it("link only to the provider's own dashboard", () => {
    expect(inspectorAddress("netlify", "https://app.netlify.com/sites/storefront/deploys/abc")).toBe("https://app.netlify.com/sites/storefront/deploys/abc");
    expect(inspectorAddress("netlify", "https://app.netlify.com.evil.example/x")).toBeNull();
    expect(inspectorAddress("netlify", "https://vercel.com/suvin/storefront")).toBeNull();
    expect(inspectorAddress("vercel", "https://vercel.com/suvin/storefront/dpl_1")).toBe("https://vercel.com/suvin/storefront/dpl_1");
    expect(inspectorAddress("vercel", "http://vercel.com/x")).toBeNull();
  });
});
