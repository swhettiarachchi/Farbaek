import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * The page a new device waits on (ADR 0069) must not call getStaff(): it ends
 * any sign-in that has no office session yet, and a device waiting for
 * approval has none, so the phone was sent back to the sign-in page.
 */
describe("the device approval page", () => {
  it("checks the device without ending the sign-in", () => {
    const source = readFileSync(new URL("../../src/app/office/(auth)/device/page.tsx", import.meta.url), "utf8");
    // The code only: the page's own comment explains why getStaff() isn't used.
    const page = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    expect(page).not.toMatch(/\bgetStaff\s*\(/);
    expect(page).not.toMatch(/\brequireStaff\s*\(/);
    expect(page).toContain("checkDevice(");
  });
});
