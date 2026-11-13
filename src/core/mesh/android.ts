/**
 * Mesh in Farbaek for Android (ADR 0193): the app's own Nearby screen sends
 * files to a computer on the same Wi-Fi with no internet, through the same
 * farbaek-mesh/1 protocol as the desktop app. The website opens that screen
 * with an intent link that names the app's package, so no other app can
 * answer it, and the screen takes no action from the link: nothing happens
 * until the person chooses.
 */
import { ANDROID_APP_PACKAGE } from "@/core/billing/store-client";

/** The first Android build with the Nearby screen. */
export const ANDROID_NEARBY_FROM_BUILD = 5;

/** The scheme only the Nearby screen answers, inside Farbaek's own package. */
export const NEARBY_SCHEME = "farbaek-mesh";

/** Farbaek for Android's Google Play page, where the app is installed or updated. */
export const ANDROID_PLAY_LISTING = `https://play.google.com/store/apps/details?id=${ANDROID_APP_PACKAGE}`;

/**
 * The link that opens the Nearby screen. Without an app that has it, the browser goes to the fallback: Farbaek's
 * Mesh page when the page knows the app is there, or Google Play when it can't tell, to install or update it.
 */
export function nearbyIntentLink(siteOrigin: string, options: { fallback?: "mesh" | "play" } = {}): string {
  const target = options.fallback === "play" ? ANDROID_PLAY_LISTING : `${new URL(siteOrigin).origin}/app/mesh`;
  return `intent://nearby#Intent;scheme=${NEARBY_SCHEME};package=${ANDROID_APP_PACKAGE};S.browser_fallback_url=${encodeURIComponent(target)};end`;
}

/**
 * Whether to offer Nearby, and how. "app": the app said its build, and it has Nearby. "play": an Android phone where
 * the build isn't known (opened from a link, or Android brought back an old tab) or is older: the same button, which
 * opens Nearby if the app has it, and Google Play otherwise. null: not an Android phone.
 */
export function nearbyOffer(build: number | null, userAgent: string): "app" | "play" | null {
  if (build !== null && build >= ANDROID_NEARBY_FROM_BUILD) return "app";
  return /\bAndroid\b/i.test(userAgent) ? "play" : null;
}
