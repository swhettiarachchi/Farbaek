import { describe, expect, it } from "vitest";
import { ANDROID_APP_CLIENT, ANDROID_APP_MARK, STORE_CLIENT_KEY, earlyMarkScript, inAndroidApp, inStoreApp, isAndroidAppLaunch } from "./store-client";

/** Runs the inline script against a stand-in page, and returns the mark it left on <html>, if any. */
function markFrom(stored: string | null, referrer: string, search: string, storage: "ok" | "refused" = "ok"): string | null {
  let mark: string | null = null;
  const run = new Function("document", "sessionStorage", "location", "URLSearchParams", earlyMarkScript());
  run(
    { referrer, documentElement: { setAttribute: (name: string, value: string) => (mark = name === ANDROID_APP_MARK ? value : mark) } },
    {
      getItem(key: string) {
        if (storage === "refused") throw new Error("SecurityError");
        return key === STORE_CLIENT_KEY ? stored : null;
      },
    },
    { search },
    URLSearchParams,
  );
  return mark;
}

describe("the iPhone app's in-app browser (ADR 0177)", () => {
  it("is marked from the first paint, and remembered for later pages", () => {
    expect(markFrom(null, "", "?client=ios-app")).toBe("ios-app");
    expect(markFrom("ios-app", "https://www.farbaek.com/app", "")).toBe("ios-app");
    expect(markFrom(null, "", "")).toBeNull();
  });

  it("counts as inside a store's app, without being mistaken for Android", () => {
    expect(inStoreApp("ios-app", "", "")).toBe(true);
    expect(inStoreApp(null, "", "?client=ios-app")).toBe(true);
    expect(inStoreApp(null, "", "")).toBe(false);
    expect(inAndroidApp("ios-app", "", "?client=ios-app")).toBe(false);
  });
});

describe("the mark set before the page paints (ADR 0171)", () => {
  it("answers exactly as inAndroidApp does", () => {
    const stored = [null, ANDROID_APP_CLIENT, "web"];
    const referrers = ["", "https://www.farbaek.com/", "android-app://com.farbaek.app", "android-app://com.farbaek.app/", "android-app://com.farbaek.app.evil/", "android-app://com.other/"];
    const searches = ["", "?client=android-app", "?next=%2Fapp&client=android-app", "?client=web", "?clients=android-app"];
    for (const s of stored) {
      for (const r of referrers) {
        for (const q of searches) {
          expect(markFrom(s, r, q) === ANDROID_APP_CLIENT, `${s} ${r} ${q}`).toBe(inAndroidApp(s, r, q));
        }
      }
    }
  });

  it("still works when the browser refuses storage, and marks nothing in an ordinary tab", () => {
    expect(markFrom(null, "android-app://com.farbaek.app", "", "refused")).toBe(ANDROID_APP_CLIENT);
    expect(markFrom(null, "", "", "refused")).toBeNull();
    expect(markFrom(null, "https://www.google.com/", "")).toBeNull();
  });

  it("is a fixed string, with nothing from the page in it", () => {
    expect(earlyMarkScript()).toBe(earlyMarkScript());
    expect(earlyMarkScript()).not.toMatch(/innerHTML|eval\(|<\/script/i);
  });
});

describe("the iPhone app's in-app browser (ADR 0177)", () => {
  it("is marked from the first paint, and remembered for later pages", () => {
    expect(markFrom(null, "", "?client=ios-app")).toBe("ios-app");
    expect(markFrom("ios-app", "https://www.farbaek.com/app", "")).toBe("ios-app");
    expect(markFrom(null, "", "")).toBeNull();
  });

  it("counts as inside a store's app, without being mistaken for Android", () => {
    expect(inStoreApp("ios-app", "", "")).toBe(true);
    expect(inStoreApp(null, "", "?client=ios-app")).toBe(true);
    expect(inStoreApp(null, "", "")).toBe(false);
    expect(inAndroidApp("ios-app", "", "?client=ios-app")).toBe(false);
  });
});

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
