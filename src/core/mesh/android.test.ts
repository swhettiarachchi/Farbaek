import { describe, expect, it } from "vitest";
import { ANDROID_BUILD_PARAM, androidAppBuild } from "@/core/billing/store-client";
import { ANDROID_NEARBY_FROM_BUILD, nearbyIntentLink, nearbyOffer } from "./android";

describe("Nearby in Farbaek for Android (ADR 0193)", () => {
  it("opens only Farbaek's own package, and falls back to the Mesh page on Farbaek", () => {
    expect(nearbyIntentLink("https://www.farbaek.com/anything?x=1")).toBe(
      "intent://nearby#Intent;scheme=farbaek-mesh;package=com.farbaek.app;S.browser_fallback_url=https%3A%2F%2Fwww.farbaek.com%2Fapp%2Fmesh;end",
    );
  });

  it("where the page can't tell the app is there, falls back to Farbaek's Google Play page instead", () => {
    expect(nearbyIntentLink("https://www.farbaek.com/app/mesh", { fallback: "play" })).toBe(
      "intent://nearby#Intent;scheme=farbaek-mesh;package=com.farbaek.app;S.browser_fallback_url=https%3A%2F%2Fplay.google.com%2Fstore%2Fapps%2Fdetails%3Fid%3Dcom.farbaek.app;end",
    );
  });

  it("offers Nearby in the app from build 5, and on any other Android phone with Google Play as the way in", () => {
    const android = "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36";
    const desktop = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
    const iphone = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
    expect(nearbyOffer(6, android)).toBe("app");
    expect(nearbyOffer(5, desktop)).toBe("app");
    // An older app, or a page opened from a link, where the build isn't known: Play installs or updates it.
    expect(nearbyOffer(4, android)).toBe("play");
    expect(nearbyOffer(null, android)).toBe("play");
    expect(nearbyOffer(null, desktop)).toBeNull();
    expect(nearbyOffer(null, iphone)).toBeNull();
    expect(nearbyOffer(null, "")).toBeNull();
  });

  it("knows the app's build from the launch address, or from earlier in the tab, and nothing else", () => {
    expect(androidAppBuild(null, `?client=android-app&${ANDROID_BUILD_PARAM}=5`)).toBe(5);
    expect(androidAppBuild("7", "")).toBe(7);
    expect(androidAppBuild("4", `?${ANDROID_BUILD_PARAM}=6`)).toBe(6);
    expect(androidAppBuild(null, "?client=android-app")).toBeNull();
    for (const bad of ["5;drop", "-1", "1e3", "", "99999999"]) expect(androidAppBuild(bad, `?${ANDROID_BUILD_PARAM}=${encodeURIComponent(bad)}`)).toBeNull();
    expect(ANDROID_NEARBY_FROM_BUILD).toBe(5);
  });
});
