import { describe, expect, it } from "vitest";
import { APPLE_PURCHASES_FROM_BUILD, iosAppBuild } from "@/core/billing/store-client";
import { appleIapOn, buildSellsPlans } from "./apple/wiring";
import { googlePlayOn, googlePlayReady } from "./google/wiring";

describe("buying in the store apps opens by itself (ADR 0186)", () => {
  it("reads the iPhone app's build from the User-Agent iOS gives it", () => {
    expect(iosAppBuild("Farbaek/40 CFNetwork/1568.100.1 Darwin/24.0.0")).toBe(40);
    expect(iosAppBuild("Farbaek/22 CFNetwork/1568.100.1 Darwin/24.0.0")).toBe(22);
    expect(iosAppBuild("Farbaek/41.2 CFNetwork/1568.100.1 Darwin/24.0.0")).toBe(41);
    for (const ua of [null, "", "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)", "Other/40 CFNetwork/1 Darwin/1", "Farbaek/x CFNetwork/1"]) {
      expect(iosAppBuild(ua), String(ua)).toBeNull();
    }
  });

  it("prefers the build the app states itself, from builds after 40", () => {
    expect(iosAppBuild("Something else", "1.1.0+41")).toBe(41);
    expect(iosAppBuild("Farbaek/40 CFNetwork/1568.100.1 Darwin/24.0.0", "1.2+57")).toBe(57);
    // A header that isn't the app's own shape falls back to the User-Agent.
    expect(iosAppBuild("Farbaek/40 CFNetwork/1568.100.1 Darwin/24.0.0", "lots")).toBe(40);
    expect(iosAppBuild(null, "1.1.0+")).toBeNull();
  });

  it("sells App Store plans from the build Apple reviewed them with, never on 1.0.0, and stops with APPLE_IAP=off", () => {
    expect(APPLE_PURCHASES_FROM_BUILD).toBe(40);
    expect(appleIapOn({})).toBe(true);
    expect([buildSellsPlans(40, {}), buildSellsPlans(57, {}), buildSellsPlans(22, {}), buildSellsPlans(null, {})]).toEqual([true, true, false, false]);
    expect(buildSellsPlans(40, { APPLE_IAP: "off" })).toBe(false);
    expect(appleIapOn({ APPLE_IAP: "on" })).toBe(true);
  });

  it("sells Google Play plans once the service account is saved, and stops with GOOGLE_PLAY_BILLING=off", () => {
    expect(googlePlayOn({})).toBe(true);
    expect(googlePlayOn({ GOOGLE_PLAY_BILLING: "off" })).toBe(false);
    // Without the key nothing opens: purchases couldn't be checked.
    expect(googlePlayReady({})).toBe(false);
  });
});
