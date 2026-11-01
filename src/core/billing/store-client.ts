/**
 * Farbaek for Android is the website in a Trusted Web Activity (ADR 0099).
 * Google Play's Payments policy lets an app sell digital plans only through
 * Google Play's billing, and an app may not point people to another way to
 * pay. So inside the Android app the website sells nothing: plans and usage
 * top-ups are bought outside it, and the app says plainly that they can't be
 * bought there (ADR 0150).
 *
 * Chrome opens the app's pages with the app as the referrer
 * (android-app://com.farbaek.app), and the app's launch address carries
 * ?client=android-app. The tab remembers it in sessionStorage, which a TWA
 * doesn't share with the person's other Chrome tabs (cookies it would share,
 * which is why this isn't a cookie).
 *
 * This hides buttons to follow a store's rules. It isn't a security boundary:
 * nothing is charged without the person completing a checkout.
 */

export const ANDROID_APP_PACKAGE = "com.farbaek.app";

/** The query the app's launch address carries (android/app/src/main/AndroidManifest.xml). */
export const ANDROID_APP_CLIENT = "android-app";

/** Where the tab remembers it, for later pages whose referrer is Farbaek itself. */
export const STORE_CLIENT_KEY = "farbaek-client";

/** Whether this page was opened by Farbaek for Android: its referrer or its launch address says so. */
export function isAndroidAppLaunch(referrer: string, search: string): boolean {
  if (referrer === `android-app://${ANDROID_APP_PACKAGE}` || referrer.startsWith(`android-app://${ANDROID_APP_PACKAGE}/`)) return true;
  return new URLSearchParams(search).get("client") === ANDROID_APP_CLIENT;
}

/** Whether this tab is Farbaek for Android: remembered earlier, or opened by it now. */
export function inAndroidApp(stored: string | null, referrer: string, search: string): boolean {
  return stored === ANDROID_APP_CLIENT || isAndroidAppLaunch(referrer, search);
}
