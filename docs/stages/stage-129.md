# Stage 129: The apps built on 1 November

GitHub Actions minutes reset on 1 November, so the iPhone, Mac, Linux and Android builds could run for the first time.

- **Branch:** `feat/linux-agent-live`, with `fix/mac-notarize` merged in.
- **Migration:** none.

## 2026-11-01

### Done

- **iPhone (run #12): the first compile ever.**
  - It built for the simulator and its unit tests passed (Xcode 26.3).
  - The sample tour passed, with screenshots at 1320 × 2868, the App Store's 6.9-inch size.
- **iPhone upload to App Store Connect (run #17).** Automatic signing couldn't archive: it wants a development profile, which needs a registered device, and the team has none. So `.github/workflows/ios.yml` now signs for the App Store itself, through `scripts/release/ios-asc-signing.mjs` and the owner's build key. Each run:
  - makes an Apple Distribution certificate from a key generated on the runner;
  - makes an App Store profile, which needs no device;
  - signs the archive and export manually from a keychain only the job uses;
  - switches the generated entitlements to production push;
  - uploads.

  The next run revokes the previous run's certificate and profile, so the team holds at most one. Build 17 is processed and "Ready to Submit".
- **Mac agent:**
  - The first run signed the app, then notarization refused the issuer: the stored secret starts with a space. `agent-mac.yml` now trims the key ID and issuer, and masks them.
  - Run #13 passed: Developer ID, notarized and stapled, accepted by Gatekeeper, a universal build, and still running 20 seconds after opening from the DMG.
  - `Farbaek-Agent-0.9.0-mac.dmg` (227,928,858 bytes, SHA-256 `f6401528…`) is on www.farbaek.com/downloads, checked on the server, and `AGENT_MAC` is set.
- **Linux agent (run #7):**
  - The AppImage stayed running under a virtual display.
  - `Farbaek-Agent-0.9.0-linux-x86_64.AppImage` (130,319,103 bytes, SHA-256 `df4e1194…`) is on www.farbaek.com/downloads, checked on the server, and `AGENT_LINUX` is set.
- **Android (run #3):** it skipped the bundle, because the upload key isn't set up yet (`docs/mobile/android.md`, step 1, the owner's).

### Verified

- Each build's own checks, as above.
- Both published files are served (HTTP 200, exact sizes).
- `src/config/agent-download.test.ts` and the Agents page tests, and `pnpm typecheck`.

### Not verified

- **The iPhone build on a real phone:** TestFlight testers come after the App Store listing.
- **Sign in with Apple and push on a device.**

### Next

- **App Store 1.0:** screenshots, texts and build 17. App Privacy, the age rating and content rights are the owner's, because auto mode refuses those declarations.
- **Android:** the owner's upload key, then the Play listing under the existing developer account.
