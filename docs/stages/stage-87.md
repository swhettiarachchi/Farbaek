# Stage 87: Farbaek for iPhone

The owner asked for the mobile apps. Android already had its Trusted Web Activity (stage 76). Apple rejects website wrappers, so the iPhone app is a native SwiftUI companion: approvals, builds, live runs and notifications, on a sign-in and an API built for phones.

- **Decision record:** `docs/adr/0110-farbaek-for-iphone.md`.
- **The owner's steps:** `docs/mobile/ios.md`.
- **Branch:** `feat/iphone-app`.
- **Migration:** v70 (`20261211090000_phone_apps.sql`).

## 2026-10-29

### Done

- **Phone sign-in** (`src/server/phone/auth.ts`):
  - the `/auth/connect` consent page;
  - the connect form's post, accepted only from Farbaek's Origin;
  - `/auth/connect/done`, which hands the code to `farbaek://`;
  - code exchange with PKCE S256;
  - refresh, which checks the phone is still connected;
  - a device check on every request.
- **Signing in from another browser:** during a phone sign-in, the "check your inbox" state offers "continue" and a field to paste the email link, so a link opened outside Safari still finishes in the sheet.
- **Migration v70:**
  - `phone_connect_codes` (two minutes, single use, used up by any attempt) and `phone_devices`;
  - people read their own phones' names, never sessions or push tokens;
  - disconnecting deletes the phone's `auth.sessions` row;
  - at most ten phones a person.
- **`/api/v1/app`** (`src/server/phone/api.ts`), one router:
  - reads: me, home, approvals with numbered diffs, tasks, a task's story, the plan, runs and their questions, projects;
  - writes: approve and discard, build from a prompt, approve the plan and start the agent, answer, message and stop a run, the push token, sign out;
  - `liveContext` is now shared with `loadAppContext`, so the phone gets the web's roles, permissions and reasons a write is unavailable;
  - `cloudRunDeps` and `verificationDeps` accept a phone's own access token, which must have 45 minutes left.
- **The sample** (`/api/v1/app/sample/...`): the demo workspace, read-only, no account, labelled on every screen.
- **Settings > Phones** on the web, with Disconnect.
- **APNs** (`src/server/push/apns.ts`):
  - an ES256 provider token and HTTP/2, with no new dependency;
  - joined to email and web push in `serverNotifier`;
  - `scripts/vps/set-apns.ps1` saves the owner's key.
- **The app** (`ios/`, SwiftUI, iOS 17 and up, iPhone only):
  - Welcome, Today, Approvals with the review and the diff, Build, the plan, the live run, Tasks, the task's story, and You;
  - Face ID or the passcode before approving a change, approving a plan or allowing a command;
  - the session in the Keychain, refreshed before it expires;
  - notifications, with taps opening the task.
- **Design:**
  - `scripts/ios-tokens.mjs` writes `Tokens.swift` from `tokens.css`;
  - the icon and logo come from `scripts/brand-assets.mjs`, the icon flattened on the artwork's white for the App Store;
  - a privacy manifest.
- **Builds:**
  - `ios/project.yml` for XcodeGen 2.46.0, pinned by SHA-256;
  - `.github/workflows/ios.yml`: simulator build and unit tests, a sample tour that saves App Store screenshots once production has the API, and a TestFlight upload by hand.

### Verified

- **PGlite** (`tests/db/phone-apps.test.ts`, 10 tests). The test caught a real bug: raising an error undid using up the code, so the function now returns no row instead. It covers:
  - single-use codes, used up by a wrong verifier, and expiry;
  - five open codes a person;
  - the device check;
  - disconnecting ends the Auth session, and nobody else can disconnect a phone;
  - ten phones a person;
  - push tokens moving between phones and dropped when gone or failing;
  - grants.
- **Unit:**
  - sign-in (9): Origin check, code hashing, PKCE, refresh, a disconnected phone;
  - the API (11): the sample's reads and refusals, the full approval with diff lines, auth, a workspace the person isn't in, write checks before any use case, the 45-minute token rule, connecting end to end, sign out, notifications not set up;
  - APNs (5): the key from the environment, an ES256 signature checked with the public key, Apple's answers, payload size, every phone told.
- **The contract:** `fixtures.test.ts` writes the sample API's real answers to `ios/FarbaekTests/Fixtures`, and the Swift tests decode them. It's stable across runs.
- **Design:** `ios-tokens.test.ts` checks the colours equal the tokens, no Swift file makes its own colour, and no em dashes appear.
- **Existing tests:** design, workspace, cloud agent, verification and email (361 tests) are unchanged.
- **Swift:** reviewed by hand for compile errors. Three were fixed: `try` in a ternary, a `String?` and `NSNull` with no common type, and a heavy `String` plus `Substring` chain. `Tab` was renamed `AppTab`, away from SwiftUI's own `Tab`.

### In production

- **v70:** applied before the merge with its hash checked (ff17a46b…e79808). The read-back showed:
  - seven `app_phone_*` functions;
  - row security on both tables;
  - the function owner can delete from `auth.sessions`, so Disconnect ends a phone's sign-in.
- **PR #110:** merged; production serves `fa3d1e9`. Checked live:
  - `/api/v1/app/sample/me` and `/sample/approvals` answer;
  - `/api/v1/app/me` without a token gets 401;
  - `/auth/connect` sends a signed-out browser to sign in and back;
  - a connect post from another Origin is refused;
  - a made-up code gets `INVALID_GRANT`, which means the v70 functions answer through PostgREST.
- **The iPhone workflow:** it ran on the push and the merge. GitHub didn't start its job ("recent account payments have failed or your spending limit needs to be increased"): the minutes block until 1 November, not the code.

### Not verified yet

- **The Swift compile and the app's tests:** this PC has no Mac, and GitHub's free macOS minutes return on 1 November. The first run of `ios.yml` is the first compile.
- **Sign-in against production Supabase Auth:** the server makes the phone's session from a generated link's hashed token, Supabase's documented server-side sign-in. The first real sign-in from TestFlight checks it.
- **APNs to a real iPhone:** this needs the owner's key and a TestFlight build.

### Next

- Apply v70 in production before the merge, checked against its hash.
- After 1 November, run `ios.yml` by hand, fix whatever the compiler finds, and keep the screenshots.
- The owner's steps 1 to 7 in `docs/mobile/ios.md`.
