import { describe, expect, it } from "vitest";
import { APP_CSP_PATH, appCsp, appCspHeaders, parseCspReports } from "./app-headers";

describe("the app's Content-Security-Policy (ADR 0107)", () => {
  it("allows scripts only from a nonce, talks only to Farbaek, and frames only previews", () => {
    const csp = appCsp("abc123", { dev: false, https: true, previewDomain: "farbaek.si" });
    expect(csp).toContain("script-src 'self' 'nonce-abc123' 'strict-dynamic'");
    expect(csp).not.toContain("unsafe-eval");
    expect(csp).toContain("connect-src 'self';");
    expect(csp).toContain("frame-src 'self' https://*.farbaek.si");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("report-uri /api/csp-report");
    expect(csp).toContain("upgrade-insecure-requests");
    const dev = appCsp("n", { dev: true, https: false, previewDomain: null });
    expect(dev).toContain("'unsafe-eval'");
    expect(dev).toContain("frame-src 'self';");
    expect(dev).not.toContain("upgrade-insecure-requests");
  });

  it("is report-only until enforcing is switched on", () => {
    expect(appCspHeaders("x", false)).toEqual({ "Content-Security-Policy-Report-Only": "x" });
    expect(appCspHeaders("x", true)).toEqual({ "Content-Security-Policy": "x" });
  });

  it("covers the app and the old admin console, not sign-in, which loads Turnstile", () => {
    expect(["/app", "/app/billing", "/admin/people"].every((p) => APP_CSP_PATH.test(p))).toBe(true);
    expect(["/sign-in", "/apps", "/pricing", "/"].some((p) => APP_CSP_PATH.test(p))).toBe(false);
  });

  it("reads both report formats, keeping only the directive, the blocked origin and the page's path", () => {
    const legacy = parseCspReports({
      "csp-report": { "document-uri": "https://www.farbaek.com/app/tasks/123?token=secret", "violated-directive": "script-src-elem", "effective-directive": "script-src-elem", "blocked-uri": "https://evil.example/x.js?k=v" },
    });
    expect(legacy).toEqual([{ directive: "script-src-elem", blocked: "https://evil.example", page: "/app/tasks/123", disposition: "report" }]);
    const modern = parseCspReports([
      { type: "csp-violation", body: { documentURL: "https://www.farbaek.com/app", effectiveDirective: "script-src-elem", blockedURL: "inline", disposition: "report" } },
      { type: "deprecation", body: {} },
    ]);
    expect(modern).toEqual([{ directive: "script-src-elem", blocked: "inline", page: "/app", disposition: "report" }]);
    // A preview of someone's site in a srcdoc frame reports no document address.
    expect(parseCspReports({ "csp-report": { "effective-directive": "script-src-elem", "blocked-uri": "inline" } })[0]?.page).toBe("(a preview frame)");
    expect(parseCspReports("nonsense")).toEqual([]);
    expect(parseCspReports(Array.from({ length: 50 }, () => modern.length && { type: "csp-violation", body: { effectiveDirective: "img-src" } }))).toHaveLength(20);
  });
});
