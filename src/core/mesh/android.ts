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

/** The link that opens the Nearby screen; without the app, the browser stays on Farbaek's Mesh page. */
export function nearbyIntentLink(siteOrigin: string): string {
  const fallback = encodeURIComponent(`${new URL(siteOrigin).origin}/app/mesh`);
  return `intent://nearby#Intent;scheme=${NEARBY_SCHEME};package=${ANDROID_APP_PACKAGE};S.browser_fallback_url=${fallback};end`;
}
