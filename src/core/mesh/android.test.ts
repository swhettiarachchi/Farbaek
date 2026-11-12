import { describe, expect, it } from "vitest";
import { ANDROID_BUILD_PARAM, androidAppBuild } from "@/core/billing/store-client";
import { ANDROID_NEARBY_FROM_BUILD, nearbyIntentLink } from "./android";

describe("Nearby in Farbaek for Android (ADR 0193)", () => {
  it("opens only Farbaek's own package, and falls back to the Mesh page on Farbaek", () => {
    expect(nearbyIntentLink("https://www.farbaek.com/anything?x=1")).toBe(
      "intent://nearby#Intent;scheme=farbaek-mesh;package=com.farbaek.app;S.browser_fallback_url=https%3A%2F%2Fwww.farbaek.com%2Fapp%2Fmesh;end",
    );
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
