/**
 * Farbaek for iPhone (ADR 0110): a native SwiftUI app in ios/, signed in
 * through the web and talking to /api/v1/app. Public values only.
 *
 * - bundleId: the app's identifier, registered in the owner's Apple
 *   Developer account (team 65BULQ4657, ADR 0098).
 * - appStoreUrl: set once the App Store listing is public; until then the
 *   site doesn't offer the app.
 *
 * Push notifications also need the owner's APNs key on the server:
 * APNS_KEY_P8 (the .p8 file's contents) and APNS_KEY_ID. Until both are set,
 * the app says notifications aren't set up yet, and everything else works.
 */
export const IOS_APP = {
  bundleId: "com.farbaek.app",
  teamId: "65BULQ4657",
  /** The app's Apple ID in App Store Connect; App Store notifications name it. */
  appleId: 6828344835,
  /** Set once the listing is public: https://apps.apple.com/app/id6828344835 */
  appStoreUrl: null as string | null,
};
