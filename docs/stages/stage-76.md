# Stage 76: Farbaek for Android

The last "Not started" row was native mobile apps, held back by store fees. The owner now has a Google Play Console account, so Farbaek goes to Play as a Trusted Web Activity, with the same app as www.farbaek.com.

- **Decision record:** `docs/adr/0099-android-trusted-web-activity.md`.
- **Branch:** `feat/android-twa`, on top of `feat/warning-free-installs` (#90), for its app-icon generator.

## 2026-10-27

### Done

**`android/`: a minimal Gradle project** (Kotlin DSL).
- **Versions:** Android Gradle Plugin 9.4.1, androidbrowserhelper 2.7.4, compileSdk and targetSdk 36, minSdk 24.
- **`AndroidManifest.xml`:**
  - `LauncherActivity` opening https://www.farbaek.com/app, with the canvas colour on both system bars;
  - `asset_statements` naming www.farbaek.com;
  - App Links (`autoVerify`) for `/app` and `/auth`, so emailed sign-in links open the app;
  - `DelegationService` for web notifications, with `POST_NOTIFICATIONS`;
  - `INTERNET`, and the Custom Tabs query.
- **Meta-data names** checked against androidbrowserhelper's `LauncherActivityMetadata` source.
- **Signing:** an upload signing config read from environment variables; without them the bundle is unsigned. The version comes from `android/version.properties`.
- **Launcher icons:** legacy and adaptive at five densities, made from the app icon by `scripts/brand-assets.mjs`. The foreground sits inside the 66dp safe zone, on the art's own white.

**The site.** `/.well-known/assetlinks.json` (`src/config/android-app.ts`) serves `[]` until a real signing-certificate fingerprint is set, then Google's statement for `com.farbaek.app`.

**CI.** `.github/workflows/android.yml`:
- a Linux job checks the two secrets first;
- then Temurin 21 and Gradle 9.8.1 run `bundleRelease`, signed with the upload key;
- `jarsigner -verify` and a package-name check;
- the artifact holds the AAB, its SHA-256 and the upload certificate's fingerprint.

Actions are pinned by commit: setup-java v6.0.1 and gradle/actions v6.4.0.

**`scripts/release/android-signing.ps1`:** the upload keystore with Git's OpenSSL, then the name-then-value clipboard flow from the Mac script.

**Docs.** ADR 0099, `docs/mobile/android.md` (the owner's Play Console steps) and current state.

### Verified

- `pnpm typecheck` and `pnpm lint`: clean. `src/config/android-app.test.ts` (3) passes.
- **The script's OpenSSL steps,** run on a throwaway key in the scratch folder:
  - the PKCS#12 keystore opens, AES-256 protected, which Java 21 reads;
  - the certificate is valid to 2056, as Play requires;
  - the fingerprint prints.
- The existing brand files regenerate byte-identical; only the new Android icons were added.

### Not verified yet

- **The Android build itself:** there's no Java on this PC, and GitHub Actions is paused until November 1. The first CI run is the first compile; a version that doesn't resolve would be fixed there.
- **A phone install and Play's review:** these follow the owner's steps in `docs/mobile/android.md`, including the 14-day closed test for personal accounts.
