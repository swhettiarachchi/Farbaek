"use client";

import { useEffect, useSyncExternalStore } from "react";
import { ANDROID_APP_CLIENT, STORE_CLIENT_KEY, inAndroidApp, isAndroidAppLaunch } from "@/core/billing/store-client";

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

/**
 * In the root layout: when Farbaek for Android opens a page, the tab remembers
 * it, so later pages (whose referrer is Farbaek itself) still know.
 */
export function AndroidAppMarker() {
  useEffect(() => {
    if (!isAndroidAppLaunch(document.referrer, window.location.search)) return;
    try {
      window.sessionStorage.setItem(STORE_CLIENT_KEY, ANDROID_APP_CLIENT);
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
  return useInAndroidApp() ? fallback : children;
}

/** The fallback for a buy button: the same dashed pill as other unavailable plan actions. */
export function NotInAndroidApp({ children = "Can't be bought in the Android app" }: { children?: string }) {
  return <span className="block rounded-full border border-dashed border-line-strong/50 px-3 py-2 text-center text-xs text-ink-3">{children}</span>;
}
