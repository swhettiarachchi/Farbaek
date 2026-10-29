# ADR 0110: Farbaek for iPhone, a native companion signed in through the web

- Status: accepted (2026-10-29).
- Spec §17 (mobile); replaces the "iOS app: not started" row in current state.
- Builds on ADR 0099 (the Android Trusted Web Activity) and ADR 0098 (signing kept out of Claude's hands).
- Migration v70 (`supabase/migrations/20261211090000_phone_apps.sql`).

## Context

The owner asked for an iPhone app. Apple's guideline 4.2 rejects apps that only wrap a website, so the Android approach (a Trusted Web Activity) doesn't work on iOS. Farbaek's promise is control at every step, and the phone is where a person is when an agent needs them: a change to approve, a command to allow, a build that finished.

## Decision

**A native SwiftUI app** (`ios/`) that does what a phone is for:

- the approvals inbox, with every file of a change as a numbered diff, the policy's findings and the checks that will run, approved with Face ID or the passcode;
- one sentence to a plan, the plan approved with Face ID, and the agent's run followed live;
- the agent's questions ("allow `pnpm add zod`?") answered from the phone;
- tasks with their lifecycle, evidence and history;
- notifications through Apple's push service when a build finishes or its checks end.

Everything else (editing files, billing, members, settings) stays on the web. The app has no payments and no prices, as a free companion to a web service (guideline 3.1.3(f)).

**Signing in through the web, never inside the app** (`src/server/phone/auth.ts`):
1. The app opens `www.farbaek.com/auth/connect` in `ASWebAuthenticationSession` with a PKCE challenge (RFC 7636, S256), a state value and the device name. The sheet shares Safari's sign-in, so the usual email link and Turnstile apply.
2. The page says what the app can and can't do. Its form posts to `/api/v1/app/connect`, which accepts only Farbaek's own Origin and stores a one-time code (32 random bytes, kept as its SHA-256, two minutes, at most five open a person).
3. The browser goes to `/auth/connect/done`, which hands the code to `farbaek://connected`. Going through a page of our own keeps the form's redirect inside the site's `form-action 'self'` policy.
4. The app redeems the code with its verifier at `/api/v1/app/token`. Any attempt uses the code up, so a wrong verifier can't be retried.
5. The server makes the phone its own Supabase session: the admin API generates a sign-in link's hashed token (no email is sent) and verifies it at once. The session is recorded in `phone_devices`.

A link opened in another browser would sign that browser in instead of the sheet. So during a phone sign-in, the "check your inbox" state also offers "I opened the link in Safari, continue", and a field to paste the link, which finishes it in the sheet. Only Farbaek's own sign-in links are followed.

If the person connects in Safari instead (the email link opened there, so the consent page did too), the done page's `farbaek://connected` link opens the app. The app finishes the sign-in still waiting for it, when the state matches, and closes the sheet. With nothing waiting, for example after the app was closed, the app says to tap Sign in again. That takes one tap, because the web is signed in by then.

**Every request is the person, checked on every call** (`src/server/phone/api.ts`):
- The phone sends its access token. The server verifies it with `getClaims`, then looks up the session in `phone_devices`. A disconnected phone is refused at once, with `DISCONNECTED`, even while its token hasn't expired.
- Reads use `createSupabaseReader` with the person's token, so Row Level Security decides what's visible, exactly as on the web. `liveContext` (shared with `loadAppContext`) gives the same role, permissions and reasons a write is unavailable.
- Writes use the same use cases as the server actions:
  - `applyProposal` with the proposal's own content and the hash the phone showed;
  - `discardProposal`;
  - `startFromPrompt`;
  - `approveContract` then `startCloudRun`;
  - `answerRunApproval`, `sendRunMessage` and `cancelCloudRun`.
- A write that starts sandbox work runs on the phone's token. The token must outlast a run, so the server refuses a token with under 45 minutes left (`REFRESH_FIRST`), and the app refreshes and retries.
- Refreshing goes through `/api/v1/app/refresh`, which also checks the phone is still connected.
- 120 requests a minute per phone, and 20 code redemptions a minute per network address.

**Disconnecting** (Settings > Phones on the web, or Sign out in the app) marks the record revoked, drops its push token, and deletes its row in `auth.sessions`, so the refresh token stops working too. If this database can't end the Auth session, the record still refuses the phone. A person keeps at most ten phones; past that, the one used longest ago is disconnected.

**A sample to look around** (`/api/v1/app/sample/...`):
- it answers the same reads from the demo workspace, which never touches the database, with no account;
- every write is refused with `SAMPLE_READ_ONLY`, and every screen is labelled "Sample data";
- App Review uses it, since email sign-in can't be handed to a reviewer.

**Notifications** (`src/server/push/apns.ts`, `phone-notifier.ts`):
- APNs with an ES256 provider token signed by `node:crypto`, made at most every 40 minutes, over `node:http2`, with no new dependency;
- the same moments and words as email and web push, combined into `serverNotifier`;
- tokens Apple calls gone, or that fail 20 times in a row, are dropped;
- the server key is `APNS_KEY_P8` and `APNS_KEY_ID`. Until both are set, the app says notifications aren't set up yet, and nothing else changes.

**Design:**
- White Signal's colours, generated from `tokens.css` into `ios/Farbaek/Design/Tokens.swift`. `tests/design/ios-tokens.test.ts` fails if they drift apart, if a Swift file defines its own colour, or if an em dash appears.
- The same shapes (pills, 12pt inputs, 20pt cards, 28pt panels), and status as icon plus label.
- Apple's system fonts: Geist reaches the web through Google Fonts at build time and isn't bundled.
- The agent orb turns only while a run is live, and stays still under Reduce Motion.

**The contract between server and app:** `src/server/phone/fixtures.test.ts` writes the sample API's real answers to `ios/FarbaekTests/Fixtures`, and the app's tests decode them with its models. A change to an answer's shape fails the server test until the fixtures are regenerated, and then the app's tests show whether it still reads them.

**Built on GitHub's macOS runner** (`.github/workflows/ios.yml`):
- XcodeGen 2.46.0, checked against its published SHA-256, makes the project from `ios/project.yml`. No generated project is committed.
- `check` builds for the simulator and runs the tests, with no signing.
- `testflight` runs only by hand, once the owner's App Store Connect key is set. It archives with Apple's cloud-managed signing for team 65BULQ4657 and uploads to TestFlight.

## Consequences

- One server, one set of rules: the phone can't do anything the web refuses, and every new web rule applies to it the day it ships.
- **The owner's steps** (`docs/mobile/ios.md`): register the bundle ID, create the app in App Store Connect, add the App Store Connect key as secrets, make an APNs key for the server, fill in App Privacy, and submit with the sample as the review path.
- **Not verified yet:**
  - the Swift code hasn't been compiled: this PC has no Mac, and the free macOS minutes return on 1 November;
  - sign-in hasn't run against production Supabase Auth: generating and verifying a link's hashed token is Supabase's documented server-side sign-in, but the self-hosted version's answer is unchecked;
  - APNs hasn't sent to a real phone.
- **Android keeps its Trusted Web Activity** (ADR 0099). The same API and sign-in are ready if a native Android companion is wanted later.
