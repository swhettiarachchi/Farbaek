"use client";

import { useEffect, useSyncExternalStore } from "react";
import { ANDROID_APP_CLIENT, ANDROID_BUILD_KEY, IOS_APP_CLIENT, STORE_CLIENT_KEY, androidAppBuild, inAndroidApp, inStoreApp, isAndroidAppLaunch, isIosAppLaunch } from "@/core/billing/store-client";

function readStored(): string | null {
  try {
    return window.sessionStorage.getItem(STORE_CLIENT_KEY);
  } catch {
    return null;
  }
}

const subscribe = () => () => undefined;
const snapshot = () => inAndroidApp(readStored(), document.referrer, window.location.search);

/** Whether this tab is Farbaek for Android (ADR 0150). False on the server and in every ordinary browser tab. */
export function useInAndroidApp(): boolean {
  return useSyncExternalStore(subscribe, snapshot, () => false);
}

const storeSnapshot = () => inStoreApp(readStored(), document.referrer, window.location.search);

/** Whether this tab is inside either store's app, where nothing is bought from the web (ADR 0177). */
export function useInStoreApp(): boolean {
  return useSyncExternalStore(subscribe, storeSnapshot, () => false);
}

function readBuild(): string | null {
  try {
    return window.sessionStorage.getItem(ANDROID_BUILD_KEY);
  } catch {
    return null;
  }
}
const buildSnapshot = () => (inAndroidApp(readStored(), document.referrer, window.location.search) ? androidAppBuild(readBuild(), window.location.search) : null);

/** Which build of Farbaek for Android this tab is in; null in a browser, or in a build too old to say (ADR 0193). */
export function useAndroidAppBuild(): number | null {
  return useSyncExternalStore(subscribe, buildSnapshot, () => null);
}

/**
 * In the root layout: when Farbaek for Android opens a page, the tab remembers
 * it, so later pages (whose referrer is Farbaek itself) still know.
 */
export function AndroidAppMarker() {
  useEffect(() => {
    const client = isAndroidAppLaunch(document.referrer, window.location.search) ? ANDROID_APP_CLIENT : isIosAppLaunch(window.location.search) ? IOS_APP_CLIENT : null;
    if (!client) return;
    try {
      window.sessionStorage.setItem(STORE_CLIENT_KEY, client);
      // Which Android build, so later pages offer only what it has (ADR 0193).
      const build = androidAppBuild(null, window.location.search);
      if (client === ANDROID_APP_CLIENT && build !== null) window.sessionStorage.setItem(ANDROID_BUILD_KEY, String(build));
    } catch {
      // Storage is off: each page still knows from its own referrer or address.
    }
  }, []);
  return null;
}

/**
 * A way to buy a plan or usage. Inside Farbaek for Android it's replaced by
 * the fallback, which says plainly that it can't be bought there and points
 * nowhere else, as Google Play's Payments policy asks (ADR 0150).
 */
export function WebPurchaseOnly({ children, fallback }: { children: React.ReactNode; fallback: React.ReactNode }) {
  // Until hydration the hook can't know, so the wrapper is hidden by CSS from the first paint (ADR 0171).
  return useInStoreApp() ? fallback : (
    <span data-web-purchase className="contents">
      {children}
    </span>
  );
}

/** The fallback for a buy button: a plain sentence, like other unavailable plan actions. */
export function NotInAndroidApp({ children = "This can't be bought in the app." }: { children?: string }) {
  return <span className="block text-sm text-ink-3">{children}</span>;
}
