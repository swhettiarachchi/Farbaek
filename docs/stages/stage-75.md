# Stage 75: installing Farbaek Agent without a security warning

The owner hit Windows SmartScreen's "Windows protected your PC" when downloading the agent, and asked that users never see it. Also: the cat knight becomes the app icon and favicon, and only those.

- **Decision record:** `docs/adr/0098-warning-free-installs.md`.
- **Branch:** `feat/warning-free-installs`, from `main` after #89. It carries Stage 74's Mac build, now signed and notarized instead of ad-hoc.

## 2026-10-27

### Done

**Icons.** `public/brand/farbaek-app-icon.webp` (the owner's cat knight) is the source for every app icon and favicon only:
- the browser tab icons and the 512 px icon;
- the Apple touch icon;
- the installed web app's icons (maskable padded with the art's own white);
- the desktop app's icon;
- the Microsoft Store tiles.

The full knight logo is unchanged and stays the logo everywhere else. `CLAUDE.md` records the rule.

**Windows, Microsoft Store.**
- `pnpm agent:store` (`desktop/store.mjs`): an unsigned `.appx` with the Partner Center identity from `desktop/store-identity.json`. It refuses with words while the identity isn't set.
- An `appx` section in `desktop/electron-builder.yml`, with build resources at `desktop/build`.
- A Store install keeps its data in `%USERPROFILE%\.farbaek-agent` (`desktop/src/main/data-dir.ts`, tested), so commands a run starts see its working copy.
- `docs/agent/store-listing.md`: the listing, ready to paste, with the certification notes.

**Mac, signed and notarized.**
- `agent-mac.yml` checks for the five signing secrets on Linux first.
- It builds and signs with the Developer ID and the hardened runtime, and notarizes with the App Store Connect key. The DMG is signed too.
- It requires `spctl` to report "Notarized Developer ID" and a valid stapled ticket before keeping the DMG.
- `scripts/release/mac-signing.ps1` sets up signing on Windows without showing a secret.

**Agents page.** `AGENT_STORE_URL` and `AGENT_MAC` in `src/config/agent-download.ts`, both null until published.
- **The Store:** once set, "Get it from the Microsoft Store" is first and the direct installer second, with its SmartScreen steps folded away.
- **Mac:** once set, "Download for Mac" with its fingerprint and the `shasum` check. Until then, a line that it's on its way.

**Minutes.** Uptime checks hourly.

**Docs.**
- ADR 0098.
- The agent README: installing without a warning, Mac signing, the Microsoft Store, and publishing a release.
- `docs/deploy/vps.md`.
- Current state.

### Verified

- `pnpm typecheck` and `pnpm lint`: clean. The config, data-folder and design tests pass, and so does the full suite (see the PR).
- `node desktop/store.mjs` without the identity refuses, naming the three values and where they are in Partner Center.
- The PowerShell script parses with Windows PowerShell's parser. It hasn't been run: it's for the owner, with their certificate.
- `scripts/brand-assets.mjs` regenerates the existing icons from the new source; `farbaek-logo.png` was byte-identical.

### Not verified yet

- **The Mac build itself:** GitHub Actions is paused for the month (free minutes used up by another repository's workflow, now disabled) until November 1, and the signing secrets aren't set.
- **The Store package:** needs the Partner Center identity. Installing it here needs Developer Mode; the real check is a private-audience Store install.
- **The two new download-card states** (Store and Mac): they show once their values are set, and get their own visual check then.

### Next (the owner)

1. Accept Apple's updated Program License Agreement (due October 29).
2. Mac signing: the two script steps and the API key (agent README, "Mac signing, once").
3. Register in Partner Center, reserve "Farbaek Agent", and send the three identity values.
4. Free 5 to 10 GB on C:.
