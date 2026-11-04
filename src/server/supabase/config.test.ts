import { afterEach, describe, expect, it, vi } from "vitest";
import { readSupabaseConfig, safeNextPath, sessionCookieOptions, siteUrl } from "./config";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("readSupabaseConfig", () => {
  it("returns null when the project isn't configured", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "");
    expect(readSupabaseConfig()).toBeNull();
  });

  it("rejects non-https project URLs", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://evil.example");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_xxxxxxxxxxxxxxxxxxxx");
    expect(readSupabaseConfig()).toBeNull();
  });

  it("accepts a valid configuration", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://abc.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_xxxxxxxxxxxxxxxxxxxx");
    expect(readSupabaseConfig()).toEqual({ url: "https://abc.supabase.co", publishableKey: "sb_publishable_xxxxxxxxxxxxxxxxxxxx" });
  });
});

describe("safeNextPath", () => {
  it.each([
    [undefined, "/app"],
    ["/app/billing", "/app/billing"],
    ["https://evil.example", "/app"],
    ["//evil.example", "/app"],
    ["/\\evil.example", "/app"],
    ["app", "/app"],
    // Browsers drop tabs and newlines in a URL, so these would become //evil.example.
    ["/\t/evil.example", "/app"],
    ["/\n/evil.example", "/app"],
    ["/\r\n/evil.example", "/app"],
    ["/ /evil.example", "/app"],
    ["/app\\..\\..\\evil", "/app"],
    // Real paths keep their query and fragment.
    ["/app/new?template=blog#plan", "/app/new?template=blog#plan"],
    ["/app/projects/../billing", "/app/billing"],
  ])("maps %s to %s", (input, expected) => {
    expect(safeNextPath(input)).toBe(expected);
  });
});

describe("sessionCookieOptions", () => {
  it("keeps the session from page scripts, and secure wherever the site is https", () => {
    const saved = process.env.NEXT_PUBLIC_SITE_URL;
    try {
      process.env.NEXT_PUBLIC_SITE_URL = "https://www.farbaek.com";
      expect(sessionCookieOptions()).toEqual({ httpOnly: true, secure: true, sameSite: "lax", path: "/" });
      process.env.NEXT_PUBLIC_SITE_URL = "http://localhost:3000";
      expect(sessionCookieOptions().secure).toBe(false);
      expect(sessionCookieOptions().httpOnly).toBe(true);
    } finally {
      if (saved === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
      else process.env.NEXT_PUBLIC_SITE_URL = saved;
    }
  });
});

describe("siteUrl", () => {
  it("uses the configured origin without a trailing slash", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://farbaek.example/");
    expect(siteUrl()).toBe("https://farbaek.example");
  });

  it("refuses to guess in production", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
    vi.stubEnv("NODE_ENV", "production");
    expect(() => siteUrl()).toThrow();
  });
});
