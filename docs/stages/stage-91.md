# Stage 91: Sign in with Apple everywhere

Stage 90 put Sign in with Apple in the iPhone app. This stage finishes the owner's request ("Apple register and login to Farbaek"): **Continue with Apple** on www.farbaek.com, Apple's account notices, and Apple's email relay for people who hide their email.

- **Decision record:** `docs/adr/0114-sign-in-with-apple-everywhere.md`.
- **Branch:** `feat/apple-sign-in-web`.
- **Migration:** v73 (`20261214090000_apple_sign_in_ended.sql`).

## 2026-10-29

### Done

- **The website:**
  - `/auth/apple` starts Auth's Apple flow with PKCE, rate-limited per network;
  - `/auth/callback` finishes it and says "Apple didn't finish signing you in" when it doesn't;
  - the sign-in page shows Apple's white-with-outline button, an "or with email" divider and plain notices for each failure;
  - the button shows only while Auth's authorize address really sends people to Apple under `com.farbaek.web`, checked at most every five minutes.
- **Auth's six-month secret:**
  - the app makes a 180-day ES256 secret with the Sign in with Apple key (`/api/internal/apple/web-secret`, scheduler's secret only);
  - `scripts/vps/apple-web-secret.sh` puts it into Auth's settings and restarts Auth when fewer than 60 days remain, with a 12-hour wait after a failure;
  - `farbaek-apple-secret.timer` runs it hourly, and `install.sh --enable-apple-timer` installs it.
- **Apple's account notices** (`/api/webhooks/apple-id`, `src/server/auth/apple-notifications.ts`):
  - RS256 tokens are checked against Apple's published keys, with issuer, audience and age;
  - "consent-revoked" and "account-delete" sign the person out everywhere, disconnect their phones and forget Apple's token (v73);
  - the account stays.
- **Apple's portal, done by Claude in the owner's Chrome:**
  - the Services ID `com.farbaek.web` ("Farbaek website") with Sign in with Apple, primary App ID `com.farbaek.app`, domain `api.farbaek.com`, and return URL `https://api.farbaek.com/auth/v1/callback`;
  - the Server-to-Server Notification Endpoint `https://www.farbaek.com/api/webhooks/apple-id` on `com.farbaek.app`, checked after a reload;
  - the email relay sources `farbaek.com` and `hello@farbaek.com`, both passing SPF.
- **Privacy policy:** on the website Apple offers the name and the person chooses; Apple tells Farbaek when they stop using Sign in with Apple, and Farbaek signs them out.
- **Setup:** `scripts/vps/set-apple-sign-in-web.ps1` does the server's part in one run.

### Verified

- `src/server/auth/apple-notifications.test.ts` (4), with a throwaway RSA key standing in for Apple's:
  - the signature, key id, algorithm, issuer, audience and age are all checked;
  - the event inside is read;
  - only consent-revoked and account-delete sign people out;
  - Apple's keys are read once an hour.
- `src/server/auth/apple.test.ts`: 2 new tests.
  - The web secret's subject is `com.farbaek.web` and it lasts 180 days, inside Apple's limit.
  - The readiness check needs Apple's authorize address and the website's id, and remembers its answer for 5 minutes, or 1 minute while it fails.
- `tests/db/apple-sign-in-ended.test.ts` (3, PGlite):
  - the person's sessions, phones and token go, and nobody else's;
  - their account stays;
  - an Apple id nobody has does nothing;
  - only the server can call it.

### Live in production (2026-10-29)

- **Merged:** PR #117 (`fb2f867`, with #116 inside). The owner ran `set-apple-sign-in-web.ps1`. `farbaek-apple-secret.timer` is enabled, and its first run said "renewed; good until 2027-04-27".
- **Read back:**
  - `/sign-in` shows "Continue with Apple" (`/auth/apple?next=%2Fapp`);
  - `/auth/apple` answers 303 to Auth's authorize address, with a PKCE challenge and the verifier cookie;
  - Auth answers 302 to `appleid.apple.com/auth/authorize?client_id=com.farbaek.web`;
  - Apple shows its normal "Sign in to Apple Account" page, with no client or return-address error.
- **Not tried:** a real Apple Account signing in to the website, and Apple's account notices arriving. Both need a person's Apple Account.
- **App Store:** the owner submitted the Small Business Program enrollment the same evening; Apple confirms by email. `APPLE_IAP` stays off until then.

### Not done, and why

- **The server's settings and timer:** auto mode refused Claude's attempts to change Auth's settings and to install the timer on the server. The owner runs `set-apple-sign-in-web.ps1` once after the merge. Until then the website's button stays hidden, and iPhone sign-in is unaffected.

### Next

- Sign in with Apple on www.farbaek.com with a real Apple Account, then remove Farbaek in that Apple Account's settings to see the account-notice sign-out.
- When Apple confirms the Small Business Program: switch on `APPLE_IAP` once the app's first build is out (docs/mobile/ios.md, step 8).
