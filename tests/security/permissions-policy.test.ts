/**
 * Where the microphone is allowed (stage 195, ADR 0210): Survey Studio's pages on Farbaek's own host, for the drafting assistant, and
 * nowhere else: not the rest of the app, not people's published sites, not previews.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

type Rule = { source: string; has?: { type: string; value: string }[]; missing?: { type: string; value: string }[]; headers: { key: string; value: string }[] };

async function rules(siteUrl: string | undefined): Promise<Rule[]> {
  vi.resetModules();
  if (siteUrl === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
  else process.env.NEXT_PUBLIC_SITE_URL = siteUrl;
  const config = (await import("../../next.config")).default;
  return (await config.headers!()) as Rule[];
}

const policy = (r: Rule) => r.headers.find((h) => h.key === "Permissions-Policy")?.value;
const original = process.env.NEXT_PUBLIC_SITE_URL;
afterEach(() => {
  if (original === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
  else process.env.NEXT_PUBLIC_SITE_URL = original;
});

describe("the microphone", () => {
  it("is allowed only on Survey Studio's pages on Farbaek's own host", async () => {
    const all = await rules("https://www.farbaek.com");
    const allowing = all.filter((r) => policy(r)?.includes("microphone=(self)"));
    expect(allowing).toHaveLength(1);
    expect(allowing[0]).toMatchObject({ source: "/app/survey/:path*", has: [{ type: "host", value: "www\\.farbaek\\.com" }] });
    // The rule repeats the whole header, so payment on Farbaek's own pages stays as it was.
    expect(policy(allowing[0]!)).toBe("camera=(), microphone=(self), geolocation=(), payment=(self)");
    for (const r of all.filter((x) => x !== allowing[0] && policy(x))) expect(policy(r)).toContain("microphone=()");
  });

  it("stays off everywhere without the site's address at build time", async () => {
    const all = await rules(undefined);
    expect(all.some((r) => policy(r)?.includes("microphone=(self)"))).toBe(false);
  });
});
