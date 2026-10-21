import { describe, expect, it } from "vitest";
import { newNonce, OFFICE_STATIC_HEADERS, officeCsp, officeHostPattern, officeResponseHeaders } from "./office-headers";

describe("office headers", () => {
  it("lock scripts to the request's nonce and nothing else", () => {
    const csp = officeCsp("abc", false);
    expect(csp).toContain("script-src 'self' 'nonce-abc' 'strict-dynamic'");
    expect(csp).not.toContain("unsafe-eval");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("connect-src 'self';");
    expect(csp).toContain("upgrade-insecure-requests");
    expect(officeCsp("abc", true)).toContain("'unsafe-eval'");
    // A local office on plain http can't upgrade its own requests.
    expect(officeCsp("abc", false, false)).not.toContain("upgrade-insecure-requests");
    expect(newNonce()).not.toBe(newNonce());
  });

  it("never cache, never index, and keep the two header sets apart", () => {
    expect(officeResponseHeaders("x")).toEqual({ "Content-Security-Policy": "x", "Cross-Origin-Opener-Policy": "same-origin", "Cache-Control": "no-store, max-age=0" });
    const staticKeys = OFFICE_STATIC_HEADERS.map((h) => h.key.toLowerCase());
    for (const key of Object.keys(officeResponseHeaders("x"))) expect(staticKeys).not.toContain(key.toLowerCase());
    expect(OFFICE_STATIC_HEADERS.find((h) => h.key === "X-Robots-Tag")?.value).toContain("noindex");
    expect(officeHostPattern("officespace.farbaek.com")).toBe("officespace\\..*");
    expect(officeHostPattern(undefined)).toBe("officespace\\..*");
  });
});
