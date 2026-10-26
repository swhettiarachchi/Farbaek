import { describe, expect, it } from "vitest";
import { SECURITY_TXT_EXPIRES, securityTxt } from "./security-txt";

describe("security.txt", () => {
  it("has the fields RFC 9116 requires, and a real contact", () => {
    const txt = securityTxt();
    expect(txt).toMatch(/^Contact: mailto:support@farbaek\.com$/m);
    expect(txt).toMatch(/^Expires: \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/m);
    expect(txt).toMatch(/^Canonical: https:\/\/www\.farbaek\.com\/\.well-known\/security\.txt$/m);
    expect(txt.endsWith("\n")).toBe(true);
  });

  it("is renewed before it expires, and never set more than a year ahead", () => {
    const left = Date.parse(SECURITY_TXT_EXPIRES) - Date.now();
    // Fails 30 days before the date: move it forward by up to a year.
    expect(left, "Renew SECURITY_TXT_EXPIRES in src/server/security/security-txt.ts").toBeGreaterThan(30 * 86_400_000);
    expect(left).toBeLessThanOrEqual(366 * 86_400_000);
  });
});
