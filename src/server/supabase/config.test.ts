import { afterEach, describe, expect, it, vi } from "vitest";
import { readSupabaseConfig, safeNextPath, siteUrl } from "./config";

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
  ])("maps %s to %s", (input, expected) => {
    expect(safeNextPath(input)).toBe(expected);
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
