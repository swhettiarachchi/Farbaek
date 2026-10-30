# ADR 0115: Signing in with Google

- Status: accepted (2026-10-30).
- Builds on ADR 0114 (Sign in with Apple on the website) and ADR 0067 (sign-in protection).

## Context

The owner asked for Google login. Most people who try Farbaek already have a Google account, and on Android it's the account the phone is signed in with. Until now the website offered Apple (ADR 0114) or an email link.

## Decision

**The same path as Apple on the website.** `/auth/google` starts Supabase Auth's Google flow with PKCE, and Auth returns to `/auth/callback`, exactly like `/auth/apple`. Both now share `startOAuth` (`src/server/auth/oauth-wiring.ts`):
- a plain link starts the flow, so the site's `form-action 'self'` policy doesn't stop the redirect;
- one rate limit covers both providers: 20 starts per network in 10 minutes;
- failures come back as plain notices above the form ("Google didn't finish signing you in").

**The button shows only while the flow works.** `providerReady` (`src/server/auth/oauth.ts`) asks Auth's authorize address, at most every five minutes per provider, and offers Google only when the answer sends the browser to `accounts.google.com` under a real client id (`<number>-<key>.apps.googleusercontent.com`). Apple's check moved here from ADR 0114's code unchanged.

**On the sign-in page,** Google comes first, then Apple, then the email form after "or with email".
- Both buttons use the white `outline` style.
- Google's button carries Google's own four-colour mark, as its branding guidelines ask. It's an image file (`public/auth/google-g.svg`), so no colour outside the tokens enters the components.
- The intro names what's offered: "No password: continue with Google or Apple, or we email you a one-time link."

**The apps get it through the website.** Farbaek for iPhone signs in by email in Apple's secure sign-in sheet (ADR 0110), and Farbaek for Android is the website, so both reach the same page and the same Google button. Google allows its sign-in in those system browsers, not in embedded web views.
- `GET /api/v1/app/sign-in-options` now also answers `google`, and the iPhone app then labels its web button "Sign in with Google or email".
- No Google SDK goes into either app.
- Apple's guideline 4.8 is met, because the iPhone app offers Sign in with Apple itself (ADR 0113).

**Google's side.** The OAuth client lives in the owner's Google Cloud project "Farbaek":
- the consent screen shows Farbaek, its privacy policy and terms, and `farbaek.com`;
- it asks only for email and profile, so it needs no Google review;
- the web client's only redirect URI is `https://api.farbaek.com/auth/v1/callback`.

The owner creates the client and downloads its JSON, because Google shows the secret only then. `scripts/vps/set-google-sign-in.ps1` checks that file, saves the id and secret in Auth's settings without showing them, restarts Auth and checks that Auth sends people to Google.

**What Google shares:** the email address, the name and the profile picture's address. The privacy policy says so. An existing account with the same verified email is the same account: Auth links them.

## Consequences

- **Turnstile:** Google accounts are easier to make in bulk than Apple Accounts, and Auth's Turnstile check doesn't cover OAuth flows. The per-network limit, the platform's daily AI limit and the one-trial-per-address rule (ADR 0065) still apply. If abuse shows up, `-Off` on the setup script hides the button within five minutes.
- **Google Cloud account:** it needs 2-step verification from 1 November 2026, and the client secret should be rotated if it's ever exposed (run the script again with a new client file).
