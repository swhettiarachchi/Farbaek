import { describe, expect, it } from "vitest";
import { VERCEL_NAME, deployDigest, publicAddress, statusFromReadyState, vercelAppUrl, vercelFit, vercelProjectName, vercelSettings } from "./vercel";

describe("LaunchOS with Vercel", () => {
  it("names the Vercel project from the Farbaek one", () => {
    expect(vercelProjectName("Harbour Lane Studio")).toBe("harbour-lane-studio");
    expect(vercelProjectName("Café  Menu!!")).toBe("cafe-menu");
    expect(vercelProjectName("!!!")).toBe("farbaek-site");
    expect(vercelProjectName("a".repeat(150))).toHaveLength(100);
    for (const n of ["harbour-lane-studio", "cafe-menu", "farbaek-site"]) expect(n).toMatch(VERCEL_NAME);
    for (const bad of ["-x", "x-", "Upper", "a_b", ""]) expect(bad).not.toMatch(VERCEL_NAME);
  });

  it("passes on only build settings found in the project", () => {
    expect(vercelSettings({ kind: "nextjs", build: { command: "next build", source: "found" }, output: { command: ".next", source: "assumed" } })).toEqual({
      framework: "nextjs",
      buildCommand: "next build",
      outputDirectory: null,
    });
    expect(vercelSettings({ kind: "static", build: null, output: null })).toEqual({ framework: null, buildCommand: null, outputDirectory: null });
  });

  it("says which projects suit Vercel", () => {
    expect(vercelFit({ kind: "nextjs" })).toBeNull();
    expect(vercelFit({ kind: "static" })).toBeNull();
    expect(vercelFit({ kind: "node_server" })).toMatch(/long-running/);
    expect(vercelFit({ kind: "python" })).toMatch(/Python/);
  });

  it("digests exactly the files sent, in any order", async () => {
    const a = { path: "index.html", sha256: "a".repeat(64) };
    const b = { path: "about.html", sha256: "b".repeat(64) };
    expect(await deployDigest([a, b])).toBe(await deployDigest([b, a]));
    expect(await deployDigest([a, b])).not.toBe(await deployDigest([a, { ...b, sha256: "c".repeat(64) }]));
    expect(await deployDigest([a])).toMatch(/^[0-9a-f]{64}$/);
  });

  it("reads Vercel's deployment states", () => {
    for (const s of ["QUEUED", "INITIALIZING", "BUILDING"]) expect(statusFromReadyState(s)).toBe("building");
    expect(statusFromReadyState("READY")).toBe("ready");
    for (const s of ["ERROR", "CANCELED", "BLOCKED"]) expect(statusFromReadyState(s)).toBe("failed");
  });

  it("prefers the public production alias to the deployment's own address", () => {
    expect(publicAddress({ url: "storefront-abc123.vercel.app", aliases: ["storefront.vercel.app", "shop.example.com"] })).toBe("https://storefront.vercel.app");
    expect(publicAddress({ url: "storefront-abc123.vercel.app", aliases: [] })).toBe("https://storefront-abc123.vercel.app");
    expect(publicAddress({ url: null, aliases: ["evil.example"] })).toBeNull();
  });

  it("links and checks only https addresses on vercel.app", () => {
    expect(vercelAppUrl("my-site-abc123.vercel.app")).toBe("https://my-site-abc123.vercel.app");
    expect(vercelAppUrl("https://my-site.vercel.app/path")).toBe("https://my-site.vercel.app");
    for (const bad of [null, "", "http://x.vercel.app", "https://vercel.app.evil.example", "https://x.vercel.app:8443", "https://user@x.vercel.app", "https://evil.example"]) {
      expect(vercelAppUrl(bad), String(bad)).toBeNull();
    }
  });
});
