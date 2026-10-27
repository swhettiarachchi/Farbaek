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
  sha256CertFingerprints: [] as readonly string[],
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
