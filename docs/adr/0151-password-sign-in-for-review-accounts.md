# ADR 0151: A password, only for app store review accounts

- Status: accepted (2026-11-01).
- Follows ADR 0067 (signing in with an email link) and ADR 0150 (Farbaek for Android on Google Play).

## Context

Farbaek has no passwords: people sign in with an email link, Google or Apple.

Google Play's reviewers need sign-in details for an app that requires an account. Its form says they won't create accounts or use free trials. They can't open an email link sent to an inbox that isn't theirs, and they can't sign in to someone else's Google or Apple account.

## Decision

**A separate page, `/sign-in/password`, signs in with an email address and a password.**
- **Who has a password:** only accounts the owner makes with one through `scripts/vps/add-review-account.ps1`, such as `hello@farbaek.com`. No account gets one any other way, so for everyone else the page always says the email and password don't match.
- **Where it's linked:** one line under the sign-in form, "App review account? Sign in with a password", so a reviewer can find it inside the Android app. The sign-in page still says "No password", because that's true for people.

**The same guards as the email link** (`src/server/auth/password-sign-in.ts`):
- the address must be valid, and the password 1 to 128 characters;
- Turnstile's check once it's on, verified by Auth itself;
- limits kept apart from the link's: 5 tries per email address in 15 minutes, and 20 per network address an hour. They're counted by hash, and it fails closed if the limiter can't answer;
- one answer for a wrong password, an unknown account and an account without a password, so none can be told apart.

**No new way to get a password.** There's no "set a password" or "forgot password". The owner chooses it when running the script, and keeps it in Play Console's sign-in details.

**The script.** Production's Auth runs on the VPS, with no public dashboard. `add-review-account.ps1`:
- makes a random password when the owner presses Enter: 20 letters and digits that can't be mixed up, in groups of five, about 115 bits. It's shown once, after the account exists, to paste into Play Console. A typed one is asked for twice, shown as stars, at least 12 characters;
- sends one bash script to the server over SSH on standard input, with the request in a quoted heredoc, so neither the password nor Auth's key is ever on a command line;
- calls Auth's admin API with the app's own settings, creating the account already confirmed;
- refuses an address that already has an account, so a real account never gets a password by mistake.

## Consequences

- Play's reviewers can sign in to a real account inside the Android app.
- **More to guard.** Password guessing is limited by the counts above, by Turnstile and by Auth's own limits. The review account holds only what reviewers make in it.
- **The owner's steps:** run the script, sign in once on www.farbaek.com/sign-in/password, then paste the address and password into Play Console. Claude never sees the password.
