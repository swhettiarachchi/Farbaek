# ADR 0099: Farbaek for Android, a Trusted Web Activity on Google Play

- Status: accepted (2026-10-27).
- Spec §17 (mobile); the "Native mobile apps" row in current state.
- Builds on ADR 0079 (the installable web app) and ADR 0098 (signing kept out of Claude's hands).

## Context

Native mobile apps were "Not started" because of store fees. The owner now has a Google Play Console account (personal), an Apple Developer membership and a Microsoft Partner Center account. Farbaek is already an installable web app: manifest, service worker, push notifications and offline page. A separate native codebase would fork every feature and need its own design system, so it's not worth it.

## Decision

**Android: a Trusted Web Activity** (`android/`).
- **What it is:** Google's own wrapper for a web app on Play. The app is androidbrowserhelper's `LauncherActivity`, which opens https://www.farbaek.com/app in the phone's Chrome, full screen, with the status and navigation bars in the canvas colour.
- **No address bar:** Chrome hides it only when the site names the app's signing certificate in `/.well-known/assetlinks.json` (`src/config/android-app.ts`). Until a fingerprint is set, the site serves `[]` and claims no app.
- **Links:** App Links with `autoVerify` for `/app` and `/auth`, so the sign-in links Farbaek emails open in the app.
- **Notifications:** `DelegationService` hands Farbaek's web notifications to the app (`POST_NOTIFICATIONS` on Android 13 and up).
- **Icons:** the launcher icons come from the app icon only (`scripts/brand-assets.mjs`).
- **Versions:** Android Gradle Plugin 9.4.1, androidbrowserhelper 2.7.4 and Gradle 9.8.1, all at least 20 days old when chosen. compileSdk and targetSdk are 36, minSdk 24.

**Built on GitHub's Linux runner** (`.github/workflows/android.yml`). This PC has no Java and little disk, and Linux minutes count once.
- A quick job checks the two secrets first.
- The run signs the bundle with the owner's upload key, checks it with `jarsigner -verify` and checks the package name.
- It keeps the bundle, its SHA-256 and the certificate's fingerprint.

**The upload key** is made by `scripts/release/android-signing.ps1` with Git's OpenSSL.
- **What it is:** RSA 2048, a certificate valid 30 years, in a PKCS#12 keystore in `%USERPROFILE%\FarbaekAndroidSigning`.
- **Secrets:** they go to GitHub through the clipboard, a name and then a value at a time.
- **Play App Signing** holds the key that signs what people install; the upload key only proves uploads come from Farbaek.

**iOS isn't part of this decision.** Apple's guideline 4.2 rejects apps that only wrap a website, and building needs Xcode on a Mac. Farbaek installs on iPhones from Safari (Add to Home Screen) today.

## Consequences

- **One codebase:** every web feature is in the Android app the day it ships, with no app update.
- **The owner's steps** (`docs/mobile/android.md`):
  - create the app in Play Console;
  - run a closed test, which Google requires for new personal accounts: at least 12 testers for 14 days;
  - upload the bundle;
  - copy Play's app-signing fingerprint into `src/config/android-app.ts`.
- **Not verified yet:** the first compile is the first CI run, after the free Actions minutes reset on November 1 and the secrets are set. It hasn't run on a phone yet either.
