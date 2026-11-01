/**
 * Farbaek for Android (ADR 0099): the Google Play app, a Trusted Web
 * Activity that opens www.farbaek.com/app full screen. The site names the
 * app's signing certificates in /.well-known/assetlinks.json so Chrome
 * trusts it (no address bar) and sign-in links open in it.
 *
 * Add a fingerprint only once it's real:
 * - the upload key's, printed by scripts/release/android-signing.ps1;
 * - Play's app-signing key's, from Play Console > the app > Test and release >
 *   App integrity > App signing.
 * Public values, never secrets. Until one is set, the site claims no app.
 */
export const ANDROID_APP = {
  packageName: "com.farbaek.app",
  sha256CertFingerprints: [
    // Play's app signing key: what people install from Google Play is signed with it
    // (Play Console > Test and release > App signing, 2026-11-01).
    "9E:7A:BB:51:A2:E5:3D:2A:20:5B:87:CD:83:00:46:E5:D1:44:81:E9:1E:73:52:2E:CF:CD:6F:94:92:6B:DB:D2",
    // The upload key (scripts/release/android-signing.ps1), from Android run #7 on 2026-11-01.
    "6A:BE:4A:F4:38:BD:2C:1E:FB:2F:F1:B6:D5:51:3C:66:60:22:96:29:60:48:28:96:97:11:5B:FF:4B:33:4A:31",
  ] as readonly string[],
};

/** The Digital Asset Links statements the site serves. */
export function assetLinks(app: { packageName: string; sha256CertFingerprints: readonly string[] } = ANDROID_APP) {
  if (app.sha256CertFingerprints.length === 0) return [];
  return [
    {
      relation: ["delegate_permission/common.handle_all_urls"],
      target: { namespace: "android_app", package_name: app.packageName, sha256_cert_fingerprints: [...app.sha256CertFingerprints] },
    },
  ];
}
