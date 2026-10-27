# ADR 0098: Installing Farbaek Agent without a security warning

- Status: accepted (2026-10-27).
- Supersedes ADR 0077's notes that the agent is Windows only and unsigned. Downloads from Farbaek's own server stay as they were.
- No migration.

## Context

The owner downloaded Farbaek Agent and stopped at Windows SmartScreen's "Windows protected your PC". Their words: "We need to make sure our users don't get this kind of error when they download Farbaek, because users need to feel safe on the Farbaek platform."

The constraints:
- **No budget for a code-signing certificate.** Even a signed `.exe` gets warned until its reputation builds; EV certificates no longer skip that.
- **The Microsoft Store is free.** It has been free for individual developers since September 2025, and Microsoft signs MSIX packages when it publishes them.
- **The owner has an Apple Developer Program membership** (individual, team 65BULQ4657), so a Mac app can be signed with a Developer ID and notarized by Apple.

## Decision

**Windows: the Microsoft Store first.** `pnpm agent:store` (`desktop/store.mjs`) builds an unsigned `.appx` with the identity Partner Center reserved. The identity is three public values in `desktop/store-identity.json`; the build refuses with words until they're set.
- **Capabilities:** `runFullTrust`, `internetClient`, and `privateNetworkClientServer` for Nearby.
- **Tiles:** made from the app icon by `scripts/brand-assets.mjs` into `desktop/build/appx`.

**Where a Store install keeps its data.** Inside an MSIX package, Windows redirects the app's writes under AppData to a private copy. A run's working copy lives in the data folder, and the git, pnpm and node it starts could miss a redirected one. So a Store install (`process.windowsStore`) keeps its data in `%USERPROFILE%\.farbaek-agent`, which isn't redirected (`desktop/src/main/data-dir.ts`). The direct installer is unchanged.

**The direct installer stays** as the other way: some computers can't use the Store. Its SmartScreen steps (PR #89) fold away under it once the Store listing is up.

**Mac: signed with the Developer ID and notarized by Apple.** `.github/workflows/agent-mac.yml` builds one DMG for Apple silicon and Intel on GitHub's macOS runner.
- **Signing:** electron-builder signs the app with the hardened runtime, using the certificate in the `MAC_CERT_P12_BASE64` and `MAC_CERT_PASSWORD` secrets.
- **Notarization:** with the App Store Connect API key (`APPLE_API_KEY_P8`, `APPLE_API_KEY_ID`, `APPLE_API_ISSUER`), and the app stapled.
- **Before keeping the DMG,** the run checks:
  - `spctl` reports "Notarized Developer ID";
  - the ticket is stapled;
  - both architectures are present;
  - the app stays running after opening.
- **Cost:** a quick Linux job checks the secrets first, so no macOS minutes are spent until signing is set up.
- **Setup:** `scripts/release/mac-signing.ps1` does it on Windows. It makes the key and certificate request in `%USERPROFILE%\FarbaekMacSigning`, checks the certificate Apple returns belongs to that key, makes the `.p12`, and copies each secret to the clipboard in turn for GitHub. Nothing secret is shown or committed.

**The Agents page** offers what's published:
- "Get it from the Microsoft Store" once `AGENT_STORE_URL` is set;
- "Download for Mac", notarized, once `AGENT_MAC` is set;
- until then, honest words that the Mac version is on its way.

**Free Actions minutes.** Mac builds run only when the agent's version changes, and the uptime check moves to hourly.

## Consequences

- Once the Store listing is public, Windows users install with no warning and get updates automatically. Once a notarized Mac build is published, Mac users open it with no warning either.
- **The owner does the steps that need their identity:**
  - register in Partner Center (ID and selfie) and reserve the name;
  - make the certificate and API key;
  - add the GitHub secrets;
  - accept Apple's updated agreements when asked.
- A Store install's data folder differs from a direct install's, so moving between them starts fresh: pair again.
- **Not checked here:** installing the MSIX on this PC, which needs Developer Mode or a trusted test certificate. The check is a private-audience Store install, then pairing and one Review Only run.
- **macOS minutes count ten times.** A signed build, including Apple's notarization wait, uses a noticeable share of the free minutes, so releases are batched.
