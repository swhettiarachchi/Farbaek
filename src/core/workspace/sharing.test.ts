import { describe, expect, it } from "vitest";
import { isGuestAccess, isLinkLifetime, linkExpiry, shareContentVisible, sharePathVisible } from "./sharing";

describe("sharing rules", () => {
  it("accepts only the two kinds of guest access and three link lifetimes", () => {
    expect(isGuestAccess("view")).toBe(true);
    expect(isGuestAccess("edit")).toBe(true);
    expect(isGuestAccess("admin")).toBe(false);
    expect(isLinkLifetime("7")).toBe(true);
    expect(isLinkLifetime("open")).toBe(true);
    expect(isLinkLifetime("365")).toBe(false);
  });

  it("works out when a link ends", () => {
    const now = new Date("2026-11-11T00:00:00Z");
    expect(linkExpiry("7", now)?.toISOString()).toBe("2026-11-18T00:00:00.000Z");
    expect(linkExpiry("open", now)).toBeNull();
  });

  it("never shows credentials files or dependency folders through a link", () => {
    expect(sharePathVisible("index.html").visible).toBe(true);
    expect(sharePathVisible(".env").visible).toBe(false);
    expect(sharePathVisible("keys/server.pem").visible).toBe(false);
    expect(sharePathVisible("node_modules/x/index.js").visible).toBe(false);
  });

  it("hides text that looks like a key, and keeps ordinary text and images", () => {
    expect(shareContentVisible("app.js", "const a = 1;").visible).toBe(true);
    expect(shareContentVisible("app.js", "const k = 'sk_live_" + "a".repeat(24) + "';").visible).toBe(false);
    expect(shareContentVisible("logo.png", "iVBORw0KGgo=").visible).toBe(true);
  });
});
