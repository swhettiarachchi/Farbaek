import { describe, expect, it } from "vitest";
import { ANDROID_APP_CLIENT, inAndroidApp, isAndroidAppLaunch } from "./store-client";

describe("Farbaek for Android's pages (ADR 0150)", () => {
  it("knows the app by its referrer, with or without a path", () => {
    expect(isAndroidAppLaunch("android-app://com.farbaek.app", "")).toBe(true);
    expect(isAndroidAppLaunch("android-app://com.farbaek.app/", "")).toBe(true);
  });

  it("knows the app by its launch address", () => {
    expect(isAndroidAppLaunch("", "?client=android-app")).toBe(true);
    expect(isAndroidAppLaunch("https://www.farbaek.com/", "?next=%2Fapp&client=android-app")).toBe(true);
  });

  it("isn't fooled by another app, a lookalike package or another client", () => {
    expect(isAndroidAppLaunch("android-app://com.farbaek.app.evil/", "")).toBe(false);
    expect(isAndroidAppLaunch("android-app://com.other.app/", "")).toBe(false);
    expect(isAndroidAppLaunch("https://www.farbaek.com/app", "?client=ios")).toBe(false);
    expect(isAndroidAppLaunch("", "")).toBe(false);
  });

  it("remembers the app for the rest of the tab, and leaves ordinary Chrome tabs alone", () => {
    expect(inAndroidApp(ANDROID_APP_CLIENT, "https://www.farbaek.com/app", "")).toBe(true);
    expect(inAndroidApp(null, "https://www.farbaek.com/app", "")).toBe(false);
    expect(inAndroidApp("something-else", "https://www.google.com/", "")).toBe(false);
  });
});
