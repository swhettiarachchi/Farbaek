# ADR 0114: Sign in with Apple on the website, Apple's account notices, and its email relay

- Status: accepted (2026-10-29).
- Builds on ADR 0113 (Sign in with Apple in Farbaek for iPhone) and ADR 0067 (sign-in protection).
- Migration v73 (`supabase/migrations/20261214090000_apple_sign_in_ended.sql`).

## Context

ADR 0113 put Sign in with Apple in the iPhone app. The owner asked for "Apple register and login to Farbaek", and three things were still missing:

- **The website** offered only email links, so a person who signed up with Apple on iPhone had no matching way in on a computer.
- **Apple's account notices.** Apple tells an app when a person stops using Sign in with Apple with it, or deletes their Apple Account. Nothing listened.
- **Hide My Email.** Apple's private relay forwards only mail from sources the developer registers. Without that, trial and billing emails to relay addresses would never arrive.

## Decision

**The website uses Supabase Auth's own Apple flow.**
- **Apple's side:** the Services ID `com.farbaek.web`, grouped with the primary App ID `com.farbaek.app`, returns to `https://api.farbaek.com/auth/v1/callback`. Auth's flow uses the first id in `GOTRUE_EXTERNAL_APPLE_CLIENT_ID`, so that's now `com.farbaek.web,com.farbaek.app`. The id_token grant from ADR 0113 accepts both.
- **Starting it:** a plain link to `/auth/apple` asks Auth for Apple's address with PKCE and sends the browser there. Apple returns to Auth, and Auth returns to `/auth/callback`, which exchanges the one-time code as it does for email links.
  - It's a link, not a form, because the site's `form-action 'self'` policy would stop a form's redirect to Apple.
  - It's rate-limited to 20 starts per network in 10 minutes. Auth's Turnstile check doesn't cover OAuth flows, and an Apple Account is costly to make in bulk.
- **The button:** it shows only while the whole flow works. The page asks Auth's authorize address, at most every five minutes, and shows **Continue with Apple** only when the answer sends the browser to Apple under `com.farbaek.web`.
  - It uses Apple's white-with-outline style: a new `outline` button variant with the `ink` border, so it doesn't compete with the black email button.
  - The page says "No password: continue with Apple, or we email you a one-time link."
- **Auth's client secret:** it's an ES256 JWT that Apple lets live at most six months.
  - The app makes a 180-day one with the Sign in with Apple key it already holds (`POST /api/internal/apple/web-secret`, the scheduler's secret).
  - `scripts/vps/apple-web-secret.sh`, run hourly by `farbaek-apple-secret.timer`, writes it into Auth's settings and restarts Auth whenever fewer than 60 days remain. That's about every four months.
  - After a failed restart it waits 12 hours.
  - The secret never reaches a screen, a command line or a log.
- **What Apple shares:** on the website, Auth asks Apple for the email and the name. The person chooses on Apple's screen. The privacy policy says so.

**Apple's account notices** arrive at `POST /api/webhooks/apple-id`, set as the Server-to-Server Notification Endpoint on `com.farbaek.app`.
- **Checks:** the token must be signed with one of Apple's published RS256 keys (read hourly, plus at most once a minute for a key not seen yet), with issuer `https://appleid.apple.com`, audience `com.farbaek.app` or `com.farbaek.web`, and issued within the last week.
- **`consent-revoked` and `account-delete`:** these call `app_apple_sign_in_ended`, which signs the person out everywhere, disconnects their phones and forgets Apple's refresh token.
  - The account and its workspaces stay. The person can still sign in by email, and deleting the account is their choice.
  - An Apple Account deletion can't safely delete a Farbaek account that others share or that has a paid plan (ADR 0064).
- **`email-disabled` and `email-enabled`:** acknowledged, with nothing to do.

**The email relay:** `farbaek.com` and `hello@farbaek.com`, the address all of Farbaek's email comes from through Spacemail, are registered with Apple. Both pass SPF (`include:spf.spacemail.com`).

## Consequences

- **The owner's step:** after the merge, the owner runs `scripts/vps/set-apple-sign-in-web.ps1` once.
  - It sets the client id order, installs the hourly timer, makes the first secret and checks that Auth sends people to Apple.
  - Claude couldn't do this from its session, because auto mode refuses new timers and settings changes on the server.
  - Until it runs, the button stays hidden.
- **Linked accounts:** someone who signed up by email and later uses Apple with the same verified address gets one account (Auth links verified emails). With Hide My Email they get a separate account.
- **Signing out everywhere:** a `consent-revoked` notice signs out email-based sessions too, because Auth's sessions don't record how they began. That's the safe reading of a revocation.
