# Stage 130: The store listings, and nothing sold inside the Android app

- **Branch:** `feat/android-store-ready`, stacked on `feat/linux-agent-live` (stage 129).
- **Migration:** none.
- **ADRs:** 0150 and 0151.

## 2026-11-01

### Done

- **App Store 1.0.0, in App Store Connect:**
  - six screenshots in the "iPhone with Dynamic Island (medium display)" slot. They're the sample tour from build 17, scaled from 1320 × 2868 to 1206 × 2622, and each shows the "Sample data" labels;
  - build 17 attached to the version, and saved;
  - the price: free in all 175 countries or regions;
  - availability: all 175 countries or regions.

  Apple's "Add for Review" check now lists only the owner's steps:
  - App Privacy, which an Admin must publish;
  - a phone number for the review contact;
  - three screenshots still processing on Apple's side.

  Already done before this stage: the age rating (13+), content rights, the categories (Developer Tools, Productivity), the description, keywords and URLs.
- **Google Play:**
  - **Create app:** filled in under the Svanflok account: Farbaek, `com.farbaek.app` ("Package name available"), English (United States), App, Free. Auto mode refused ticking the two declarations. The owner ticked them, and Claude created the app (Play app id 4974194295109432147).
  - **Saved in Play Console:**
    - Store settings: Productivity, the support email and the website;
    - the default store listing: both descriptions, the icon, the feature graphic and six screenshots;
    - the privacy policy URL.

    The other App content declarations are the owner's.
  - **The listing:** written in `docs/mobile/play-listing.md`: the short and full descriptions, store settings, and the facts for App access, content rating, target audience and Data safety.
  - **Graphics** (in `desktop/release/store-android/`, not in the repository):
    - a 512 × 512 32-bit icon from the app icon;
    - a 1024 × 500 feature graphic: the logo unaltered, the tagline, tokens only;
    - six 1080 × 1920 phone screenshots of `/app` from a local demo build, each with the "Demo workspace. Sample data only." band.
- **Nothing sold inside the Android app (ADR 0150).** Google Play's Payments policy allows digital plans in an app only through Google Play's billing, and forbids pointing people to another checkout from inside the app. So:
  - `src/core/billing/store-client.ts` recognises the app by its referrer (`android-app://com.farbaek.app`) or its launch address (`?client=android-app`, now in `AndroidManifest.xml`);
  - `AndroidAppMarker`, in the root layout, has the tab remember it in `sessionStorage`. That isn't shared with the person's ordinary Chrome tabs, as a cookie would be;
  - `WebPurchaseOnly` replaces each buy control there:
    - the plan cards' Choose, Upgrade and Switch on Billing and Pricing;
    - the yearly options;
    - the usage top-up packs;
    - Keep a cancelled plan;
    - the payment-method portal;
    - a purchase step reached by its address.

    In their place is "Can't be bought in the Android app", and nothing says where else to buy.
  - **Unchanged:** cancelling, usage and the current plan.
- **A password for review accounts (ADR 0151).** Play's sign-in details page says its reviewers won't create accounts or use free trials, and they can't open an email link.
  - `/sign-in/password` signs in with an email address and a password.
  - Only accounts the owner makes with `scripts/vps/add-review-account.ps1` have one. Production's Auth is on the VPS, and the old cloud Supabase project is paused.
  - **The script was tested on this PC** with local bash and a stand-in for Auth's admin API: the request, its headers and a test password with quotes, `$`, a backslash, backticks and accented letters arrived exactly. It also refuses an address that already has an account, and an invalid one. Pressing Enter makes a 23-character password (groups of five), shown once and identical to what was sent; a typed one is never shown; one under 12 characters is refused.
  - The sign-in page links it with one line: "App review account? Sign in with a password".
  - **Guards:** the same as the email link (`src/server/auth/password-sign-in.ts`): Turnstile, limits by hash (5 per email in 15 minutes, 20 per network address an hour), fail closed, and one answer for any wrong combination.
- **Acceptable Use Policy (1 November 2026).** It now bans nudity, sexually explicit content and real-world graphic violence on published sites, because sites on farbaek.si are public and people from 13 use Farbaek.
  - Before, it banned only sexual content involving minors and content promoting violence.
  - This makes Play's IARC answers "No" to public sharing of nudity and graphic violence true.
  - Reports go through Help, "Report a site or abuse"; owners remove members; staff take sites offline.
  - The policy page now shows its own date. Terms and Privacy keep 30 October.
- **`/delete-account` (1 November 2026).** This is the page Play's Data safety links for deleting an account. It gives:
  - the steps (Settings, then Delete your account; or write to support from the account's address);
  - what's deleted and what's kept, and for how long;
  - what can be deleted without deleting the account.

  Each fact is taken from the Privacy Policy and what account deletion does. Projects can only be archived, not deleted, so the page says a whole project is deleted by writing to support.
  - It's checked at 375px in the dev server, and added to `qa:responsive` and `qa:a11y`.
  - Play's Content rating came out Everyone, PEGI 3, USK 0 and IARC 3+, each with "Users Interact".
- **Microsoft Store:** still "In certification" (submitted 2026-10-31). It publishes by itself when it passes.

### Verified

- `src/core/billing/store-client.test.ts`:
  - the referrer, with and without a path;
  - the launch address;
  - a lookalike package and another client aren't matched;
  - the tab's memory.
- `pnpm typecheck`, ESLint on the changed files, and `tests/design` (145 tests with the new file).
- `src/server/auth/password-sign-in.test.ts`:
  - addresses are lower-cased and passwords used as typed;
  - an invalid address or password is refused before anything is counted;
  - its own hashed limits, which fail closed;
  - Turnstile's token is passed on;
  - one answer for a wrong password, an unknown account and an account without one.
- **In production (2026-11-01):**
  - the owner ran `add-review-account.ps1` for `hello@farbaek.com`;
  - they signed in at www.farbaek.com/sign-in/password and reached the app's first screen ("What do you want to build?"), signed in as that address.

  The workspace is left uncreated, so the 14-day trial starts when a reviewer first uses it.
- `/sign-in/password` and the link on `/sign-in` in the dev server at 375px: 16px inputs, a 44px link, no sideways scroll. No password was submitted, because from this PC it would go to production Auth.
- **A demo build in the browser:**
  - `/pricing` offers Choose and Pay yearly;
  - `/pricing?client=android-app` shows the pill on every paid plan, with Start free kept;
  - after a reload in the same tab it still does;
  - a new tab is unaffected;
  - no console errors, and no sideways scroll at 375px.

### Not verified

- **The gate inside the real app:** the Android bundle hasn't been built yet, because it waits for the upload key.
- **The Billing page's gated buttons:** the demo workspace has payments not connected, so its plan cards show "Unavailable until payments open" before they reach the buy links. The same `WebPurchaseOnly` wraps them.

### Google Play, later on 2026-11-01

- **The owner's App content declarations are done:**
  - sign-in details;
  - ads;
  - content rating (Everyone, PEGI 3, USK 0, IARC 3+, "Users Interact");
  - target audience 13+;
  - Data safety, imported from `docs/mobile/play-data-safety.csv`;
  - Advertising ID, government, financial and health.
- **Signing:** the owner ran `android-signing.ps1`. Run #6 built the bundle, then failed its check: `jarsigner -verify -strict` exits 4 for any self-signed certificate, and upload keys are self-signed. `android.yml` now requires every signature to verify and the signer's SHA-256 to equal the upload certificate's. Run #7 passed:
  - `farbaek-1.0.0.aab`, 3,887,365 bytes, SHA-256 `3031c9f8…f502`;
  - upload certificate `6A:BE:4A:F4:…:4A:31`.
- **Closed testing, "Closed testing - Alpha":**
  - all 177 countries and the rest of the world;
  - testers from the owner's list "MY" (13 people);
  - feedback to `support@farbaek.com`.

  Release 1 (1.0.0) was uploaded after its SHA-256 was checked. Play accepted it (API 24+, target 36) with one warning: there's no deobfuscation file, and none is needed.
- **Sent for review:** 15 changes, at the owner's request to publish. Google says reviews usually take up to 7 days.
- **App links:** `src/config/android-app.ts` now names Play's app signing key `9E:7A:BB:51:…:DB:D2`, which Play signs installs with, and the upload key. So `/.well-known/assetlinks.json` claims the app, and it opens without Chrome's address bar once this is live.

### Store images, later on 2026-11-01

- **What the owner asked for:** more attractive store images, with the real platform, the logo first, and "Farbaek" instead of their name.
- **`scripts/release/store-images.mjs`** renders the real screens in phone frames on the White Signal canvas:
  - a headline and one line of text, in Geist;
  - the proof thread across every image;
  - the logo, unaltered, leading the first image.

  It makes six App Store images (1206 × 2622), six Play phone images (1080 × 1920) and a Play feature graphic (1024 × 500). All are opaque RGB, and it checks that Geist loaded first.
- **Uploaded:**
  - App Store Connect: the old six removed, the designed six added, and the copyright changed to "2026 Farbaek";
  - Google Play: the feature graphic and six phone images replaced, in order, and sent for review with the release.
- **Seller name:** the App Store's "Developer" line shows the individual account's legal name. Only an organisation account (it needs a D-U-N-S number) shows "Farbaek" there. On Google Play the developer name is the account's name, "Svanflok".

### Submitted, 2026-11-01

- **App Store:**
  - The owner published App Privacy: five data types (email, other user content, user ID, device ID, purchase history), each for App Functionality, linked to the user, with no tracking.
  - The owner added the review contact. Claude added the review notes, the header (3840 × 1646) and the search results artwork (3840 × 2560).
  - Claude added version 1.0.0 for review and submitted it. Status: **Waiting for Review**. Release is automatic after approval.
- **Google Play:**
  - Google approved and published the closed test ("Last published on November 1, 2026"). The store images were sent with it.
  - **Testers join** at https://play.google.com/apps/testing/com.farbaek.app with the Gmail address on the "MY" list, then install Farbaek from Play.
- **Microsoft Store:** in certification since 2026-10-31.

### Plans can't be drafted in production (found 2026-11-01)

- **What happened:** the review account's first build ("A one-page site for Ember & Rye…") got "AI isn't available right now" twice.
  - That is `PROVIDER_ERROR`: Anthropic refused the call outright, not a busy or overloaded answer.
  - Both tries were refunded.
  - The Anthropic account has $4.35 of credit, so an empty balance isn't the cause.
- **Diagnosing it:** Claude reading production is blocked, so `scripts/vps/check-ai.ps1` is for the owner. It sends two tiny requests from the server with its own key, one plain and one shaped like a plan draft, and prints only the HTTP status and Anthropic's error type and message. The key is never shown.
- **Logging:** `src/server/ai/anthropic.ts` now logs `anthropic.call_failed` with the call, model, status, error type and request id, so the next failure shows in the server log.
- **A security fix found by the new test:** `redact()` in `src/server/observability/log.ts` leaked secrets.
  - For patterns without groups (Anthropic, E2B and Supabase keys, JWTs), `String.replace` passes the match's offset and the whole input where groups would be.
  - The replacer echoed them back, so it wrote the original text, key included, followed by "[redacted]".
  - It now uses captured groups only when they are strings.
  - `tests/security-eval/disclosure.test.ts` covers bare keys; the security run is 36 of 36.

### Next

- **The owner:**
  - send the join link to the 13 testers. At least 12 must stay joined for 14 days, then apply for production;
  - merge #160, so `/.well-known/assetlinks.json` names Play's signing key and the app opens without Chrome's address bar.
- **Apple's review:** answer within 48 hours. If anything comes back, the email names the guideline.
- **Google Play Billing** for selling plans in the Android app, during the 14 days (ADR 0150, Consequences).
- **When the Microsoft Store passes:** set `AGENT_STORE_URL`.
